// User Routes
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect } = require('../middleware/auth');

// All routes are protected (require authentication)

// GET /api/v1/users/favorites - Get user's favorite artists
router.get('/favorites', protect, userController.getFavoriteArtists);

// POST /api/v1/users/favorites/:artistId - Add artist to favorites (by MongoDB ID)
router.post('/favorites/:artistId', protect, userController.addFavoriteArtist);

// POST /api/v1/users/favorites/ticketmaster/:ticketmasterId - Add artist to favorites (by Ticketmaster ID)
// Body: { "name": "Artist Name", "genre": "Rock", "images": [...] }
router.post('/favorites/ticketmaster/:ticketmasterId', protect, userController.addFavoriteArtistByTicketmasterId);

// DELETE /api/v1/users/favorites/:artistId - Remove from favorites
router.delete('/favorites/:artistId', protect, userController.removeFavoriteArtist);

// PUT /api/v1/users/profile - Update user profile
// Body: { "firstName": "John", "lastName": "Doe", "mobileNumber": "555-1234", "smsOptIn": true }
router.put('/profile', protect, userController.updateProfile);

// PUT /api/v1/users/password - Update password
// Body: { "currentPassword": "old123", "newPassword": "new123" }
router.put('/password', protect, userController.updatePassword);

module.exports = router;
