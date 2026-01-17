// Admin Authentication Middleware
// Use this middleware to protect admin-only routes

const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to verify JWT and check admin status
const requireAdmin = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false, 
                error: 'No token provided' 
            });
        }

        const token = authHeader.split(' ')[1];
        
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        // Check if user is admin
        if (!user.isAdmin) {
            return res.status(403).json({ 
                success: false, 
                error: 'Access denied. Admin privileges required.' 
            });
        }

        // Attach user to request
        req.user = user;
        next();
    } catch (error) {
        console.error('Admin auth error:', error.message);
        return res.status(401).json({ 
            success: false, 
            error: 'Invalid token' 
        });
    }
};

// Middleware to just check if user is admin (for frontend use)
const checkAdminStatus = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            req.isAdmin = false;
            return next();
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        
        req.isAdmin = user?.isAdmin || false;
        req.user = user;
        next();
    } catch (error) {
        req.isAdmin = false;
        next();
    }
};

module.exports = { requireAdmin, checkAdminStatus };