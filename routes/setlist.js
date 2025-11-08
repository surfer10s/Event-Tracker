// Setlist.fm Routes
// API endpoints for accessing setlist data and cross-referencing

const express = require('express');
const router = express.Router();
const setlistController = require('../controllers/setlistController');

// GET /api/v1/setlist/search/artists - Search for artists on Setlist.fm
// Query params: query (required)
// Example: /api/v1/setlist/search/artists?query=Taylor Swift
router.get('/search/artists', setlistController.searchArtists);

// GET /api/v1/setlist/search/setlists - Search for setlists
// Query params: artistMbid, artistName, cityName, countryCode, date, tourName, venueName, year, page
// Example: /api/v1/setlist/search/setlists?artistName=Metallica&cityName=San Francisco
router.get('/search/setlists', setlistController.searchSetlists);

// GET /api/v1/setlist/artist/:mbid/setlists - Get all setlists for an artist
// Params: mbid (MusicBrainz ID)
// Query params: page (optional)
// Example: /api/v1/setlist/artist/65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab/setlists
router.get('/artist/:mbid/setlists', setlistController.getArtistSetlists);

// GET /api/v1/setlist/artist/:mbid/recent - Get recent setlists for an artist
// Params: mbid (MusicBrainz ID)
// Query params: limit (optional, default 20)
// Example: /api/v1/setlist/artist/65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab/recent?limit=10
router.get('/artist/:mbid/recent', setlistController.getRecentSetlists);

// GET /api/v1/setlist/artist/:mbid/average - Get average setlist (most played songs)
// Params: mbid (MusicBrainz ID)
// Query params: limit (optional, default 20)
// Example: /api/v1/setlist/artist/65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab/average?limit=15
router.get('/artist/:mbid/average', setlistController.getAverageSetlist);

// GET /api/v1/setlist/artist/:mbid/tour-stats - Get tour statistics
// Params: mbid (MusicBrainz ID)
// Query params: tourName (required)
// Example: /api/v1/setlist/artist/65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab/tour-stats?tourName=Eras Tour
router.get('/artist/:mbid/tour-stats', setlistController.getTourStats);

// GET /api/v1/setlist/artist/:mbid/venue-history - Get venue history
// Params: mbid (MusicBrainz ID)
// Query params: venueName (required)
// Example: /api/v1/setlist/artist/65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab/venue-history?venueName=Madison Square Garden
router.get('/artist/:mbid/venue-history', setlistController.getVenueHistory);

// GET /api/v1/setlist/setlist/:setlistId - Get a specific setlist
// Params: setlistId (Setlist.fm ID)
// Example: /api/v1/setlist/setlist/63d4c4c5
router.get('/setlist/:setlistId', setlistController.getSetlist);

// POST /api/v1/setlist/link/:artistId - Link a database artist with Setlist.fm
// Params: artistId (MongoDB ObjectId)
// Example: POST /api/v1/setlist/link/507f1f77bcf86cd799439011
router.post('/link/:artistId', setlistController.linkArtist);

// GET /api/v1/setlist/db-artist/:artistId/setlists - Get setlists for a database artist
// Params: artistId (MongoDB ObjectId)
// Query params: page, limit
// Example: /api/v1/setlist/db-artist/507f1f77bcf86cd799439011/setlists
router.get('/db-artist/:artistId/setlists', setlistController.getArtistSetlistsByDbId);

module.exports = router;
