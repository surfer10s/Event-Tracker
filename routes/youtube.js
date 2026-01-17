const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const SongCache = require('../models/SongCache');
const UserMusicTaste = require('../models/UserMusicTaste');
const { requireAdmin } = require('../middleware/adminAuth');

// ============================================
// Auth Middleware
// ============================================

// Middleware to verify JWT and get user
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user with YouTube tokens (select all youtubeMusic fields)
    const user = await User.findById(decoded.id).select('+youtubeMusic');
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

// Start OAuth flow - redirect user to Google
// Include state parameter with user's JWT for callback
router.get('/auth/youtube', (req, res) => {
  const { token } = req.query; // User's JWT token passed as query param
  
  if (!token) {
    return res.status(400).json({ error: 'Authentication token required' });
  }

  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID,
      redirect_uri: process.env.YOUTUBE_REDIRECT_URI,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/youtube',
      access_type: 'offline',
      prompt: 'consent',
      state: token // Pass JWT in state to identify user in callback
    });

  res.redirect(authUrl);
});

// OAuth callback - Google redirects here after user authorizes
router.get('/auth/youtube/callback', async (req, res) => {
  const { code, error, state } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || '';  // e.g., 'http://localhost:3000' or empty for same origin

  if (error) {
    console.error('YouTube OAuth error:', error);
    return res.redirect(`${frontendUrl}/account-details.html?youtube_error=` + error);
  }

  if (!state) {
    return res.redirect(`${frontendUrl}/account-details.html?youtube_error=missing_state`);
  }

  try {
    // Verify JWT from state parameter to get user
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.redirect(`${frontendUrl}/account-details.html?youtube_error=user_not_found`);
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code,
        client_id: process.env.YOUTUBE_CLIENT_ID,
        client_secret: process.env.YOUTUBE_CLIENT_SECRET,
        redirect_uri: process.env.YOUTUBE_REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      console.error('Token exchange error:', tokens);
      return res.redirect(`${frontendUrl}/account-details.html?youtube_error=` + tokens.error);
    }

    // Get channel info to display to user
    let channelInfo = {};
    try {
      const channelResponse = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        { headers: { 'Authorization': `Bearer ${tokens.access_token}` } }
      );
      const channelData = await channelResponse.json();
      if (channelData.items && channelData.items.length > 0) {
        channelInfo = {
          channelId: channelData.items[0].id,
          channelTitle: channelData.items[0].snippet.title
        };
      }
    } catch (channelError) {
      console.error('Failed to get channel info:', channelError);
    }

    // Save tokens to user document
    user.youtubeMusic = {
      connected: true,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + (tokens.expires_in * 1000)),
      channelId: channelInfo.channelId,
      channelTitle: channelInfo.channelTitle,
      connectedAt: new Date()
    };

    // Mark the field as modified to ensure Mongoose saves it
    user.markModified('youtubeMusic');
    
    await user.save();

    console.log(`YouTube connected for user ${user.username}`);
    console.log('Saved youtubeMusic:', JSON.stringify(user.youtubeMusic, null, 2));
    res.redirect(`${frontendUrl}/account-details.html?youtube_connected=true`);

  } catch (err) {
    console.error('YouTube OAuth failed:', err);
    res.redirect(`${frontendUrl}/account-details.html?youtube_error=auth_failed`);
  }
});

// Check connection status (authenticated)
router.get('/api/youtube/status', authenticateUser, async (req, res) => {
  const user = req.user;
  
  // Debug logging
  console.log('YouTube status check for user:', user.username);
  console.log('youtubeMusic object:', JSON.stringify(user.youtubeMusic, null, 2));
  
  // Check if connected - either by connected flag OR by having an accessToken
  const isConnected = user.youtubeMusic?.connected === true || !!user.youtubeMusic?.accessToken;
  
  if (isConnected && user.youtubeMusic?.accessToken) {
    const isExpired = user.youtubeMusic.expiresAt && new Date() >= user.youtubeMusic.expiresAt;
    res.json({ 
      connected: true, 
      expired: isExpired,
      hasRefreshToken: !!user.youtubeMusic.refreshToken,
      channelTitle: user.youtubeMusic.channelTitle,
      connectedAt: user.youtubeMusic.connectedAt
    });
  } else {
    res.json({ connected: false });
  }
});

// Disconnect YouTube (authenticated)
router.post('/api/youtube/disconnect', authenticateUser, async (req, res) => {
  const user = req.user;
  
  user.youtubeMusic = {
    connected: false,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    channelId: null,
    channelTitle: null,
    connectedAt: null
  };
  
  await user.save();
  
  res.json({ success: true, message: 'YouTube disconnected' });
});

// ============================================
// Token Management
// ============================================

// Refresh access token if expired
async function getValidAccessToken(user) {
  if (!user.youtubeMusic?.connected || !user.youtubeMusic?.accessToken) {
    throw new Error('YouTube not connected');
  }

  // Check if token is expired (with 5 min buffer)
  const expiresAt = user.youtubeMusic.expiresAt ? new Date(user.youtubeMusic.expiresAt) : new Date(0);
  if (Date.now() >= expiresAt.getTime() - 300000) {
    if (!user.youtubeMusic.refreshToken) {
      throw new Error('Token expired and no refresh token available. Please reconnect YouTube.');
    }

    // Refresh the token
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.YOUTUBE_CLIENT_ID,
        client_secret: process.env.YOUTUBE_CLIENT_SECRET,
        refresh_token: user.youtubeMusic.refreshToken,
        grant_type: 'refresh_token'
      })
    });

    const tokens = await response.json();

    if (tokens.error) {
      throw new Error('Failed to refresh token: ' + tokens.error);
    }

    // Update user's tokens
    user.youtubeMusic.accessToken = tokens.access_token;
    user.youtubeMusic.expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));
    await user.save();

    console.log(`YouTube token refreshed for user ${user.username}`);
  }

  return user.youtubeMusic.accessToken;
}

// ============================================
// Helper Functions
// ============================================

// Search YouTube and cache result
async function searchAndCache(accessToken, artist, title) {
  const searchQuery = `${artist} ${title} official audio`;
  
  const response = await fetch(
    'https://www.googleapis.com/youtube/v3/search?' +
    new URLSearchParams({
      part: 'snippet',
      q: searchQuery,
      type: 'video',
      videoCategoryId: '10',
      maxResults: '1'
    }),
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  if (data.items && data.items.length > 0) {
    const video = data.items[0];
    
    // Cache the result with platform = 'youtube'
    await SongCache.cacheVideo(artist, title, {
      videoId: video.id.videoId,
      videoTitle: video.snippet.title,
      channelTitle: video.snippet.channelTitle,
      thumbnailUrl: video.snippet.thumbnails?.default?.url,
      searchQuery: searchQuery
    }, 'youtube');
    
    console.log(`Cached NEW: "${artist} - ${title}" → ${video.id.videoId}`);
    
    return {
      videoId: video.id.videoId,
      videoTitle: video.snippet.title,
      fromCache: false
    };
  }
  
  return null;
}

// Add video to playlist with lazy invalidation
// If cached video fails, invalidates cache, re-searches, and retries
// Helper to check if error is transient and retryable
function isRetryableError(error) {
  const retryableReasons = ['SERVICE_UNAVAILABLE', 'ABORTED', 'backendError', 'internalError'];
  const reason = error?.errors?.[0]?.reason;
  const status = error?.status;
  return retryableReasons.includes(reason) || status === 'ABORTED' || status === 'UNAVAILABLE';
}

// Helper to add video with retry for transient errors
async function addVideoToPlaylist(accessToken, playlistId, videoId, maxRetries = 2) {
  let lastError = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      console.log(`Retry attempt ${attempt} for video ${videoId}...`);
      await new Promise(resolve => setTimeout(resolve, 1500 * attempt)); // Backoff: 1.5s, 3s
    }
    
    const response = await fetch(
      'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          snippet: {
            playlistId: playlistId,
            resourceId: { kind: 'youtube#video', videoId: videoId }
          }
        })
      }
    );
    
    const data = await response.json();
    
    if (!data.error) {
      return { success: true, data };
    }
    
    lastError = data.error;
    
    // Only retry on transient errors
    if (!isRetryableError(data.error)) {
      return { success: false, error: data.error };
    }
    
    console.log(`Transient error (${data.error.errors?.[0]?.reason}), will retry...`);
  }
  
  console.log(`All ${maxRetries + 1} attempts failed for video ${videoId}`);
  return { success: false, error: lastError };
}

// Add video to playlist with lazy invalidation
// If cached video fails, invalidates cache, re-searches, and retries
async function addVideoToPlaylistWithRetry(accessToken, playlistId, artist, title) {
  // First, check cache (with platform = 'youtube')
  let cached = await SongCache.findVideo(artist, title, 'youtube');
  let videoId = cached?.youtube?.videoId || cached?.videoId; // Support both new and legacy
  let videoTitle = cached?.youtube?.videoTitle || cached?.videoTitle;
  let fromCache = !!cached && !!videoId;
  let quotaUsed = 0;

  // If not cached, search YouTube
  if (!videoId) {
    const searchResult = await searchAndCache(accessToken, artist, title);
    if (searchResult) {
      videoId = searchResult.videoId;
      videoTitle = searchResult.videoTitle;
      fromCache = false;
      quotaUsed += 100; // Search cost
    }
  }

  if (!videoId) {
    return { success: false, error: 'No video found', quotaUsed };
  }

  // Try to add to playlist with retry for transient errors
  const addResult = await addVideoToPlaylist(accessToken, playlistId, videoId);
  quotaUsed += 50; // Insert cost

  // Check if video was not found (deleted/unavailable)
  if (!addResult.success) {
    const errorReason = addResult.error?.errors?.[0]?.reason;
    
    // Video not found - invalidate cache and retry once
    if (fromCache && (errorReason === 'videoNotFound' || errorReason === 'notFound' || 
        addResult.error?.message?.includes('video cannot be found'))) {
      
      console.log(`Video unavailable, invalidating cache for "${artist} - ${title}"`);
      await SongCache.invalidateByVideoId(videoId);
      
      // Re-search YouTube
      const newSearchResult = await searchAndCache(accessToken, artist, title);
      quotaUsed += 100; // New search cost
      
      if (newSearchResult) {
        // Retry add with new video (also with transient error retry)
        const retryResult = await addVideoToPlaylist(accessToken, playlistId, newSearchResult.videoId);
        quotaUsed += 50; // Retry insert cost
        
        if (!retryResult.success) {
          return { success: false, error: retryResult.error?.message, quotaUsed };
        }
        
        console.log(`Retry SUCCESS: "${artist} - ${title}" → ${newSearchResult.videoId}`);
        return {
          success: true,
          videoId: newSearchResult.videoId,
          videoTitle: newSearchResult.videoTitle,
          fromCache: false,
          wasRetried: true,
          quotaUsed
        };
      }
      
      return { success: false, error: 'No replacement video found', quotaUsed };
    }
    
    // Other error (quota, etc.)
    return { success: false, error: addResult.error?.message, quotaUsed };
  }

  // Success on first try
  return {
    success: true,
    videoId,
    videoTitle,
    fromCache,
    wasRetried: false,
    quotaUsed
  };
}

// ============================================
// Playlist Routes (all authenticated)
// ============================================

// Get user's existing playlists
router.get('/api/youtube/playlists', authenticateUser, async (req, res) => {
  try {
    const accessToken = await getValidAccessToken(req.user);

    const response = await fetch(
      'https://www.googleapis.com/youtube/v3/playlists?' +
      new URLSearchParams({
        part: 'snippet,contentDetails',
        mine: 'true',
        maxResults: '50'
      }),
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    res.json(data);

  } catch (err) {
    console.error('Failed to get playlists:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create a new playlist
router.post('/api/youtube/playlists', authenticateUser, async (req, res) => {
  const { title, description, privacyStatus } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Playlist title is required' });
  }

  try {
    const accessToken = await getValidAccessToken(req.user);

    const response = await fetch(
      'https://www.googleapis.com/youtube/v3/playlists?part=snippet,status',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          snippet: {
            title: title,
            description: description || ''
          },
          status: {
            privacyStatus: privacyStatus || 'private'
          }
        })
      }
    );

    const playlist = await response.json();

    if (playlist.error) {
      throw new Error(playlist.error.message);
    }

    res.json(playlist);

  } catch (err) {
    console.error('Failed to create playlist:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete a playlist
router.delete('/api/youtube/playlists/:playlistId', authenticateUser, async (req, res) => {
  const { playlistId } = req.params;

  try {
    const accessToken = await getValidAccessToken(req.user);

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/playlists?id=${playlistId}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    if (response.status === 204) {
      res.json({ success: true, message: 'Playlist deleted' });
    } else {
      const data = await response.json();
      throw new Error(data.error?.message || 'Failed to delete playlist');
    }

  } catch (err) {
    console.error('Failed to delete playlist:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Playlist Items Routes
// ============================================

// Get videos in a playlist
router.get('/api/youtube/playlists/:playlistId/items', authenticateUser, async (req, res) => {
  const { playlistId } = req.params;
  const { pageToken } = req.query;

  try {
    const accessToken = await getValidAccessToken(req.user);

    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      playlistId: playlistId,
      maxResults: '50'
    });

    if (pageToken) {
      params.append('pageToken', pageToken);
    }

    const response = await fetch(
      'https://www.googleapis.com/youtube/v3/playlistItems?' + params,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    res.json(data);

  } catch (err) {
    console.error('Failed to get playlist items:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add a video to a playlist
// Supports lazy invalidation: if artist+title are provided and video fails,
// invalidates cache and returns videoUnavailable flag for frontend to re-search
// Now includes retry logic for transient YouTube errors
router.post('/api/youtube/playlists/:playlistId/items', authenticateUser, async (req, res) => {
  const { playlistId } = req.params;
  const { videoId, artist, title } = req.body;

  if (!videoId) {
    return res.status(400).json({ error: 'Video ID is required' });
  }

  try {
    const accessToken = await getValidAccessToken(req.user);

    // Use retry helper for transient errors
    const result = await addVideoToPlaylist(accessToken, playlistId, videoId);

    if (!result.success) {
      console.error('YouTube API error adding to playlist:', result.error);
      const errorReason = result.error?.errors?.[0]?.reason;
      
      // Check for quota exceeded
      if (errorReason === 'quotaExceeded') {
        return res.status(429).json({ 
          error: 'YouTube API quota exceeded. Try again tomorrow.',
          quotaExceeded: true 
        });
      }
      
      // Video not found - invalidate cache if artist+title provided
      if (artist && title && (errorReason === 'videoNotFound' || errorReason === 'notFound' ||
          result.error?.message?.includes('video cannot be found'))) {
        
        console.log(`Video ${videoId} unavailable, invalidating cache for "${artist} - ${title}"`);
        await SongCache.invalidateByVideoId(videoId);
        
        return res.status(404).json({
          error: 'Video unavailable',
          videoUnavailable: true,
          message: 'Cached video no longer available. Please re-search.'
        });
      }
      
      throw new Error(result.error?.message || 'Failed to add video');
    }

    res.json(result.data);

  } catch (err) {
    console.error('Failed to add video to playlist:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Remove a video from a playlist
router.delete('/api/youtube/playlist-items/:itemId', authenticateUser, async (req, res) => {
  const { itemId } = req.params;

  try {
    const accessToken = await getValidAccessToken(req.user);

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?id=${itemId}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    if (response.status === 204) {
      res.json({ success: true, message: 'Video removed from playlist' });
    } else {
      const data = await response.json();
      throw new Error(data.error?.message || 'Failed to remove video');
    }

  } catch (err) {
    console.error('Failed to remove video from playlist:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Search Routes
// ============================================

// Search for videos (useful for finding songs)
// Now checks cache first to save quota!
router.get('/api/youtube/search', authenticateUser, async (req, res) => {
  const { q, maxResults, artist, title, skipCache } = req.query;

  if (!q && !(artist && title)) {
    return res.status(400).json({ error: 'Search query or artist+title is required' });
  }

  try {
    // If artist and title provided, check cache first
    if (artist && title && !skipCache) {
      const cached = await SongCache.findVideo(artist, title, 'youtube');
      if (cached) {
        // Support both new and legacy structure
        const videoId = cached.youtube?.videoId || cached.videoId;
        const videoTitle = cached.youtube?.videoTitle || cached.videoTitle;
        const channelTitle = cached.youtube?.channelTitle || cached.channelTitle;
        const thumbnailUrl = cached.youtube?.thumbnailUrl || cached.thumbnailUrl;
        
        console.log(`Cache HIT: "${artist} - ${title}" → ${videoId}`);
        return res.json({
          items: [{
            id: { videoId: videoId },
            snippet: {
              title: videoTitle,
              channelTitle: channelTitle,
              thumbnails: { default: { url: thumbnailUrl } }
            }
          }],
          fromCache: true,
          cacheStats: { useCount: cached.useCount }
        });
      }
      console.log(`Cache MISS: "${artist} - ${title}" - searching YouTube...`);
    }

    const accessToken = await getValidAccessToken(req.user);
    const searchQuery = q || `${artist} ${title} official audio`;

    const response = await fetch(
      'https://www.googleapis.com/youtube/v3/search?' +
      new URLSearchParams({
        part: 'snippet',
        q: searchQuery,
        type: 'video',
        videoCategoryId: '10', // Music category
        maxResults: maxResults || '10'
      }),
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    const data = await response.json();

    if (data.error) {
      console.error('YouTube API error:', data.error);
      // Check for quota exceeded
      if (data.error.errors?.[0]?.reason === 'quotaExceeded') {
        return res.status(429).json({ 
          error: 'YouTube API quota exceeded. Try again tomorrow.',
          quotaExceeded: true 
        });
      }
      throw new Error(data.error.message);
    }

    // Cache the first result if artist and title were provided
    if (artist && title && data.items && data.items.length > 0) {
      const video = data.items[0];
      await SongCache.cacheVideo(artist, title, {
        videoId: video.id.videoId,
        videoTitle: video.snippet.title,
        channelTitle: video.snippet.channelTitle,
        thumbnailUrl: video.snippet.thumbnails?.default?.url,
        searchQuery: searchQuery
      }, 'youtube');
      console.log(`Cached: "${artist} - ${title}" → ${video.id.videoId}`);
    }

    res.json({ ...data, fromCache: false });

  } catch (err) {
    console.error('Search failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Search specifically for a song (artist + title)
router.get('/api/youtube/search-song', authenticateUser, async (req, res) => {
  const { artist, title } = req.query;

  if (!artist || !title) {
    return res.status(400).json({ error: 'Artist and title are required' });
  }

  try {
    const accessToken = await getValidAccessToken(req.user);

    // Build search query optimized for finding official audio/video
    const searchQuery = `${artist} ${title} official audio`;

    const response = await fetch(
      'https://www.googleapis.com/youtube/v3/search?' +
      new URLSearchParams({
        part: 'snippet',
        q: searchQuery,
        type: 'video',
        videoCategoryId: '10',
        maxResults: '5'
      }),
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    res.json(data);

  } catch (err) {
    console.error('Song search failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Bulk Operations (useful for setlists)
// ============================================

// Create playlist and add multiple songs
router.post('/api/youtube/create-playlist-with-songs', authenticateUser, async (req, res) => {
  const { title, description, songs } = req.body;
  // songs should be an array of { artist, title } objects

  if (!title || !songs || !Array.isArray(songs)) {
    return res.status(400).json({ 
      error: 'Playlist title and songs array are required' 
    });
  }

  try {
    const accessToken = await getValidAccessToken(req.user);

    // Step 1: Create the playlist
    const playlistResponse = await fetch(
      'https://www.googleapis.com/youtube/v3/playlists?part=snippet,status',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          snippet: {
            title: title,
            description: description || ''
          },
          status: {
            privacyStatus: 'private'
          }
        })
      }
    );

    const playlist = await playlistResponse.json();

    if (playlist.error) {
      throw new Error(playlist.error.message);
    }

    const playlistId = playlist.id;
    const results = {
      playlist: playlist,
      added: [],
      failed: []
    };

    // Step 2: Search and add each song
    for (const song of songs) {
      try {
        // Search for the song
        const searchQuery = `${song.artist} ${song.title} official audio`;
        const searchResponse = await fetch(
          'https://www.googleapis.com/youtube/v3/search?' +
          new URLSearchParams({
            part: 'snippet',
            q: searchQuery,
            type: 'video',
            videoCategoryId: '10',
            maxResults: '1'
          }),
          {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }
        );

        const searchData = await searchResponse.json();

        if (searchData.items && searchData.items.length > 0) {
          const videoId = searchData.items[0].id.videoId;

          // Add to playlist
          const addResponse = await fetch(
            'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet',
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                snippet: {
                  playlistId: playlistId,
                  resourceId: {
                    kind: 'youtube#video',
                    videoId: videoId
                  }
                }
              })
            }
          );

          const addData = await addResponse.json();

          if (addData.error) {
            results.failed.push({ 
              song: song, 
              error: addData.error.message 
            });
          } else {
            results.added.push({
              song: song,
              videoId: videoId,
              videoTitle: searchData.items[0].snippet.title
            });
          }
        } else {
          results.failed.push({ 
            song: song, 
            error: 'No video found' 
          });
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (songError) {
        results.failed.push({ 
          song: song, 
          error: songError.message 
        });
      }
    }

    res.json(results);

  } catch (err) {
    console.error('Failed to create playlist with songs:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Cache Management Routes
// ============================================

// Get cache statistics
router.get('/api/youtube/cache/stats', authenticateUser, async (req, res) => {
  try {
    const stats = await SongCache.getStats();
    res.json(stats);
  } catch (err) {
    console.error('Failed to get cache stats:', err);
    res.status(500).json({ error: err.message });
  }
});

// Pre-check which songs are cached (saves quota by avoiding unnecessary searches)
router.post('/api/youtube/cache/check', authenticateUser, async (req, res) => {
  const { songs } = req.body; // Array of { artist, title }
  
  if (!songs || !Array.isArray(songs)) {
    return res.status(400).json({ error: 'Songs array is required' });
  }

  try {
    const results = {
      cached: [],
      notCached: [],
      quotaSaved: 0
    };

    for (const song of songs) {
      const cached = await SongCache.findVideo(song.artist, song.title);
      if (cached) {
        results.cached.push({
          artist: song.artist,
          title: song.title,
          videoId: cached.videoId,
          videoTitle: cached.videoTitle
        });
        results.quotaSaved += 100; // Each cached hit saves 100 quota units
      } else {
        results.notCached.push({
          artist: song.artist,
          title: song.title
        });
      }
    }

    console.log(`Cache check: ${results.cached.length} cached, ${results.notCached.length} need search`);
    res.json(results);

  } catch (err) {
    console.error('Cache check failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Batch add songs to playlist with caching
// More efficient: checks cache first, only searches when needed
router.post('/api/youtube/playlists/:playlistId/batch-add', authenticateUser, async (req, res) => {
  const { playlistId } = req.params;
  const { songs } = req.body; // Array of { artist, title }

  if (!songs || !Array.isArray(songs)) {
    return res.status(400).json({ error: 'Songs array is required' });
  }

  try {
    const accessToken = await getValidAccessToken(req.user);
    const results = {
      added: [],
      failed: [],
      cacheHits: 0,
      cacheInvalidations: 0,
      quotaUsed: 0
    };

    for (const song of songs) {
      try {
        // Use helper function with lazy invalidation
        const result = await addVideoToPlaylistWithRetry(
          accessToken, 
          playlistId, 
          song.artist, 
          song.title
        );
        
        results.quotaUsed += result.quotaUsed;
        
        if (result.success) {
          if (result.fromCache) results.cacheHits++;
          if (result.wasRetried) results.cacheInvalidations++;
          
          results.added.push({
            artist: song.artist,
            title: song.title,
            videoId: result.videoId,
            videoTitle: result.videoTitle,
            fromCache: result.fromCache,
            wasRetried: result.wasRetried
          });
        } else {
          // Check for quota exceeded
          if (result.error?.includes('quota') || result.error?.includes('Quota')) {
            return res.status(429).json({
              ...results,
              error: 'YouTube API quota exceeded',
              quotaExceeded: true,
              partialSuccess: true
            });
          }
          
          results.failed.push({
            artist: song.artist,
            title: song.title,
            error: result.error
          });
        }

        // Small delay between operations
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (songError) {
        // Check for quota exceeded
        if (songError.message?.includes('quota') || songError.message?.includes('Quota')) {
          return res.status(429).json({
            ...results,
            error: 'YouTube API quota exceeded',
            quotaExceeded: true,
            partialSuccess: true
          });
        }
        
        results.failed.push({
          artist: song.artist,
          title: song.title,
          error: songError.message
        });
      }
    }

    console.log(`Batch add complete: ${results.added.length} added, ${results.failed.length} failed, ${results.cacheHits} cache hits, ${results.cacheInvalidations} invalidations, ${results.quotaUsed} quota used`);
    res.json(results);

  } catch (err) {
    console.error('Batch add failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Search cache only (no API call)
router.get('/api/youtube/cache/search', authenticateUser, async (req, res) => {
  const { artist, title, q } = req.query;

  try {
    if (artist && title) {
      const cached = await SongCache.findVideo(artist, title);
      if (cached) {
        return res.json({ found: true, video: cached });
      }
      return res.json({ found: false });
    }

    // General search through cache
    if (q) {
      const regex = new RegExp(q, 'i');
      const results = await SongCache.find({
        $or: [
          { artist: regex },
          { title: regex },
          { videoTitle: regex }
        ]
      }).limit(20).sort({ useCount: -1 });

      return res.json({ results });
    }

    res.status(400).json({ error: 'Artist+title or search query required' });

  } catch (err) {
    console.error('Cache search failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Admin Cache Seeding (Manual - No API Quota!)
// ============================================

// Manually add a single song to cache
router.post('/api/youtube/cache/seed', authenticateUser, async (req, res) => {
  const { artist, title, videoId, videoTitle } = req.body;

  if (!artist || !title || !videoId) {
    return res.status(400).json({ 
      error: 'artist, title, and videoId are required',
      example: {
        artist: 'Arcade Fire',
        title: 'Wake Up',
        videoId: 'ojF6Uo7Wp9c',
        videoTitle: 'Arcade Fire - Wake Up (Official Video)' // optional
      }
    });
  }

  try {
    const cached = await SongCache.cacheVideo(artist, title, {
      videoId,
      videoTitle: videoTitle || `${artist} - ${title}`,
      channelTitle: 'Manual seed',
      searchQuery: 'manual'
    });

    console.log(`Cache SEEDED: "${artist} - ${title}" → ${videoId}`);
    res.json({ 
      success: true, 
      message: `Cached "${artist} - ${title}"`,
      entry: cached
    });

  } catch (err) {
    console.error('Cache seed failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Bulk seed cache from array
router.post('/api/youtube/cache/seed-bulk', authenticateUser, async (req, res) => {
  const { songs } = req.body;

  if (!songs || !Array.isArray(songs)) {
    return res.status(400).json({ 
      error: 'songs array is required',
      example: {
        songs: [
          { artist: 'Arcade Fire', title: 'Wake Up', videoId: 'ojF6Uo7Wp9c' },
          { artist: 'Arcade Fire', title: 'Rebellion (Lies)', videoId: 'MQvZ4N1RfS8' }
        ]
      }
    });
  }

  try {
    const results = { added: [], failed: [] };

    for (const song of songs) {
      if (!song.artist || !song.title || !song.videoId) {
        results.failed.push({ ...song, error: 'Missing required fields' });
        continue;
      }

      try {
        await SongCache.cacheVideo(song.artist, song.title, {
          videoId: song.videoId,
          videoTitle: song.videoTitle || `${song.artist} - ${song.title}`,
          channelTitle: 'Manual seed',
          searchQuery: 'manual'
        });
        results.added.push({ artist: song.artist, title: song.title, videoId: song.videoId });
      } catch (err) {
        results.failed.push({ ...song, error: err.message });
      }
    }

    console.log(`Bulk seed complete: ${results.added.length} added, ${results.failed.length} failed`);
    res.json(results);

  } catch (err) {
    console.error('Bulk seed failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// User Music Taste Import (Background Data Collection)
// ============================================

// Helper to extract artist name and song title from video
function extractArtistAndTitleFromVideo(video) {
  const title = video.snippet?.title || '';
  const channelTitle = video.snippet?.videoOwnerChannelTitle || video.snippet?.channelTitle || '';
  const videoId = video.snippet?.resourceId?.videoId || video.id?.videoId || video.id;
  
  let artist = null;
  let songTitle = null;
  
  // Pattern: "Artist - Song Title"
  const dashMatch = title.match(/^([^-–—]+)\s*[-–—]\s*(.+)/);
  if (dashMatch) {
    const potentialArtist = dashMatch[1].trim();
    // Filter out common non-artist prefixes
    if (!potentialArtist.match(/^(official|music|video|audio|lyric|hd|hq|4k)/i)) {
      artist = potentialArtist;
      songTitle = dashMatch[2].trim()
        .replace(/\s*\(official\s*(video|audio|music\s*video)?\)/i, '')
        .replace(/\s*\[official\s*(video|audio|music\s*video)?\]/i, '')
        .replace(/\s*\|.*$/, '')  // Remove everything after |
        .replace(/\s*(HD|HQ|4K|Official|Audio|Video|Lyrics?)$/i, '')
        .trim();
    }
  }
  
  // Pattern: "Song by Artist"
  if (!artist) {
    const byMatch = title.match(/^(.+)\s+by\s+([^([\]]+)/i);
    if (byMatch) {
      songTitle = byMatch[1].trim();
      artist = byMatch[2].trim();
    }
  }
  
  // Fall back to channel name for artist
  if (!artist) {
    artist = channelTitle
      .replace(/\s*[-–—]\s*Topic$/i, '')  // YouTube Music auto-generated channels
      .replace(/\s*VEVO$/i, '')
      .replace(/\s*Official$/i, '')
      .replace(/\s*Music$/i, '')
      .trim();
    // Use full title as song title, cleaned up
    songTitle = title
      .replace(/\s*\(official\s*(video|audio|music\s*video)?\)/i, '')
      .replace(/\s*\[official\s*(video|audio|music\s*video)?\]/i, '')
      .replace(/\s*(HD|HQ|4K|Official|Audio|Video|Lyrics?)$/i, '')
      .trim();
  }
  
  return {
    artist: artist || null,
    songTitle: songTitle || null,
    videoId: videoId || null,
    videoTitle: title,
    channelTitle: channelTitle
  };
}

// Legacy helper for backward compatibility
function extractArtistFromVideo(video) {
  return extractArtistAndTitleFromVideo(video).artist;
}

// Sync user's music taste from YouTube (manual trigger)
router.post('/api/youtube/sync-music-taste', authenticateUser, async (req, res) => {
  try {
    if (!req.user.youtubeMusic?.accessToken) {
      return res.status(400).json({ error: 'YouTube Music not connected' });
    }
    
    const accessToken = await getValidAccessToken(req.user);
    const artistCounts = {}; // { artistName: { count, sources: Set } }
    const videosToCache = []; // Collect videos for caching
    let totalVideos = 0;
    let quotaUsed = 0;
    
    // 1. Fetch Liked Music playlist (special playlist ID: LL)
    console.log(`Syncing music taste for user ${req.user.username}...`);
    
    try {
      let nextPageToken = null;
      do {
        const likedUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
        likedUrl.searchParams.set('part', 'snippet');
        likedUrl.searchParams.set('playlistId', 'LL');
        likedUrl.searchParams.set('maxResults', '50');
        if (nextPageToken) likedUrl.searchParams.set('pageToken', nextPageToken);
        
        const likedRes = await fetch(likedUrl.toString(), {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const likedData = await likedRes.json();
        quotaUsed += 1;
        
        if (likedData.error) {
          console.log('Could not fetch liked videos:', likedData.error.message);
          break;
        }
        
        for (const item of likedData.items || []) {
          const extracted = extractArtistAndTitleFromVideo(item);
          if (extracted.artist) {
            if (!artistCounts[extracted.artist]) {
              artistCounts[extracted.artist] = { count: 0, sources: new Set() };
            }
            artistCounts[extracted.artist].count++;
            artistCounts[extracted.artist].sources.add('liked');
            totalVideos++;
            
            // Collect for caching if we have all required fields
            if (extracted.songTitle && extracted.videoId) {
              videosToCache.push(extracted);
            }
          }
        }
        
        nextPageToken = likedData.nextPageToken;
      } while (nextPageToken);
      
      console.log(`Processed liked videos, found ${Object.keys(artistCounts).length} artists so far`);
    } catch (err) {
      console.log('Error fetching liked videos:', err.message);
    }
    
    // 2. Fetch user's playlists
    try {
      let nextPageToken = null;
      const playlistIds = [];
      
      do {
        const playlistsUrl = new URL('https://www.googleapis.com/youtube/v3/playlists');
        playlistsUrl.searchParams.set('part', 'snippet');
        playlistsUrl.searchParams.set('mine', 'true');
        playlistsUrl.searchParams.set('maxResults', '50');
        if (nextPageToken) playlistsUrl.searchParams.set('pageToken', nextPageToken);
        
        const playlistsRes = await fetch(playlistsUrl.toString(), {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const playlistsData = await playlistsRes.json();
        quotaUsed += 1;
        
        if (playlistsData.error) {
          console.log('Could not fetch playlists:', playlistsData.error.message);
          break;
        }
        
        for (const playlist of playlistsData.items || []) {
          playlistIds.push(playlist.id);
        }
        
        nextPageToken = playlistsData.nextPageToken;
      } while (nextPageToken);
      
      console.log(`Found ${playlistIds.length} user playlists`);
      
      // 3. Fetch items from each playlist
      for (const playlistId of playlistIds) {
        let nextPageToken = null;
        do {
          const itemsUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
          itemsUrl.searchParams.set('part', 'snippet');
          itemsUrl.searchParams.set('playlistId', playlistId);
          itemsUrl.searchParams.set('maxResults', '50');
          if (nextPageToken) itemsUrl.searchParams.set('pageToken', nextPageToken);
          
          const itemsRes = await fetch(itemsUrl.toString(), {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          const itemsData = await itemsRes.json();
          quotaUsed += 1;
          
          if (itemsData.error) {
            console.log(`Could not fetch playlist ${playlistId}:`, itemsData.error.message);
            break;
          }
          
          for (const item of itemsData.items || []) {
            const extracted = extractArtistAndTitleFromVideo(item);
            if (extracted.artist) {
              if (!artistCounts[extracted.artist]) {
                artistCounts[extracted.artist] = { count: 0, sources: new Set() };
              }
              artistCounts[extracted.artist].count++;
              artistCounts[extracted.artist].sources.add('playlist');
              totalVideos++;
              
              // Collect for caching if we have all required fields
              if (extracted.songTitle && extracted.videoId) {
                videosToCache.push(extracted);
              }
            }
          }
          
          nextPageToken = itemsData.nextPageToken;
        } while (nextPageToken);
      }
    } catch (err) {
      console.log('Error fetching playlists:', err.message);
    }
    
    // 4. Cache videos to SongCache (no extra quota!)
    let cachedCount = 0;
    let skippedCount = 0;
    
    for (const video of videosToCache) {
      try {
        // Check if already cached
        const existing = await SongCache.findVideo(video.artist, video.songTitle);
        if (!existing) {
          await SongCache.cacheVideo(video.artist, video.songTitle, {
            videoId: video.videoId,
            videoTitle: video.videoTitle,
            channelTitle: video.channelTitle,
            searchQuery: 'user-library-import'
          });
          cachedCount++;
        } else {
          skippedCount++;
        }
      } catch (err) {
        // Skip on error, don't break the sync
        console.log(`Failed to cache ${video.artist} - ${video.songTitle}: ${err.message}`);
      }
    }
    
    console.log(`Cached ${cachedCount} new songs, skipped ${skippedCount} existing`);
    
    // 5. Convert to array and save
    const artistsArray = Object.entries(artistCounts).map(([name, data]) => ({
      name,
      videoCount: data.count,
      sources: Array.from(data.sources)
    }));
    
    // Save to database
    let userTaste = await UserMusicTaste.findOne({ userId: req.user._id });
    if (!userTaste) {
      userTaste = new UserMusicTaste({ userId: req.user._id, artists: [] });
    }
    
    // Clear and rebuild (full sync)
    userTaste.artists = artistsArray.map(a => ({
      name: a.name,
      videoCount: a.videoCount,
      sources: a.sources,
      firstSeen: new Date(),
      lastSeen: new Date()
    }));
    userTaste.lastSyncedAt = new Date();
    userTaste.totalVideosProcessed = totalVideos;
    userTaste.syncHistory.push({
      syncedAt: new Date(),
      videosProcessed: totalVideos,
      artistsFound: artistsArray.length,
      source: 'manual'
    });
    
    await userTaste.save();
    
    console.log(`Music taste sync complete: ${artistsArray.length} artists from ${totalVideos} videos, cached ${cachedCount} songs (${quotaUsed} quota used)`);
    
    res.json({
      success: true,
      artistsFound: artistsArray.length,
      totalVideosProcessed: totalVideos,
      songsCached: cachedCount,
      songsSkipped: skippedCount,
      quotaUsed,
      topArtists: artistsArray
        .sort((a, b) => b.videoCount - a.videoCount)
        .slice(0, 20)
    });
    
  } catch (err) {
    console.error('Music taste sync failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get user's music taste stats
router.get('/api/youtube/music-taste', authenticateUser, async (req, res) => {
  try {
    const userTaste = await UserMusicTaste.findOne({ userId: req.user._id });
    
    if (!userTaste) {
      return res.json({
        synced: false,
        message: 'Music taste not yet synced'
      });
    }
    
    const topArtists = userTaste.artists
      .sort((a, b) => b.videoCount - a.videoCount)
      .slice(0, 50);
    
    res.json({
      synced: true,
      lastSyncedAt: userTaste.lastSyncedAt,
      totalArtists: userTaste.artists.length,
      totalVideosProcessed: userTaste.totalVideosProcessed,
      topArtists,
      syncHistory: userTaste.syncHistory.slice(-5)
    });
    
  } catch (err) {
    console.error('Failed to get music taste:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get all users' music taste stats (for future notifications)
router.get('/api/youtube/music-taste/all-stats', authenticateUser, async (req, res) => {
  try {
    const stats = await UserMusicTaste.aggregate([
      {
        $project: {
          userId: 1,
          artistCount: { $size: '$artists' },
          totalVideos: '$totalVideosProcessed',
          lastSyncedAt: 1
        }
      }
    ]);
    
    // Get unique artists across all users (count each user only once per artist)
    const allArtists = await UserMusicTaste.aggregate([
      { $unwind: '$artists' },
      { $group: { 
        _id: { 
          artist: { $toLower: '$artists.name' },
          userId: '$userId'  // Group by artist AND user first
        }, 
        name: { $first: '$artists.name' },
        videoCount: { $sum: '$artists.videoCount' }
      }},
      { $group: {
        _id: '$_id.artist',
        name: { $first: '$name' },
        userCount: { $sum: 1 },  // Now count unique users
        totalPlays: { $sum: '$videoCount' }
      }},
      { $sort: { userCount: -1, totalPlays: -1 } },
      { $limit: 100 }
    ]);
    
    res.json({
      totalUsers: stats.length,
      userStats: stats,
      topArtistsAcrossUsers: allArtists
    });
    
  } catch (err) {
    console.error('Failed to get all music taste stats:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get usernames for user IDs
router.get('/api/youtube/music-taste/users', authenticateUser, async (req, res) => {
  try {
    const { ids } = req.query;
    if (!ids) {
      return res.status(400).json({ error: 'ids parameter required' });
    }
    
    const userIds = ids.split(',');
    const users = await User.find({ _id: { $in: userIds } }).select('_id username');
    
    const userMap = {};
    for (const user of users) {
      userMap[user._id.toString()] = user.username;
    }
    
    res.json({ users: userMap });
    
  } catch (err) {
    console.error('Failed to get usernames:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get specific user's music taste
router.get('/api/youtube/music-taste/user/:userId', authenticateUser, async (req, res) => {
  try {
    const { userId } = req.params;
    const userTaste = await UserMusicTaste.findOne({ userId });
    
    if (!userTaste) {
      return res.json({
        artists: [],
        totalVideosProcessed: 0,
        lastSyncedAt: null
      });
    }
    
    res.json({
      artists: userTaste.artists.sort((a, b) => b.videoCount - a.videoCount),
      totalVideosProcessed: userTaste.totalVideosProcessed,
      lastSyncedAt: userTaste.lastSyncedAt,
      syncHistory: userTaste.syncHistory
    });
    
  } catch (err) {
    console.error('Failed to get user music taste:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin: Find users who have a specific artist
router.get('/api/youtube/music-taste/artist-users', authenticateUser, async (req, res) => {
  try {
    const { artist } = req.query;
    if (!artist) {
      return res.status(400).json({ error: 'artist parameter required' });
    }
    
    // Find all users with this artist
    const usersWithArtist = await UserMusicTaste.aggregate([
      { $unwind: '$artists' },
      { $match: { 'artists.name': { $regex: new RegExp(`^${artist}$`, 'i') } } },
      { $project: {
        userId: 1,
        artistName: '$artists.name',
        videoCount: '$artists.videoCount',
        sources: '$artists.sources'
      }}
    ]);
    
    // Get usernames
    const userIds = usersWithArtist.map(u => u.userId);
    const users = await User.find({ _id: { $in: userIds } }).select('_id username');
    
    const userMap = {};
    for (const user of users) {
      userMap[user._id.toString()] = user.username;
    }
    
    const results = usersWithArtist.map(u => ({
      userId: u.userId.toString(),
      username: userMap[u.userId.toString()] || null,
      videoCount: u.videoCount,
      sources: u.sources
    }));
    
    res.json({ 
      artist,
      userCount: results.length,
      users: results 
    });
    
  } catch (err) {
    console.error('Failed to find users for artist:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Admin Portal Routes for Music Taste
// ============================================

// GET /api/v1/music-taste/admin/summary - Get overall summary stats
router.get('/api/music-taste/admin/summary', requireAdmin, async (req, res) => {
    try {
        const musicTasteRecords = await UserMusicTaste.find({});
        
        const totalUsers = musicTasteRecords.length;
        let totalArtists = 0;
        const uniqueArtistsSet = new Set();
        
        for (const record of musicTasteRecords) {
            const artists = record.artists || [];
            totalArtists += artists.length;
            artists.forEach(a => uniqueArtistsSet.add(a.name.toLowerCase().trim()));
        }
        
        res.json({
            success: true,
            summary: {
                totalUsers,
                totalArtists,
                uniqueArtists: uniqueArtistsSet.size,
                avgArtistsPerUser: totalUsers > 0 ? totalArtists / totalUsers : 0
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/v1/music-taste/admin/top-artists - Get most popular artists
router.get('/api/music-taste/admin/top-artists', requireAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 24;
        const musicTasteRecords = await UserMusicTaste.find({});
        
        const artistCounts = new Map();
        
        for (const record of musicTasteRecords) {
            for (const artist of record.artists || []) {
                const nameLower = artist.name.toLowerCase().trim();
                if (artistCounts.has(nameLower)) {
                    artistCounts.get(nameLower).count++;
                } else {
                    artistCounts.set(nameLower, { name: artist.name, count: 1 });
                }
            }
        }
        
        const topArtists = Array.from(artistCounts.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
        
        res.json({ success: true, artists: topArtists });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/v1/music-taste/admin/users - Get all users with music taste
router.get('/api/music-taste/admin/users', requireAdmin, async (req, res) => {
    try {
        const musicTasteRecords = await UserMusicTaste.find({})
            .populate('userId', 'username firstName lastName email')
            .sort({ lastSyncedAt: -1 });
        
        const users = musicTasteRecords.map(mt => ({
            userId: mt.userId?._id || mt.userId,
            username: mt.userId?.username || 'Unknown',
            firstName: mt.userId?.firstName,
            lastName: mt.userId?.lastName,
            artistCount: mt.artists?.length || 0,
            lastSync: mt.lastSyncedAt
        }));
        
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/v1/music-taste/admin/user/:userId - Get specific user's music taste
router.get('/api/music-taste/admin/user/:userId', requireAdmin, async (req, res) => {
    try {
        const musicTaste = await UserMusicTaste.findOne({ userId: req.params.userId });
        
        if (!musicTaste) {
            return res.status(404).json({ success: false, error: 'Music taste not found' });
        }
        
        res.json({ success: true, musicTaste });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;