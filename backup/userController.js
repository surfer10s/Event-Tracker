// User Controller - Favorites management
const User = require('../models/User');
const Artist = require('../models/Artist');
const ticketmasterService = require('../services/ticketmasterService');

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
      .populate('favoriteArtists', 'name genre images tourStatus stats');

    res.json({
      success: true,
      count: user.favoriteArtists.length,
      artists: user.favoriteArtists
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
