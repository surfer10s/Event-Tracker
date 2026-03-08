// API Usage Model
// Daily aggregate documents per service for tracking API call metrics
const mongoose = require('mongoose');

const apiUsageSchema = new mongoose.Schema({
    service: {
        type: String,
        required: true,
        enum: [
            'ticketmaster', 'seatgeek', 'setlistfm', 'lastfm',
            'youtube', 'spotify', 'google_geocoding', 'google_auth',
            'google_places', 'wikipedia', 'anthropic'
        ]
    },
    date: {
        type: String, // YYYY-MM-DD
        required: true
    },
    totalCalls: { type: Number, default: 0 },
    totalErrors: { type: Number, default: 0 },
    totalLatencyMs: { type: Number, default: 0 },
    maxLatencyMs: { type: Number, default: 0 },

    // Per-endpoint breakdown: key = endpoint path, value = stats
    endpoints: {
        type: Map,
        of: {
            calls: { type: Number, default: 0 },
            errorCount: { type: Number, default: 0 },
            totalLatencyMs: { type: Number, default: 0 },
            maxLatencyMs: { type: Number, default: 0 }
        },
        default: {}
    },

    // Quota tracking for rate-limited APIs
    quota: {
        limit: Number,       // e.g. 5000 for TM, 10000 for YouTube
        unit: String,        // 'calls' or 'quota_units'
        estimatedUsed: { type: Number, default: 0 }
    }
}, {
    timestamps: true
});

// Compound unique index: one document per service per day
apiUsageSchema.index({ service: 1, date: 1 }, { unique: true });

// Index for date range queries
apiUsageSchema.index({ date: 1 });

module.exports = mongoose.model('ApiUsage', apiUsageSchema);
