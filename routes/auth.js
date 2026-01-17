// Authentication Routes
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// POST /api/v1/auth/register - Register new user (sends verification email)
router.post('/register', authController.register);

// POST /api/v1/auth/login - Login user (checks if email verified)
router.post('/login', authController.login);

// GET /api/v1/auth/me - Get current user (protected)
router.get('/me', protect, authController.getMe);

// GET /api/v1/auth/verify-email/:token - Verify email with token
router.get('/verify-email/:token', authController.verifyEmail);

// POST /api/v1/auth/resend-verification - Resend verification email
router.post('/resend-verification', authController.resendVerification);

// POST /api/v1/auth/forgot-password - Request password reset code
router.post('/forgot-password', authController.forgotPassword);

// POST /api/v1/auth/reset-password - Reset password with code
router.post('/reset-password', authController.resetPassword);

module.exports = router;