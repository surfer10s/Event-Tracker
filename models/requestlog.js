// Request Log Model
// Daily aggregates per endpoint for tracking internal API performance
const mongoose = require('mongoose');

const requestLogSchema = new mongoose.Schema({
    date: {
        type: String, // YYYY-MM-DD
        required: true
    },
    endpoint: {
        type: String, // e.g. 'GET /api/v1/events'
        required: true
    },
    totalRequests: { type: Number, default: 0 },
    status2xx: { type: Number, default: 0 },
    status3xx: { type: Number, default: 0 },
    status4xx: { type: Number, default: 0 },
    status5xx: { type: Number, default: 0 },
    totalLatencyMs: { type: Number, default: 0 },
    maxLatencyMs: { type: Number, default: 0 },
    latencyBuckets: {
        under50: { type: Number, default: 0 },
        under100: { type: Number, default: 0 },
        under250: { type: Number, default: 0 },
        under500: { type: Number, default: 0 },
        under1000: { type: Number, default: 0 },
        under2000: { type: Number, default: 0 },
        over2000: { type: Number, default: 0 }
    }
}, {
    timestamps: true
});

// Compound unique index: one document per endpoint per day
requestLogSchema.index({ date: 1, endpoint: 1 }, { unique: true });

// TTL index: auto-delete after 90 days (based on createdAt from timestamps)
requestLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('RequestLog', requestLogSchema);
