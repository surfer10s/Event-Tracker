// Activity Log Model
// Individual user activity events with 90-day TTL auto-cleanup
const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
    action: {
        type: String,
        required: true,
        enum: [
            'user.login', 'user.login_failed', 'user.register', 'user.login_google',
            'artist.favorite', 'artist.unfavorite',
            'concert_history.add', 'concert_history.update', 'concert_history.delete',
            'profile.update', 'password.change', 'password.reset',
            'oauth.youtube_connect', 'oauth.youtube_disconnect',
            'oauth.spotify_connect', 'oauth.spotify_disconnect',
            'sync.youtube_music_taste', 'sync.spotify_music_taste'
        ]
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    ip: String,
    userAgent: String,
    timestamp: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: false
});

// Indexes for querying
activityLogSchema.index({ action: 1, timestamp: -1 });
activityLogSchema.index({ userId: 1, timestamp: -1 });

// TTL index: auto-delete after 90 days
activityLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
