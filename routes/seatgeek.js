// SeatGeek Routes
// API endpoints for SeatGeek integration

const express = require('express');
const router = express.Router();
const seatgeekService = require('../services/seatgeekService');

// Test API connection
router.get('/test', async (req, res) => {
  try {
    const result = await seatgeekService.testConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search events by performer/artist name
router.get('/events/performer/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { perPage = 25, page = 1 } = req.query;
    
    const result = await seatgeekService.searchEventsByPerformer(
      decodeURIComponent(name),
      { perPage: parseInt(perPage), page: parseInt(page) }
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search events by query
router.get('/events/search', async (req, res) => {
  try {
    const { q, perPage = 25, page = 1 } = req.query;
    
    if (!q) {
      return res.status(400).json({ success: false, error: 'Query parameter q is required' });
    }
    
    const result = await seatgeekService.searchEventsByQuery(
      q,
      { perPage: parseInt(perPage), page: parseInt(page) }
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get specific event by SeatGeek ID
router.get('/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await seatgeekService.getEventById(id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get pricing data for an event
router.get('/events/:id/pricing', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await seatgeekService.getPricingData(id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search performers
router.get('/performers/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ success: false, error: 'Query parameter q is required' });
    }
    
    const result = await seatgeekService.searchPerformers(q);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Enrich a Ticketmaster event with SeatGeek pricing
// POST body should contain: { artist: { name }, date, venue: { name, city } }
router.post('/enrich', async (req, res) => {
  try {
    const tmEvent = req.body;
    
    if (!tmEvent || !tmEvent.artist?.name) {
      return res.status(400).json({ 
        success: false, 
        error: 'Event data with artist.name is required' 
      });
    }
    
    const result = await seatgeekService.enrichEventWithPricing(tmEvent);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;