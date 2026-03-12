// User Controller - Favorites management and profile updates
const User = require('../models/user');
const Artist = require('../models/artist');
const ticketmasterService = require('../services/ticketmasterService');
const { geocodeAddress } = require('../services/geocodingService');

// Add artist to favorites by Ticketmaster ID
// This will create the artist in database if it doesn't exist
exports.addFavoriteArtistByTicketmasterId = async (req, res) => {
  try {
    const { ticketmasterId } = req.params;
    const { name, genre, images } = req.body;

    // Find or create artist in database
    let artist = await Artist.findOne({
      'externalIds.ticketmaster': ticketmasterId
    });

    if (!artist) {
      // Artist doesn't exist, create it
      artist = await Artist.create({
        name: name,
        externalIds: {
          ticketmaster: ticketmasterId
        },
        genre: genre ? [genre] : [],
        images: {
          large: images?.[0]?.url,
          medium: images?.[1]?.url,
          thumbnail: images?.[2]?.url
        },
        tourStatus: 'unknown',
        lastUpdated: new Date()
      });

      // Fetch and save artist's events in background
      fetchArtistEventsInBackground(ticketmasterId);
    }

    const user = await User.findById(req.user.id);

    // Check if already favorited
    if (user.favoriteArtists.includes(artist._id)) {
      return res.status(400).json({
        success: false,
        message: 'Artist already in favorites'
      });
    }

    user.favoriteArtists.push(artist._id);
    await user.save();

    // Update artist followers count
    artist.stats.followers = await User.countDocuments({
      favoriteArtists: artist._id
    });
    await artist.save();

    res.json({
      success: true,
      message: 'Artist added to favorites',
      artist: {
        id: artist._id,
        name: artist.name,
        genre: artist.genre,
        images: artist.images
      }
    });

  } catch (error) {
    console.error('Add favorite error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding favorite',
      error: error.message
    });
  }
};

// Add artist to favorites (existing method - by MongoDB ID)
exports.addFavoriteArtist = async (req, res) => {
  try {
    const { artistId } = req.params;

    // Check if artist exists
    const artist = await Artist.findById(artistId);
    if (!artist) {
      return res.status(404).json({
        success: false,
        message: 'Artist not found'
      });
    }

    const user = await User.findById(req.user.id);

    // Check if already favorited
    if (user.favoriteArtists.includes(artistId)) {
      return res.status(400).json({
        success: false,
        message: 'Artist already in favorites'
      });
    }

    user.favoriteArtists.push(artistId);
    await user.save();

    // Update artist followers count
    artist.stats.followers = await User.countDocuments({
      favoriteArtists: artistId
    });
    await artist.save();

    res.json({
      success: true,
      message: 'Artist added to favorites',
      favoriteArtists: user.favoriteArtists
    });

  } catch (error) {
    console.error('Add favorite error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding favorite',
      error: error.message
    });
  }
};

// Remove artist from favorites
exports.removeFavoriteArtist = async (req, res) => {
  try {
    const { artistId } = req.params;

    const user = await User.findById(req.user.id);

    user.favoriteArtists = user.favoriteArtists.filter(
      id => id.toString() !== artistId
    );
    await user.save();

    // Update artist followers count
    const artist = await Artist.findById(artistId);
    if (artist) {
      artist.stats.followers = await User.countDocuments({
        favoriteArtists: artistId
      });
      await artist.save();
    }

    res.json({
      success: true,
      message: 'Artist removed from favorites',
      favoriteArtists: user.favoriteArtists
    });

  } catch (error) {
    console.error('Remove favorite error:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing favorite',
      error: error.message
    });
  }
};

// Get user's favorite artists
exports.getFavoriteArtists = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('favoriteArtists', 'name genre images tourStatus stats tourDates');

    // Update tour dates for each artist
    const Event = require('../models/event');
    
    const artistsWithDates = await Promise.all(
      user.favoriteArtists.map(async (artist) => {
        // Get next show
        const nextShow = await Event.findOne({
          artist: artist._id,
          date: { $gte: new Date() }
        })
        .sort({ date: 1 })
        .select('date');
        
        // Get last show
        const lastShow = await Event.findOne({
          artist: artist._id,
          date: { $lt: new Date() }
        })
        .sort({ date: -1 })
        .select('date');
        
        // Update artist tourDates if changed
        const artistObj = artist.toObject();
        artistObj.tourDates = {
          nextShow: nextShow?.date,
          lastShow: lastShow?.date
        };
        
        // Update in DB for next time
        if (nextShow || lastShow) {
          await Artist.findByIdAndUpdate(artist._id, {
            'tourDates.nextShow': nextShow?.date,
            'tourDates.lastShow': lastShow?.date
          });
        }
        
        return artistObj;
      })
    );

    res.json({
      success: true,
      count: artistsWithDates.length,
      artists: artistsWithDates
    });

  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching favorites',
      error: error.message
    });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const { 
      firstName, lastName, mobileNumber, smsOptIn,
      streetAddress, city, state, zipcode, county 
    } = req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Track if address changed (for geocoding)
    const addressChanged = 
      (streetAddress !== undefined && streetAddress !== user.streetAddress) ||
      (city !== undefined && city !== user.city) ||
      (state !== undefined && state !== user.state) ||
      (zipcode !== undefined && zipcode !== user.zipcode);

    // Update basic profile fields
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (mobileNumber !== undefined) user.mobileNumber = mobileNumber;
    if (smsOptIn !== undefined) user.smsOptIn = smsOptIn;

    // Update address fields
    if (streetAddress !== undefined) user.streetAddress = streetAddress;
    if (city !== undefined) user.city = city;
    if (state !== undefined) user.state = state;
    if (zipcode !== undefined) user.zipcode = zipcode;
    if (county !== undefined) user.county = county;

    // Geocode if address changed and we have enough info
    let geocodeResult = null;
    if (addressChanged && (user.zipcode || (user.city && user.state))) {
      console.log(`Address changed for user ${user.username}, geocoding...`);
      
      geocodeResult = await geocodeAddress({
        street: user.streetAddress,
        city: user.city,
        state: user.state,
        zipcode: user.zipcode
      });

      if (geocodeResult.success) {
        user.coordinates = {
          lat: geocodeResult.lat,
          lng: geocodeResult.lng,
          geocodedAt: new Date(),
          geocodedFrom: geocodeResult.geocodedFrom
        };
        console.log(`Geocoded ${user.username}: ${geocodeResult.lat}, ${geocodeResult.lng} (from ${geocodeResult.geocodedFrom})`);
      } else {
        console.log(`Geocoding failed for ${user.username}: ${geocodeResult.error}`);
      }
    }

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        mobileNumber: user.mobileNumber,
        smsOptIn: user.smsOptIn,
        streetAddress: user.streetAddress,
        city: user.city,
        state: user.state,
        zipcode: user.zipcode,
        county: user.county,
        coordinates: user.coordinates
      },
      geocoded: geocodeResult ? geocodeResult.success : null
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message
    });
  }
};

// Update password
exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a new password'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters'
      });
    }

    // Get user with password field
    const user = await User.findById(req.user.id).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // If user already has a password, require current password
    if (user.password) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          message: 'Please provide current password'
        });
      }
      const isPasswordMatch = await user.matchPassword(currentPassword);
      if (!isPasswordMatch) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }
    }
    // If user has no password (Google-only), allow setting one without current password

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password updated successfully'
    });

  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating password',
      error: error.message
    });
  }
};

// Auto-import artist names as favorites (used by Spotify/YouTube sync)
// Searches DB first, then Ticketmaster for unknown artists (capped at 50 TM searches)
exports.autoImportArtistsAsFavorites = async function autoImportArtistsAsFavorites(userId, artistNames) {
  const result = { imported: 0, alreadyFavorited: 0, notFound: 0, tmSearches: 0 };
  const TM_SEARCH_CAP = 50;

  try {
    const user = await User.findById(userId);
    if (!user) return result;

    const existingFavIds = new Set(user.favoriteArtists.map(id => id.toString()));
    const newlyFavoritedArtists = []; // track for follower count updates

    for (const name of artistNames) {
      try {
        // Step A: case-insensitive DB lookup
        let artist = await Artist.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });

        // Step B: TM search if not found and budget remains
        if (!artist && result.tmSearches < TM_SEARCH_CAP) {
          result.tmSearches++;
          const tmResult = await ticketmasterService.searchArtists(name);
          if (tmResult.success && tmResult.artists.length > 0) {
            // Only accept exact case-insensitive name match
            const match = tmResult.artists.find(a => a.name.toLowerCase() === name.toLowerCase());
            if (match) {
              // Check if artist already exists by TM ID
              artist = await Artist.findOne({ 'externalIds.ticketmaster': match.externalId });
              if (!artist) {
                artist = await Artist.create({
                  name: match.name,
                  externalIds: { ticketmaster: match.externalId },
                  genre: match.genre ? [match.genre] : [],
                  images: {
                    large: match.images?.[0]?.url,
                    medium: match.images?.[1]?.url,
                    thumbnail: match.images?.[2]?.url
                  },
                  tourStatus: 'unknown',
                  lastUpdated: new Date()
                });
                fetchArtistEventsInBackground(match.externalId);
              }
            }
          }
        }

        // Step C: Add to favorites if found and not already favorited
        if (artist) {
          if (existingFavIds.has(artist._id.toString())) {
            result.alreadyFavorited++;
          } else {
            user.favoriteArtists.push(artist._id);
            existingFavIds.add(artist._id.toString());
            newlyFavoritedArtists.push(artist._id);
            result.imported++;
          }
        } else {
          result.notFound++;
        }
      } catch (artistErr) {
        console.error(`Auto-import error for "${name}":`, artistErr.message);
        result.notFound++;
      }
    }

    // Bulk save user once
    if (newlyFavoritedArtists.length > 0) {
      await user.save();

      // Update follower counts for newly favorited artists
      for (const artistId of newlyFavoritedArtists) {
        try {
          const count = await User.countDocuments({ favoriteArtists: artistId });
          await Artist.findByIdAndUpdate(artistId, { 'stats.followers': count });
        } catch (err) {
          console.error(`Failed to update follower count for ${artistId}:`, err.message);
        }
      }
    }

    console.log(`Auto-import complete: ${result.imported} imported, ${result.alreadyFavorited} already favorited, ${result.notFound} not found, ${result.tmSearches} TM searches`);
  } catch (error) {
    console.error('Auto-import artists failed:', error.message);
  }

  return result;
};

// Helper function to fetch artist events in background
async function fetchArtistEventsInBackground(ticketmasterId) {
  try {
    console.log(`Fetching events for artist ${ticketmasterId} in background...`);
    
    const result = await ticketmasterService.getArtistUpcomingEvents(ticketmasterId);
    
    if (result.success && result.events.length > 0) {
      // Save events to database
      const savedCount = await Promise.all(
        result.events.map(event => 
          ticketmasterService.saveEventToDatabase(event)
            .catch(err => {
              console.error('Error saving event:', err.message);
              return null;
            })
        )
      ).then(results => results.filter(r => r && r.success).length);
      
      console.log(`Background saved ${savedCount}/${result.events.length} events for artist ${ticketmasterId}`);
    }
  } catch (error) {
    console.error('Background fetch error:', error.message);
  }
}