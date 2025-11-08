// Test Routes - for testing Ticketmaster integration
// You can use these endpoints to verify everything works

const express = require('express');
const router = express.Router();
const ticketmasterService = require('../services/ticketmasterService');

// Test: Search Ticketmaster API directly
// GET /api/v1/test/search?keyword=Taylor Swift&city=Los Angeles
router.get('/search', async (req, res) => {
  try {
    const { keyword, city, stateCode, size = 10 } = req.query;
    
    if (!keyword) {
      return res.status(400).json({
        success: false,
        message: 'keyword parameter is required'
      });
    }

    const result = await ticketmasterService.searchEvents({
      keyword,
      city,
      stateCode,
      size: parseInt(size)
    });

    res.json(result);

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Test: Import events to database
// POST /api/v1/test/import
// Body: { "keyword": "Taylor Swift", "city": "Los Angeles", "size": 5 }
router.post('/import', async (req, res) => {
  try {
    const { keyword, city, stateCode, size = 10 } = req.body;
    
    if (!keyword) {
      return res.status(400).json({
        success: false,
        message: 'keyword is required in request body'
      });
    }

    console.log(`Importing events for: ${keyword}`);
    
    const result = await ticketmasterService.importEvents({
      keyword,
      city,
      stateCode,
      size: parseInt(size)
    });

    res.json({
      success: result.success,
      message: `Imported ${result.imported} events`,
      errors: result.errors,
      details: result.details
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Test: Search artists
// GET /api/v1/test/artists?keyword=Beatles
router.get('/artists', async (req, res) => {
  try {
    const { keyword } = req.query;
    
    if (!keyword) {
      return res.status(400).json({
        success: false,
        message: 'keyword parameter is required'
      });
    }

    const result = await ticketmasterService.searchArtists(keyword);
    
    res.json(result);

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Test: Get events from database
// GET /api/v1/test/db-events
router.get('/db-events', async (req, res) => {
  try {
    const Event = require('../models/Event');
    
    const events = await Event.find()
      .populate('artist')
      .sort({ date: 1 })
      .limit(20);

    res.json({
      success: true,
      count: events.length,
      events
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Test: Get artists from database
// GET /api/v1/test/db-artists
router.get('/db-artists', async (req, res) => {
  try {
    const Artist = require('../models/Artist');
    
    const artists = await Artist.find()
      .sort({ name: 1 })
      .limit(50);

    res.json({
      success: true,
      count: artists.length,
      artists
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;