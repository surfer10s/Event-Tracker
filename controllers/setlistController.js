// Setlist.fm Controller
// Handles requests for setlist data, artist history, and tour stats

const setlistService = require('../services/setlistService');
const Artist = require('../models/Artist');

// Search for artists on Setlist.fm
exports.searchArtists = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'query parameter is required'
      });
    }

    console.log(`Searching Setlist.fm for: ${query}`);

    const result = await setlistService.searchArtists(query);

    res.json(result);

  } catch (error) {
    console.error('Error searching artists:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching artists',
      error: error.message
    });
  }
};

// Get artist setlists by MusicBrainz ID
exports.getArtistSetlists = async (req, res) => {
  try {
    const { mbid } = req.params;
    const { page = 1 } = req.query;

    console.log(`Fetching setlists for artist: ${mbid}`);

    const result = await setlistService.getArtistSetlists(mbid, parseInt(page));

    res.json(result);

  } catch (error) {
    console.error('Error fetching setlists:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching setlists',
      error: error.message
    });
  }
};

// Get recent setlists for an artist
exports.getRecentSetlists = async (req, res) => {
  try {
    const { mbid } = req.params;
    const { limit = 20 } = req.query;

    console.log(`Fetching recent setlists for: ${mbid}`);

    const result = await setlistService.getRecentSetlists(mbid, parseInt(limit));

    res.json(result);

  } catch (error) {
    console.error('Error fetching recent setlists:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recent setlists',
      error: error.message
    });
  }
};

// Get a specific setlist by ID
exports.getSetlist = async (req, res) => {
  try {
    const { setlistId } = req.params;

    console.log(`Fetching setlist: ${setlistId}`);

    const result = await setlistService.getSetlist(setlistId);

    res.json(result);

  } catch (error) {
    console.error('Error fetching setlist:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching setlist',
      error: error.message
    });
  }
};

// Search setlists by various criteria
exports.searchSetlists = async (req, res) => {
  try {
    const {
      artistMbid,
      artistName,
      cityName,
      countryCode,
      date,
      tourName,
      venueName,
      year,
      page = 1
    } = req.query;

    console.log('Searching setlists with criteria:', req.query);

    const result = await setlistService.searchSetlists({
      artistMbid,
      artistName,
      cityName,
      countryCode,
      date,
      tourName,
      venueName,
      year,
      page: parseInt(page)
    });

    res.json(result);

  } catch (error) {
    console.error('Error searching setlists:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching setlists',
      error: error.message
    });
  }
};

// Link an artist in our database with Setlist.fm
exports.linkArtist = async (req, res) => {
  try {
    const { artistId } = req.params;

    const artist = await Artist.findById(artistId);

    if (!artist) {
      return res.status(404).json({
        success: false,
        message: 'Artist not found'
      });
    }

    console.log(`Linking artist ${artist.name} with Setlist.fm`);

    const result = await setlistService.linkArtistByName(artist.name);

    res.json(result);

  } catch (error) {
    console.error('Error linking artist:', error);
    res.status(500).json({
      success: false,
      message: 'Error linking artist',
      error: error.message
    });
  }
};

// Get tour statistics
exports.getTourStats = async (req, res) => {
  try {
    const { mbid } = req.params;
    const { tourName } = req.query;

    if (!tourName) {
      return res.status(400).json({
        success: false,
        message: 'tourName parameter is required'
      });
    }

    console.log(`Fetching tour stats for ${mbid}: ${tourName}`);

    const result = await setlistService.getTourStats(mbid, tourName);

    res.json(result);

  } catch (error) {
    console.error('Error fetching tour stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tour stats',
      error: error.message
    });
  }
};

// Get average setlist (most commonly played songs)
exports.getAverageSetlist = async (req, res) => {
  try {
    const { mbid } = req.params;
    const { limit = 20 } = req.query;

    console.log(`Fetching average setlist for: ${mbid}`);

    const result = await setlistService.getAverageSetlist(mbid, parseInt(limit));

    res.json(result);

  } catch (error) {
    console.error('Error fetching average setlist:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching average setlist',
      error: error.message
    });
  }
};

// Get venue history for an artist
exports.getVenueHistory = async (req, res) => {
  try {
    const { mbid } = req.params;
    const { venueName } = req.query;

    if (!venueName) {
      return res.status(400).json({
        success: false,
        message: 'venueName parameter is required'
      });
    }

    console.log(`Fetching venue history for ${mbid} at ${venueName}`);

    const result = await setlistService.getVenueHistory(mbid, venueName);

    res.json(result);

  } catch (error) {
    console.error('Error fetching venue history:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching venue history',
      error: error.message
    });
  }
};

// Get setlists for a database artist (uses stored mbid)
exports.getArtistSetlistsByDbId = async (req, res) => {
  try {
    const { artistId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const artist = await Artist.findById(artistId);

    if (!artist) {
      return res.status(404).json({
        success: false,
        message: 'Artist not found'
      });
    }

    // Check if artist has Setlist.fm link
    if (!artist.externalIds?.setlistfm) {
      // Try to link artist
      const linkResult = await setlistService.linkArtistByName(artist.name);
      
      if (!linkResult.success) {
        return res.status(404).json({
          success: false,
          message: 'Artist not found on Setlist.fm',
          suggestion: 'Try searching by artist name'
        });
      }
    }

    console.log(`Fetching setlists for ${artist.name} (${artist.externalIds.setlistfm})`);

    const result = await setlistService.getArtistSetlists(
      artist.externalIds.setlistfm,
      parseInt(page)
    );

    res.json({
      ...result,
      artist: {
        id: artist._id,
        name: artist.name,
        mbid: artist.externalIds.setlistfm
      }
    });

  } catch (error) {
    console.error('Error fetching artist setlists:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching artist setlists',
      error: error.message
    });
  }
};
