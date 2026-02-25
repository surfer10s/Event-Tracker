// Venue Routes
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const venueController = require('../controllers/venueController');
const { protect } = require('../middleware/auth');

// Optional auth: sets req.user if token present, but doesn't block
async function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer')) {
        try {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = await User.findById(decoded.id);
        } catch (e) { /* ignore invalid tokens */ }
    }
    next();
}

// Public routes (static paths before :venueId)
router.get('/', venueController.getVenues);
router.get('/nearby', venueController.getVenuesNearby);

// Protected routes (static paths before :venueId)
router.get('/following', protect, venueController.getFollowedVenues);

// Venue by ID routes (optional auth to detect follow state)
router.get('/:venueId', optionalAuth, venueController.getVenueById);
router.get('/:venueId/events', venueController.getEventsByVenue);
router.post('/:venueId/follow', protect, venueController.followVenue);
router.delete('/:venueId/follow', protect, venueController.unfollowVenue);

module.exports = router;
