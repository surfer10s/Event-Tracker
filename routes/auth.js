// Authentication Routes
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// POST /api/v1/auth/register - Register new user
router.post('/register', authController.register);

// POST /api/v1/auth/login - Login user
router.post('/login', authController.login);

// GET /api/v1/auth/me - Get current user (protected)
router.get('/me', protect, authController.getMe);

module.exports = router;