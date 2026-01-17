const mongoose = require('mongoose');

const concertHistorySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    setlistId: {
        type: String,
        required: true
    },
    artistName: {
        type: String,
        required: true
    },
    artistMbid: {
        type: String
    },
    eventDate: {
        type: Date,
        required: true
    },
    venueName: {
        type: String,
        required: true
    },
    venueCity: {
        type: String
    },
    venueState: {
        type: String
    },
    venueCountry: {
        type: String
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    notes: {
        type: String,
        maxlength: 1000
    },
    setlistUrl: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index to prevent duplicate entries
concertHistorySchema.index({ userId: 1, setlistId: 1 }, { unique: true });

// Index for sorting
concertHistorySchema.index({ userId: 1, eventDate: -1 });
concertHistorySchema.index({ userId: 1, rating: -1 });

module.exports = mongoose.model('ConcertHistory', concertHistorySchema);