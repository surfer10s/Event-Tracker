// Ticketmaster Controller
// Handles live searches directly to Ticketmaster API

const ticketmasterService = require('../services/ticketmasterService');

// Live search Ticketmaster API
exports.liveSearch = async (req, res) => {
  try {
    const {
      keyword,
      city,
      stateCode,
      startDate,
      endDate,
      page = 0,
      size = 20
    } = req.query;

    if (!keyword) {
      return res.status(400).json({
        success: false,
        message: 'keyword parameter is required'
      });
    }

    console.log(`Live Ticketmaster search: ${keyword}${city ? ` in ${city}` : ''}`);

    // Search Ticketmaster directly
    const result = await ticketmasterService.searchEvents({
      keyword,
      city,
      stateCode,
      startDateTime: startDate,
      endDateTime: endDate,
      page: parseInt(page),
      size: parseInt(size)
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Ticketmaster API error',
        error: result.error
      });
    }

    // Save to MongoDB in the background (don't wait for it)
    if (result.events.length > 0) {
      saveEventsInBackground(result.events);
    }

    res.json({
      success: true,
      source: 'ticketmaster_live',
      events: result.events,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Error in live search:', error);
    res.status(500).json({
      success: false,
      message: 'Error performing live search',
      error: error.message
    });
  }
};

// Search by artist name (live from Ticketmaster)
exports.searchArtists = async (req, res) => {
  try {
    const { keyword } = req.query;

    if (!keyword) {
      return res.status(400).json({
        success: false,
        message: 'keyword parameter is required'
      });
    }

    console.log(`Live artist search: ${keyword}`);

    const result = await ticketmasterService.searchArtists(keyword);

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

// Get artist events live from Ticketmaster
exports.getArtistEvents = async (req, res) => {
  try {
    const { artistId } = req.params;
    const { page = 0, size = 20 } = req.query;

    console.log(`Fetching live events for Ticketmaster artist: ${artistId}`);

    const result = await ticketmasterService.getArtistUpcomingEvents(artistId);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Error fetching artist events',
        error: result.error
      });
    }

    // Save to MongoDB in background
    if (result.events.length > 0) {
      saveEventsInBackground(result.events);
    }

    res.json({
      success: true,
      source: 'ticketmaster_live',
      count: result.events.length,
      events: result.events
    });

  } catch (error) {
    console.error('Error fetching artist events:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching artist events',
      error: error.message
    });
  }
};

// Import/refresh events (explicitly save to database)
exports.importEvents = async (req, res) => {
  try {
    const { keyword, city, stateCode, size = 20 } = req.body;

    if (!keyword) {
      return res.status(400).json({
        success: false,
        message: 'keyword is required in request body'
      });
    }

    console.log(`Importing events: ${keyword}`);

    const result = await ticketmasterService.importEvents({
      keyword,
      city,
      stateCode,
      size: parseInt(size)
    });

    res.json({
      success: result.success,
      message: `Imported ${result.imported} events`,
      imported: result.imported,
      errors: result.errors,
      details: result.details
    });

  } catch (error) {
    console.error('Error importing events:', error);
    res.status(500).json({
      success: false,
      message: 'Error importing events',
      error: error.message
    });
  }
};

// Helper function to save events in background
async function saveEventsInBackground(formattedEvents) {
  // Don't await - let it run in background
  Promise.all(
    formattedEvents.map(event => 
      ticketmasterService.saveEventToDatabase(event)
        .catch(err => console.error('Background save error:', err.message))
    )
  ).then(results => {
    const saved = results.filter(r => r && r.success).length;
    console.log(`Background saved ${saved}/${formattedEvents.length} events to database`);
  });
}