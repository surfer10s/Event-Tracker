// Notification Model - Stores user notifications for concerts
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    // Event details
    eventId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event'
    },
    artistId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Artist'
    },
    artistName: String,
    eventName: String,
    eventDate: Date,
    venueName: String,
    venueCity: String,
    venueState: String,
    ticketUrl: String,
    distance: Number, // miles from user
    
    // Notification type and reason
    type: {
        type: String,
        enum: ['new_event', 'artist_touring', 'price_drop', 'reminder'],
        default: 'new_event'
    },
    tier: {
        type: String,
        enum: ['favorite', 'music_taste'],
        required: true
    },
    reason: {
        type: String,
        required: true
        // Examples: "A Favorite", "You've liked a song by", "On Rock Playlist playlist"
    },
    sourcePlaylist: String, // If from playlist, store the name
    
    // Status tracking
    status: {
        type: String,
        enum: ['pending', 'sent', 'read', 'dismissed'],
        default: 'pending'
    },
    channel: {
        type: String,
        enum: ['email', 'in_app', 'sms'],
        default: 'in_app'
    },
    
    // Timestamps
    sentAt: Date,
    readAt: Date,
    dismissedAt: Date,
    
    // Prevent duplicates
    eventHash: {
        type: String,
        index: true
        // Hash of odej4iq8iwrv + eventId to prevent duplicate notifications
    }
    
}, { timestamps: true });

// Compound index for efficient queries
notificationSchema.index({ userId: 1, status: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, eventHash: 1 }, { unique: true });

// Static method to check if notification already exists
notificationSchema.statics.exists = async function(userId, eventId) {
    const hash = `${userId}-${eventId}`;
    const existing = await this.findOne({ eventHash: hash });
    return !!existing;
};

// Static method to create notification if not exists
notificationSchema.statics.createIfNew = async function(data) {
    const hash = `${data.userId}-${data.eventId}`;
    
    try {
        const notification = await this.findOneAndUpdate(
            { eventHash: hash },
            { 
                $setOnInsert: {
                    ...data,
                    eventHash: hash,
                    status: 'pending',
                    createdAt: new Date()
                }
            },
            { upsert: true, new: true, rawResult: true }
        );
        
        return {
            notification: notification.value,
            isNew: notification.lastErrorObject?.upserted ? true : false
        };
    } catch (err) {
        if (err.code === 11000) {
            // Duplicate - already exists
            return { notification: null, isNew: false };
        }
        throw err;
    }
};

// Static method to get unread count for user
notificationSchema.statics.getUnreadCount = async function(userId) {
    return await this.countDocuments({ 
        userId, 
        status: { $in: ['pending', 'sent'] },
        channel: 'in_app'
    });
};

// Static method to get notifications for daily digest
notificationSchema.statics.getPendingDigest = async function(userId) {
    return await this.find({
        userId,
        status: 'pending',
        channel: 'email'
    })
    .sort({ tier: 1, eventDate: 1 }) // Favorites first, then by date
    .populate('artistId', 'name images')
    .populate('eventId');
};

// Mark as read
notificationSchema.methods.markAsRead = async function() {
    this.status = 'read';
    this.readAt = new Date();
    return await this.save();
};

// Mark as dismissed
notificationSchema.methods.dismiss = async function() {
    this.status = 'dismissed';
    this.dismissedAt = new Date();
    return await this.save();
};

module.exports = mongoose.model('Notification', notificationSchema);