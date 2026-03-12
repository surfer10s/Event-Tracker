const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const SongCache = require('../models/songcache');
const UserMusicTaste = require('../models/usermusictaste');
const { autoImportArtistsAsFavorites } = require('../controllers/userController');
const apiTracker = require('../services/apiusagetracker');
const activityTracker = require('../services/activitytracker');
const spotifyFetch = apiTracker.trackedFetch('spotify');

// ============================================
// Auth Middleware
// ============================================

const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('+spotifyMusic');
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ============================================
// OAuth Routes
// ============================================

// Start OAuth flow - redirect user to Spotify
router.get('/auth/spotify', (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: 'Authentication token required' });
  }

  const scopes = [
    'user-library-read',
    'playlist-modify-public',
    'playlist-modify-private',
    'playlist-read-private',
    'user-read-private',
    'user-follow-read'
  ].join(' ');

  const authUrl = 'https://accounts.spotify.com/authorize?' +
    new URLSearchParams({
      client_id: process.env.SPOTIFY_CLIENT_ID,
      response_type: 'code',
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
      scope: scopes,
      state: token
    });

  res.redirect(authUrl);
});

// OAuth callback
router.get('/auth/spotify/callback', async (req, res) => {
  const { code, error, state } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || '';

  if (error) {
    console.error('Spotify OAuth error:', error);
    return res.redirect(`${frontendUrl}/account-details.html?spotify_error=${error}`);
  }

  if (!state) {
    return res.redirect(`${frontendUrl}/account-details.html?spotify_error=missing_state`);
  }

  try {
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.redirect(`${frontendUrl}/account-details.html?spotify_error=user_not_found`);
    }

    // Exchange code for tokens (Spotify uses Basic auth header)
    const tokenResponse = await spotifyFetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(
          process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
        ).toString('base64')
      },
      body: new URLSearchParams({
        code: code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      console.error('Spotify token exchange error:', tokens);
      return res.redirect(`${frontendUrl}/account-details.html?spotify_error=${tokens.error}`);
    }

    // Fetch user profile for display name
    let profileInfo = {};
    try {
      const profileRes = await spotifyFetch('https://api.spotify.com/v1/me', {
        headers: { 'Authorization': `Bearer ${tokens.access_token}` }
      });
      const profile = await profileRes.json();
      profileInfo = {
        spotifyUserId: profile.id,
        displayName: profile.display_name || profile.id
      };
    } catch (profileError) {
      console.error('Failed to get Spotify profile:', profileError);
    }

    user.spotifyMusic = {
      connected: true,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + (tokens.expires_in * 1000)),
      spotifyUserId: profileInfo.spotifyUserId,
      displayName: profileInfo.displayName,
      connectedAt: new Date()
    };

    user.markModified('spotifyMusic');
    await user.save();

    console.log(`Spotify connected for user ${user.username}`);
    activityTracker.track('oauth.spotify_connect', { userId: user._id });

    // Auto-sync music taste in background (don't block redirect)
    performSpotifyMusicSync(user, 'auto_connect').catch(err => {
      console.error(`Auto-sync Spotify music taste failed for ${user.username}:`, err.message);
    });

    res.redirect(`${frontendUrl}/account-details.html?spotify_connected=true&syncing=true`);

  } catch (err) {
    console.error('Spotify OAuth failed:', err);
    res.redirect(`${frontendUrl}/account-details.html?spotify_error=auth_failed`);
  }
});

// ============================================
// Status & Connection
// ============================================

router.get('/api/spotify/status', authenticateUser, async (req, res) => {
  const user = req.user;

  const isConnected = user.spotifyMusic?.connected === true || !!user.spotifyMusic?.accessToken;

  if (isConnected && user.spotifyMusic?.accessToken) {
    res.json({
      connected: true,
      displayName: user.spotifyMusic.displayName,
      connectedAt: user.spotifyMusic.connectedAt
    });
  } else {
    res.json({ connected: false });
  }
});

router.post('/api/spotify/disconnect', authenticateUser, async (req, res) => {
  const user = req.user;

  user.spotifyMusic = {
    connected: false,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    spotifyUserId: null,
    displayName: null,
    connectedAt: null
  };

  user.markModified('spotifyMusic');
  await user.save();

  activityTracker.track('oauth.spotify_disconnect', { userId: user._id });
  res.json({ success: true, message: 'Spotify disconnected' });
});

// ============================================
// Token Management
// ============================================

async function getValidSpotifyToken(user) {
  if (!user.spotifyMusic?.connected || !user.spotifyMusic?.accessToken) {
    throw new Error('Spotify not connected');
  }

  // Check if token is expired (with 5 min buffer)
  const expiresAt = user.spotifyMusic.expiresAt ? new Date(user.spotifyMusic.expiresAt) : new Date(0);
  if (Date.now() >= expiresAt.getTime() - 300000) {
    if (!user.spotifyMusic.refreshToken) {
      throw new Error('Token expired and no refresh token available. Please reconnect Spotify.');
    }

    const response = await spotifyFetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(
          process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
        ).toString('base64')
      },
      body: new URLSearchParams({
        refresh_token: user.spotifyMusic.refreshToken,
        grant_type: 'refresh_token'
      })
    });

    const tokens = await response.json();

    if (tokens.error) {
      throw new Error('Failed to refresh Spotify token: ' + tokens.error);
    }

    user.spotifyMusic.accessToken = tokens.access_token;
    user.spotifyMusic.expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));
    // Spotify may return a new refresh token
    if (tokens.refresh_token) {
      user.spotifyMusic.refreshToken = tokens.refresh_token;
    }
    user.markModified('spotifyMusic');
    await user.save();

    console.log(`Spotify token refreshed for user ${user.username}`);
  }

  return user.spotifyMusic.accessToken;
}

// ============================================
// Helper: Spotify API request with pagination
// ============================================

async function spotifyGetAll(accessToken, url, limit = 50) {
  const items = [];
  let nextUrl = url.includes('?') ? `${url}&limit=${limit}` : `${url}?limit=${limit}`;

  while (nextUrl) {
    const res = await spotifyFetch(nextUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const data = await res.json();

    if (data.error) {
      throw new Error(data.error.message || 'Spotify API error');
    }

    // Handle different response shapes
    if (data.items) {
      items.push(...data.items);
    } else if (data.artists && data.artists.items) {
      // /me/following returns { artists: { items: [...], next: ... } }
      items.push(...data.artists.items);
      nextUrl = data.artists.next;
      continue;
    }

    nextUrl = data.next || null;
  }

  return items;
}

// ============================================
// Music Taste Sync
// ============================================

// Core Spotify music taste sync logic (used by both manual trigger and auto-sync on connect)
async function performSpotifyMusicSync(user, source = 'manual') {
    const accessToken = await getValidSpotifyToken(user);
    const artistMap = {}; // name -> { videoCount, sources }

    // 1. Followed artists
    console.log(`[${source}] Fetching Spotify followed artists for ${user.username}...`);
    try {
      const followed = await spotifyGetAll(accessToken, 'https://api.spotify.com/v1/me/following?type=artist');
      for (const artist of followed) {
        const name = artist.name;
        if (!artistMap[name]) {
          artistMap[name] = { name, videoCount: 0, sources: [] };
        }
        artistMap[name].videoCount += 1;
        if (!artistMap[name].sources.includes('spotify_follow')) {
          artistMap[name].sources.push('spotify_follow');
        }
      }
      console.log(`Found ${followed.length} followed artists`);
    } catch (err) {
      console.error('Error fetching followed artists:', err.message);
    }

    // 2. Saved tracks (liked songs)
    console.log('Fetching Spotify saved tracks...');
    try {
      const savedTracks = await spotifyGetAll(accessToken, 'https://api.spotify.com/v1/me/tracks');
      for (const item of savedTracks) {
        const track = item.track;
        if (!track || !track.artists) continue;
        for (const artist of track.artists) {
          const name = artist.name;
          if (!artistMap[name]) {
            artistMap[name] = { name, videoCount: 0, sources: [] };
          }
          artistMap[name].videoCount += 1;
          if (!artistMap[name].sources.includes('spotify_saved')) {
            artistMap[name].sources.push('spotify_saved');
          }
        }
      }
      console.log(`Processed ${savedTracks.length} saved tracks`);
    } catch (err) {
      console.error('Error fetching saved tracks:', err.message);
    }

    // 3. Playlist tracks
    console.log('Fetching Spotify playlists...');
    try {
      const playlists = await spotifyGetAll(accessToken, 'https://api.spotify.com/v1/me/playlists');
      // Only process user's own playlists (not followed ones)
      const ownPlaylists = playlists.filter(p => p.owner?.id === user.spotifyMusic.spotifyUserId);
      console.log(`Found ${ownPlaylists.length} owned playlists out of ${playlists.length} total`);

      for (const playlist of ownPlaylists) {
        try {
          const tracks = await spotifyGetAll(accessToken, `https://api.spotify.com/v1/playlists/${playlist.id}/tracks`);
          for (const item of tracks) {
            const track = item.track;
            if (!track || !track.artists) continue;
            for (const artist of track.artists) {
              const name = artist.name;
              if (!artistMap[name]) {
                artistMap[name] = { name, videoCount: 0, sources: [] };
              }
              artistMap[name].videoCount += 1;
              if (!artistMap[name].sources.includes('spotify_playlist')) {
                artistMap[name].sources.push('spotify_playlist');
              }
            }
          }
        } catch (playlistErr) {
          console.error(`Error fetching playlist ${playlist.name}:`, playlistErr.message);
        }
      }
    } catch (err) {
      console.error('Error fetching playlists:', err.message);
    }

    // Save to UserMusicTaste
    const artistsData = Object.values(artistMap);
    const totalProcessed = artistsData.reduce((sum, a) => sum + a.videoCount, 0);

    if (artistsData.length > 0) {
      const userTaste = await UserMusicTaste.addArtists(user._id, artistsData);

      // Update sync history
      userTaste.lastSyncedAt = new Date();
      userTaste.totalVideosProcessed = (userTaste.totalVideosProcessed || 0) + totalProcessed;
      userTaste.syncHistory.push({
        syncedAt: new Date(),
        videosProcessed: totalProcessed,
        artistsFound: artistsData.length,
        source
      });
      await userTaste.save();
    }

    console.log(`[${source}] Spotify sync complete: ${artistsData.length} artists from ${totalProcessed} items`);

    // Auto-import followed artists as favorites
    let autoImport = null;
    try {
      const followedNames = Object.values(artistMap)
        .filter(a => a.sources.includes('spotify_follow'))
        .map(a => a.name);

      if (followedNames.length > 0) {
        autoImport = await autoImportArtistsAsFavorites(user._id, followedNames);
      }
    } catch (importErr) {
      console.error('Auto-import after Spotify sync failed:', importErr.message);
    }

    return {
      success: true,
      artistCount: artistsData.length,
      totalProcessed,
      autoImport
    };
}

router.post('/api/spotify/sync-music-taste', authenticateUser, async (req, res) => {
  try {
    const result = await performSpotifyMusicSync(req.user, 'manual');
    activityTracker.track('sync.spotify_music_taste', { userId: req.user._id, metadata: { artistCount: result.totalArtists || 0 } });
    res.json(result);

  } catch (error) {
    console.error('Spotify sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Track Search (with SongCache)
// ============================================

router.get('/api/spotify/search', authenticateUser, async (req, res) => {
  try {
    const { artist, title, skipCache } = req.query;
    const user = req.user;

    if (!artist || !title) {
      return res.status(400).json({ error: 'artist and title query parameters required' });
    }

    // Check cache first (unless skipCache)
    if (skipCache !== 'true') {
      const cached = await SongCache.findSpotifyTrack(artist, title);
      if (cached) {
        console.log(`Spotify cache HIT: "${artist} - ${title}"`);
        return res.json({
          items: [{
            trackId: cached.spotify.trackId,
            trackUri: cached.spotify.trackUri,
            trackName: cached.spotify.trackName,
            artistName: cached.spotify.artistName,
            albumName: cached.spotify.albumName
          }],
          fromCache: true
        });
      }
    }

    // Search Spotify
    const accessToken = await getValidSpotifyToken(user);
    const query = `track:${title} artist:${artist}`;

    const searchRes = await spotifyFetch(
      'https://api.spotify.com/v1/search?' + new URLSearchParams({
        q: query,
        type: 'track',
        limit: '1'
      }),
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    const searchData = await searchRes.json();

    if (searchData.error) {
      throw new Error(searchData.error.message);
    }

    if (searchData.tracks?.items?.length > 0) {
      const track = searchData.tracks.items[0];
      const trackData = {
        trackId: track.id,
        trackUri: track.uri,
        trackName: track.name,
        artistName: track.artists.map(a => a.name).join(', '),
        albumName: track.album?.name
      };

      // Cache the result
      await SongCache.cacheSpotifyTrack(artist, title, trackData);
      console.log(`Spotify cache MISS, cached: "${artist} - ${title}" → ${track.id}`);

      return res.json({
        items: [trackData],
        fromCache: false
      });
    }

    res.json({ items: [], fromCache: false });

  } catch (error) {
    console.error('Spotify search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Playlist Management
// ============================================

// List user's playlists
router.get('/api/spotify/playlists', authenticateUser, async (req, res) => {
  try {
    const accessToken = await getValidSpotifyToken(req.user);

    const playlistRes = await spotifyFetch('https://api.spotify.com/v1/me/playlists?limit=50', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const data = await playlistRes.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    res.json({
      success: true,
      playlists: (data.items || []).map(p => ({
        id: p.id,
        name: p.name,
        trackCount: p.tracks?.total || 0,
        url: p.external_urls?.spotify
      }))
    });
  } catch (error) {
    console.error('Spotify playlists error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create playlist and add songs from setlist
router.post('/api/spotify/create-playlist-with-songs', authenticateUser, async (req, res) => {
  try {
    const { title, description, songs } = req.body;

    if (!title || !songs || !Array.isArray(songs)) {
      return res.status(400).json({ error: 'title and songs array required' });
    }

    const user = req.user;
    const accessToken = await getValidSpotifyToken(user);

    // 1. Create playlist
    const createRes = await spotifyFetch('https://api.spotify.com/v1/me/playlists', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: title,
        description: description || '',
        public: false
      })
    });

    const playlist = await createRes.json();

    if (playlist.error) {
      throw new Error(playlist.error.message || playlist.error.status || 'Failed to create playlist');
    }

    console.log(`Created Spotify playlist: "${title}" (${playlist.id})`);

    // 2. Search for each song and collect URIs
    const results = [];
    const trackUris = [];

    for (const song of songs) {
      try {
        let trackData = null;
        let fromCache = false;

        // Check cache first
        const cached = await SongCache.findSpotifyTrack(song.artist, song.title);
        if (cached) {
          trackData = {
            trackId: cached.spotify.trackId,
            trackUri: cached.spotify.trackUri,
            trackName: cached.spotify.trackName,
            artistName: cached.spotify.artistName
          };
          fromCache = true;
        }

        if (!trackData) {
          // Search Spotify
          const query = `track:${song.title} artist:${song.artist}`;
          const searchRes = await spotifyFetch(
            'https://api.spotify.com/v1/search?' + new URLSearchParams({
              q: query,
              type: 'track',
              limit: '1'
            }),
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          );

          const searchData = await searchRes.json();

          if (searchData.error) {
            throw new Error(searchData.error.message);
          }

          if (searchData.tracks?.items?.length > 0) {
            const track = searchData.tracks.items[0];
            trackData = {
              trackId: track.id,
              trackUri: track.uri,
              trackName: track.name,
              artistName: track.artists.map(a => a.name).join(', ')
            };

            // Cache for next time
            await SongCache.cacheSpotifyTrack(song.artist, song.title, {
              trackId: track.id,
              trackUri: track.uri,
              trackName: track.name,
              artistName: trackData.artistName,
              albumName: track.album?.name
            });
          }

          // If primary search fails for covers, try original artist
          if (!trackData && song.isCover && song.originalArtist) {
            const fallbackQuery = `track:${song.title} artist:${song.originalArtist}`;
            const fallbackRes = await spotifyFetch(
              'https://api.spotify.com/v1/search?' + new URLSearchParams({
                q: fallbackQuery,
                type: 'track',
                limit: '1'
              }),
              { headers: { 'Authorization': `Bearer ${accessToken}` } }
            );

            const fallbackData = await fallbackRes.json();

            if (fallbackData.tracks?.items?.length > 0) {
              const track = fallbackData.tracks.items[0];
              trackData = {
                trackId: track.id,
                trackUri: track.uri,
                trackName: track.name,
                artistName: track.artists.map(a => a.name).join(', ')
              };

              await SongCache.cacheSpotifyTrack(song.originalArtist, song.title, {
                trackId: track.id,
                trackUri: track.uri,
                trackName: track.name,
                artistName: trackData.artistName,
                albumName: track.album?.name
              });
            }
          }
        }

        if (trackData) {
          trackUris.push(trackData.trackUri);
          results.push({ song: song.title, status: 'found', fromCache, trackName: trackData.trackName });
        } else {
          results.push({ song: song.title, status: 'not_found' });
        }
      } catch (songError) {
        console.error(`Error searching for "${song.title}":`, songError.message);
        results.push({ song: song.title, status: 'error', error: songError.message });
      }
    }

    // 3. Add tracks to playlist in batches of 100
    if (trackUris.length > 0) {
      for (let i = 0; i < trackUris.length; i += 100) {
        const batch = trackUris.slice(i, i + 100);
        const addRes = await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlist.id}/items`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ uris: batch })
        });

        const addData = await addRes.json();
        if (addData.error) {
          console.error(`Error adding batch ${i / 100 + 1}:`, addData.error.message);
        }
      }
    }

    const addedCount = results.filter(r => r.status === 'found').length;
    const failedCount = results.filter(r => r.status !== 'found').length;
    const cachedCount = results.filter(r => r.fromCache).length;

    console.log(`Spotify playlist "${title}": ${addedCount} added, ${failedCount} failed, ${cachedCount} from cache`);

    res.json({
      success: true,
      playlistId: playlist.id,
      playlistUrl: playlist.external_urls?.spotify,
      addedCount,
      failedCount,
      cachedCount,
      results
    });

  } catch (error) {
    console.error('Spotify create playlist error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
