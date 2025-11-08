// Event Routes
// Define the API endpoints for events

const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');

// GET /api/v1/events - Get all upcoming events with filters
// Query params: page, limit, city, state, artist, startDate, endDate, minPrice, maxPrice, status, sortBy, sortOrder
// Example: /api/v1/events?city=Los Angeles&limit=10&sortBy=date&sortOrder=asc
router.get('/', eventController.getUpcomingEvents);

// GET /api/v1/events/search - Search events by keyword
// Query params: q (search query), page, limit
// Example: /api/v1/events/search?q=rock concert&limit=20
router.get('/search', eventController.searchEvents);

// GET /api/v1/events/nearby - Get events near a location
// Query params: longitude, latitude, maxDistance (in miles), limit
// Example: /api/v1/events/nearby?longitude=-118.2437&latitude=34.0522&maxDistance=25
router.get('/nearby', eventController.getEventsNearby);

// GET /api/v1/events/stats - Get event statistics
// Example: /api/v1/events/stats
router.get('/stats', eventController.getEventStats);

// GET /api/v1/events/tour-map/:artistId - Get tour map data for an artist
router.get('/tour-map/:artistId', eventController.getTourMapData);


// GET /api/v1/events/artist/:artistId - Get all events by specific artist
// Params: artistId (MongoDB ObjectId)
// Query params: page, limit, includePast
// Example: /api/v1/events/artist/507f1f77bcf86cd799439011?includePast=false
router.get('/artist/:artistId', eventController.getEventsByArtist);


// GET /api/v1/events/:id - Get single event by ID
// Params: id (MongoDB ObjectId)
// Example: /api/v1/events/507f1f77bcf86cd799439011
router.get('/:id', eventController.getEventById);

// POST /api/v1/events/:eventId/click - Track affiliate link click
// Params: eventId (MongoDB ObjectId)
// Body: { "platform": "ticketmaster" }
// Example: POST /api/v1/events/507f1f77bcf86cd799439011/click
router.post('/:eventId/click', eventController.trackAffiliateClick);

module.exports = router;