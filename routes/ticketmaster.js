// Ticketmaster Live API Routes
// These routes fetch fresh data directly from Ticketmaster

const express = require('express');
const router = express.Router();
const ticketmasterController = require('../controllers/ticketmasterController');

// GET /api/v1/ticketmaster/search - Live search Ticketmaster API
// Query params: keyword (required), city, stateCode, startDate, endDate, page, size
// Example: /api/v1/ticketmaster/search?keyword=Billie Eilish&city=Los Angeles&size=20
router.get('/search', ticketmasterController.liveSearch);

// GET /api/v1/ticketmaster/artists - Search for artists
// Query params: keyword (required)
// Example: /api/v1/ticketmaster/artists?keyword=Beatles
router.get('/artists', ticketmasterController.searchArtists);

// GET /api/v1/ticketmaster/artist/:artistId/events - Get events for specific artist
// Params: artistId (Ticketmaster artist ID)
// Example: /api/v1/ticketmaster/artist/K8vZ917Gku7/events
router.get('/artist/:artistId/events', ticketmasterController.getArtistEvents);

// POST /api/v1/ticketmaster/import - Import events to database
// Body: { "keyword": "artist name", "city": "optional", "size": 20 }
router.post('/import', ticketmasterController.importEvents);

module.exports = router;