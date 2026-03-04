// Authentication Routes
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const User = require('../models/user');

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

// ============================================
// Google OAuth Routes
// ============================================

// GET /api/v1/auth/google - Redirect to Google OAuth consent screen
router.get('/google', (req, res) => {
    const redirectUri = process.env.GOOGLE_LOGIN_REDIRECT_URI || 'http://localhost:5000/api/v1/auth/google/callback';

    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
        new URLSearchParams({
            client_id: process.env.YOUTUBE_CLIENT_ID,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: 'openid email profile',
            access_type: 'offline',
            prompt: 'select_account'
        });

    res.redirect(authUrl);
});

// GET /api/v1/auth/google/callback - Handle Google's OAuth redirect
router.get('/google/callback', async (req, res) => {
    const { code, error } = req.query;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5000';
    const redirectUri = process.env.GOOGLE_LOGIN_REDIRECT_URI || 'http://localhost:5000/api/v1/auth/google/callback';

    if (error) {
        console.error('Google OAuth error:', error);
        return res.redirect(`${frontendUrl}/auth.html?google_error=${encodeURIComponent(error)}`);
    }

    if (!code) {
        return res.redirect(`${frontendUrl}/auth.html?google_error=missing_code`);
    }

    try {
        // Exchange auth code for access token
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: process.env.YOUTUBE_CLIENT_ID,
                client_secret: process.env.YOUTUBE_CLIENT_SECRET,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            })
        });

        const tokens = await tokenResponse.json();

        if (tokens.error) {
            console.error('Google token exchange error:', tokens);
            return res.redirect(`${frontendUrl}/auth.html?google_error=${encodeURIComponent(tokens.error_description || tokens.error)}`);
        }

        // Fetch user profile from Google
        const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${tokens.access_token}` }
        });

        const profile = await profileResponse.json();

        if (!profile.email) {
            return res.redirect(`${frontendUrl}/auth.html?google_error=no_email`);
        }

        // Find existing user by googleId or email
        let user = await User.findOne({
            $or: [
                { googleId: profile.id },
                { email: profile.email }
            ]
        });

        if (user) {
            // Existing user — link Google ID if not already linked
            if (!user.googleId) {
                user.googleId = profile.id;
            }
            // Auto-verify email since Google already verified it
            if (!user.isEmailVerified) {
                user.isEmailVerified = true;
                user.emailVerificationToken = undefined;
                user.emailVerificationExpires = undefined;
            }
            await user.save();
        } else {
            // New user — auto-create account
            const username = await authController.generateUniqueUsername(profile.email);
            user = await User.create({
                username,
                email: profile.email,
                firstName: profile.given_name || '',
                lastName: profile.family_name || '',
                authProvider: 'google',
                googleId: profile.id,
                isEmailVerified: true
            });
        }

        // Generate JWT
        const token = authController.generateToken(user._id);

        // Redirect to frontend with token
        const googleUser = encodeURIComponent(JSON.stringify({
            id: user._id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName
        }));

        res.redirect(`${frontendUrl}/auth.html?google_token=${token}&google_user=${googleUser}`);

    } catch (err) {
        console.error('Google OAuth callback error:', err);
        res.redirect(`${frontendUrl}/auth.html?google_error=server_error`);
    }
});

module.exports = router;