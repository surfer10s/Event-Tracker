// User Routes
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { 
    addConcertToHistory, 
    getConcertHistory, 
    updateConcertHistory, 
    deleteConcertFromHistory 
} = require('../controllers/concerthistorycontroller');
const { protect } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminAuth');

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

// Concert History Routes
// GET /api/v1/users/concert-history - Get user's concert history
// POST /api/v1/users/concert-history - Add concert to history
router.route('/concert-history')
    .get(protect, getConcertHistory)
    .post(protect, addConcertToHistory);

// PUT /api/v1/users/concert-history/:id - Update concert rating/notes
// DELETE /api/v1/users/concert-history/:id - Remove concert from history
router.route('/concert-history/:id')
    .put(protect, updateConcertHistory)
    .delete(protect, deleteConcertFromHistory);

// ============================================
// Admin Portal Routes for User Management
// ============================================

const User = require('../models/User');

// GET /api/v1/users/admin/list - Get all users for admin
router.get('/admin/list', requireAdmin, async (req, res) => {
    try {
        const users = await User.find({})
            .select('username email firstName lastName city state isEmailVerified favoriteArtists createdAt')
            .sort({ createdAt: -1 });
        
        const formattedUsers = users.map(u => ({
            _id: u._id,
            username: u.username,
            email: u.email,
            firstName: u.firstName,
            lastName: u.lastName,
            city: u.city,
            state: u.state,
            isEmailVerified: u.isEmailVerified,
            favoriteCount: u.favoriteArtists?.length || 0,
            createdAt: u.createdAt
        }));
        
        res.json({ success: true, users: formattedUsers });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/v1/users/admin/stats - Get user stats
router.get('/admin/stats', requireAdmin, async (req, res) => {
    try {
        const total = await User.countDocuments();
        const verified = await User.countDocuments({ isEmailVerified: true });
        const withLocation = await User.countDocuments({ 
            city: { $exists: true, $ne: '' },
            state: { $exists: true, $ne: '' }
        });
        const withFavorites = await User.countDocuments({
            'favoriteArtists.0': { $exists: true }
        });
        
        res.json({
            success: true,
            stats: {
                total,
                verified,
                withLocation,
                withFavorites
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/v1/users/check-admin - Check if current user is admin
router.get('/check-admin', protect, async (req, res) => {
    res.json({ 
        success: true, 
        isAdmin: req.user.isAdmin || false 
    });
});

module.exports = router;