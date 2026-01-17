// Notification Routes
const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');
const notificationService = require('../services/notificationService');
const nodemailer = require('nodemailer');

// Email transporter (reuse from authController or configure here)
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// GET /api/v1/notifications - Get user's notifications
router.get('/', protect, async (req, res) => {
    try {
        const { status, tier, limit = 50, page = 1 } = req.query;
        
        const query = { 
            userId: req.user._id,
            channel: 'in_app'
        };
        
        // Status filter
        if (status === 'all') {
            // No status filter - show everything
        } else if (status === 'read') {
            query.status = 'read';
        } else {
            // Default: show unread (pending and sent)
            query.status = { $in: ['pending', 'sent'] };
        }
        
        // Tier filter
        if (tier) {
            query.tier = tier;
        }
        
        const notifications = await Notification.find(query)
            .sort({ tier: 1, createdAt: -1 }) // Favorites first, then newest
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .populate('artistId', 'name images')
            .populate('eventId');
        
        const total = await Notification.countDocuments(query);
        const unreadCount = await Notification.getUnreadCount(req.user._id);
        
        res.json({
            success: true,
            notifications,
            unreadCount,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
        
    } catch (err) {
        console.error('Get notifications error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/v1/notifications/unread-count - Get unread count only
router.get('/unread-count', protect, async (req, res) => {
    try {
        const count = await Notification.getUnreadCount(req.user._id);
        res.json({ success: true, count });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/v1/notifications/:id/read - Mark notification as read
router.put('/:id/read', protect, async (req, res) => {
    try {
        const notification = await Notification.findOne({
            _id: req.params.id,
            userId: req.user._id
        });
        
        if (!notification) {
            return res.status(404).json({ success: false, error: 'Notification not found' });
        }
        
        await notification.markAsRead();
        
        res.json({ success: true, notification });
        
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/v1/notifications/read-all - Mark all as read
router.put('/read-all', protect, async (req, res) => {
    try {
        const result = await Notification.updateMany(
            { 
                userId: req.user._id, 
                status: { $in: ['pending', 'sent'] },
                channel: 'in_app'
            },
            { 
                $set: { status: 'read', readAt: new Date() }
            }
        );
        
        res.json({ 
            success: true, 
            modifiedCount: result.modifiedCount 
        });
        
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/v1/notifications/:id - Dismiss notification
router.delete('/:id', protect, async (req, res) => {
    try {
        const notification = await Notification.findOne({
            _id: req.params.id,
            userId: req.user._id
        });
        
        if (!notification) {
            return res.status(404).json({ success: false, error: 'Notification not found' });
        }
        
        await notification.dismiss();
        
        res.json({ success: true });
        
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/v1/notifications/check - Manually trigger notification check for current user
router.post('/check', protect, async (req, res) => {
    try {
        const result = await notificationService.checkEventsForUser(req.user._id);
        res.json(result);
    } catch (err) {
        console.error('Check notifications error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/v1/notifications/check-all - Admin: Check all users (protected - add admin check in production)
router.post('/check-all', protect, async (req, res) => {
    try {
        const result = await notificationService.checkEventsForAllUsers();
        res.json(result);
    } catch (err) {
        console.error('Check all notifications error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/v1/notifications/send-digest - Send daily email digest to current user
router.post('/send-digest', protect, async (req, res) => {
    try {
        const result = await sendDailyDigest(req.user._id);
        res.json(result);
    } catch (err) {
        console.error('Send digest error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/v1/notifications/send-all-digests - Admin: Send digests to all users
router.post('/send-all-digests', protect, async (req, res) => {
    try {
        const result = await sendAllDailyDigests();
        res.json(result);
    } catch (err) {
        console.error('Send all digests error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Helper: Send daily digest email to a user
async function sendDailyDigest(userId) {
    const User = require('../models/User');
    const user = await User.findById(userId);
    
    if (!user || !user.email) {
        return { success: false, error: 'User not found or no email' };
    }
    
    // Get pending email notifications
    const notifications = await Notification.find({
        userId,
        channel: 'email',
        status: 'pending'
    }).sort({ tier: 1, eventDate: 1 });
    
    if (notifications.length === 0) {
        return { success: true, message: 'No pending notifications', sent: 0 };
    }
    
    // Group by tier
    const favorites = notifications.filter(n => n.tier === 'favorite');
    const musicTaste = notifications.filter(n => n.tier === 'music_taste');
    
    // Build email HTML
    const emailHtml = buildDigestEmail(user, favorites, musicTaste);
    
    // Send email
    console.log('=== SENDING DAILY DIGEST ===');
    console.log('To:', user.email);
    console.log('Notifications:', notifications.length);
    
    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM || '"Event Tracker" <noreply@eventtracker.com>',
            to: user.email,
            subject: `🎵 ${notifications.length} Concert${notifications.length > 1 ? 's' : ''} Near You - Event Tracker`,
            html: emailHtml
        });
        
        // Mark as sent
        await Notification.updateMany(
            { _id: { $in: notifications.map(n => n._id) } },
            { $set: { status: 'sent', sentAt: new Date() } }
        );
        
        console.log('✓ Digest sent successfully');
        
        return { 
            success: true, 
            sent: notifications.length,
            favorites: favorites.length,
            musicTaste: musicTaste.length
        };
        
    } catch (err) {
        console.error('✗ Digest send failed:', err.message);
        return { success: false, error: err.message };
    }
}

// Helper: Send digests to all users with pending notifications
async function sendAllDailyDigests() {
    const User = require('../models/User');
    
    // Find users with pending email notifications
    const usersWithNotifications = await Notification.distinct('userId', {
        channel: 'email',
        status: 'pending'
    });
    
    console.log(`=== Sending daily digests to ${usersWithNotifications.length} users ===`);
    
    const results = [];
    
    for (const userId of usersWithNotifications) {
        try {
            const result = await sendDailyDigest(userId);
            results.push({ userId, ...result });
        } catch (err) {
            results.push({ userId, success: false, error: err.message });
        }
    }
    
    return {
        success: true,
        totalUsers: usersWithNotifications.length,
        results
    };
}

// Helper: Build digest email HTML
function buildDigestEmail(user, favorites, musicTaste) {
    const name = user.firstName || user.username || 'there';
    
    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    };
    
    const renderEvent = (n) => `
        <tr>
            <td style="padding: 16px; border-bottom: 1px solid #e2e8f0;">
                <div style="margin-bottom: 4px;">
                    <span style="background: ${n.tier === 'favorite' ? '#fef3c7' : '#dbeafe'}; color: ${n.tier === 'favorite' ? '#92400e' : '#1e40af'}; font-size: 11px; padding: 2px 8px; border-radius: 12px; font-weight: 600;">
                        ${n.reason}
                    </span>
                </div>
                <div style="font-weight: 600; font-size: 16px; color: #1e293b; margin-bottom: 4px;">
                    ${n.artistName}
                </div>
                <div style="color: #64748b; font-size: 14px; margin-bottom: 4px;">
                    ${formatDate(n.eventDate)} • ${n.venueName}
                </div>
                <div style="color: #94a3b8; font-size: 13px;">
                    ${n.venueCity}, ${n.venueState} • ${n.distance} miles away
                </div>
                ${n.ticketUrl ? `
                    <a href="${n.ticketUrl}" style="display: inline-block; margin-top: 12px; background: #334155; color: white; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 600;">
                        Get Tickets →
                    </a>
                ` : ''}
            </td>
        </tr>
    `;
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f1f5f9; margin: 0; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #334155 0%, #1e293b 100%); padding: 32px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">🎵 Concerts Near You</h1>
                <p style="color: #94a3b8; margin: 8px 0 0 0;">Your personalized daily digest</p>
            </div>
            
            <!-- Greeting -->
            <div style="padding: 24px 24px 0 24px;">
                <p style="color: #475569; margin: 0;">Hi ${name},</p>
                <p style="color: #475569; margin: 8px 0 0 0;">
                    We found <strong>${favorites.length + musicTaste.length} concert${favorites.length + musicTaste.length > 1 ? 's' : ''}</strong> 
                    within 50 miles of ${user.city || 'you'}!
                </p>
            </div>
            
            ${favorites.length > 0 ? `
                <!-- Favorites Section -->
                <div style="padding: 24px;">
                    <h2 style="color: #1e293b; font-size: 18px; margin: 0 0 16px 0; padding-bottom: 8px; border-bottom: 2px solid #fbbf24;">
                        ⭐ Your Favorites (${favorites.length})
                    </h2>
                    <table style="width: 100%; border-collapse: collapse;">
                        ${favorites.map(renderEvent).join('')}
                    </table>
                </div>
            ` : ''}
            
            ${musicTaste.length > 0 ? `
                <!-- Music Taste Section -->
                <div style="padding: 0 24px 24px 24px;">
                    <h2 style="color: #1e293b; font-size: 18px; margin: 0 0 16px 0; padding-bottom: 8px; border-bottom: 2px solid #3b82f6;">
                        🎧 Based on Your Music (${musicTaste.length})
                    </h2>
                    <table style="width: 100%; border-collapse: collapse;">
                        ${musicTaste.map(renderEvent).join('')}
                    </table>
                </div>
            ` : ''}
            
            <!-- Footer -->
            <div style="background: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5000'}" style="color: #334155; text-decoration: none; font-weight: 600;">
                    View All in Event Tracker →
                </a>
                <p style="color: #94a3b8; font-size: 12px; margin: 16px 0 0 0;">
                    You're receiving this because you have notification preferences enabled.
                </p>
            </div>
            
        </div>
    </body>
    </html>
    `;
}

module.exports = router;