// Activity Tracker Service
// In-memory buffer that flushes to MongoDB every 30 seconds
// Tracks user activity events and request performance metrics

const ActivityLog = require('../models/activitylog');
const RequestLog = require('../models/requestlog');

// In-memory buffers
const activityBuffer = [];
// requestBuffer keyed by 'METHOD /path:YYYY-MM-DD'
const requestBuffer = {};
let flushInterval = null;

function getDateKey() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Normalize a request path for aggregation:
 * - Replace MongoDB ObjectIds (24 hex chars) with :id
 * - Replace numeric path segments with :id
 * - Only track /api/ and /auth/ paths
 */
function normalizePath(path) {
    if (!path) return null;
    // Only track API and auth paths (skip static files)
    if (!path.startsWith('/api/') && !path.startsWith('/auth/')) return null;
    // Replace MongoDB ObjectIds
    let normalized = path.replace(/[a-f0-9]{24}/gi, ':id');
    // Replace numeric path segments
    normalized = normalized.replace(/\/\d+/g, '/:id');
    return normalized;
}

/**
 * Get latency bucket key for a given latency
 */
function getLatencyBucket(ms) {
    if (ms < 50) return 'under50';
    if (ms < 100) return 'under100';
    if (ms < 250) return 'under250';
    if (ms < 500) return 'under500';
    if (ms < 1000) return 'under1000';
    if (ms < 2000) return 'under2000';
    return 'over2000';
}

/**
 * Buffer a user activity event
 */
function track(action, { userId = null, metadata = {}, ip = null, userAgent = null } = {}) {
    activityBuffer.push({
        action,
        userId,
        metadata,
        ip,
        userAgent,
        timestamp: new Date()
    });
}

/**
 * Express middleware to capture request performance
 * Hooks into res.on('finish') to record status code and latency
 */
function requestPerformanceMiddleware(req, res, next) {
    const startTime = Date.now();

    res.on('finish', () => {
        const latency = Date.now() - startTime;
        const path = normalizePath(req.path);
        if (!path) return; // Skip non-API paths

        const endpoint = `${req.method} ${path}`;
        const date = getDateKey();
        const key = `${endpoint}:${date}`;
        const statusCode = res.statusCode;

        if (!requestBuffer[key]) {
            requestBuffer[key] = {
                date,
                endpoint,
                totalRequests: 0,
                status2xx: 0,
                status3xx: 0,
                status4xx: 0,
                status5xx: 0,
                totalLatencyMs: 0,
                maxLatencyMs: 0,
                latencyBuckets: {
                    under50: 0, under100: 0, under250: 0,
                    under500: 0, under1000: 0, under2000: 0, over2000: 0
                }
            };
        }

        const entry = requestBuffer[key];
        entry.totalRequests++;
        entry.totalLatencyMs += latency;
        if (latency > entry.maxLatencyMs) entry.maxLatencyMs = latency;

        // Status code bucket
        if (statusCode >= 200 && statusCode < 300) entry.status2xx++;
        else if (statusCode >= 300 && statusCode < 400) entry.status3xx++;
        else if (statusCode >= 400 && statusCode < 500) entry.status4xx++;
        else if (statusCode >= 500) entry.status5xx++;

        // Latency bucket
        entry.latencyBuckets[getLatencyBucket(latency)]++;
    });

    next();
}

/**
 * Flush both buffers to MongoDB
 */
async function flush() {
    // Flush activity events
    if (activityBuffer.length > 0) {
        const events = activityBuffer.splice(0, activityBuffer.length);
        try {
            await ActivityLog.insertMany(events);
        } catch (err) {
            console.error('[Activity Tracker] Activity flush error:', err.message);
            // Re-buffer on failure
            activityBuffer.unshift(...events);
        }
    }

    // Flush request performance data
    const keys = Object.keys(requestBuffer);
    if (keys.length === 0) return;

    for (const key of keys) {
        const entry = requestBuffer[key];
        delete requestBuffer[key];

        try {
            await RequestLog.findOneAndUpdate(
                { date: entry.date, endpoint: entry.endpoint },
                {
                    $inc: {
                        totalRequests: entry.totalRequests,
                        status2xx: entry.status2xx,
                        status3xx: entry.status3xx,
                        status4xx: entry.status4xx,
                        status5xx: entry.status5xx,
                        totalLatencyMs: entry.totalLatencyMs,
                        'latencyBuckets.under50': entry.latencyBuckets.under50,
                        'latencyBuckets.under100': entry.latencyBuckets.under100,
                        'latencyBuckets.under250': entry.latencyBuckets.under250,
                        'latencyBuckets.under500': entry.latencyBuckets.under500,
                        'latencyBuckets.under1000': entry.latencyBuckets.under1000,
                        'latencyBuckets.under2000': entry.latencyBuckets.under2000,
                        'latencyBuckets.over2000': entry.latencyBuckets.over2000
                    },
                    $max: {
                        maxLatencyMs: entry.maxLatencyMs
                    }
                },
                { upsert: true, new: true }
            );
        } catch (err) {
            console.error('[Activity Tracker] Request flush error:', err.message);
            // Re-buffer on failure
            if (!requestBuffer[key]) {
                requestBuffer[key] = entry;
            }
        }
    }
}

/**
 * Start the periodic flush timer
 */
function start() {
    if (flushInterval) return;
    flushInterval = setInterval(flush, 30000); // 30 seconds
    console.log('[Activity Tracker] Started (flushing every 30s)');
}

/**
 * Stop the periodic flush and do a final flush
 */
async function stop() {
    if (flushInterval) {
        clearInterval(flushInterval);
        flushInterval = null;
    }
    await flush();
    console.log('[Activity Tracker] Stopped and flushed');
}

// Flush on process exit
process.on('SIGTERM', async () => { await flush(); });
process.on('SIGINT', async () => { await flush(); });
process.on('beforeExit', async () => { await flush(); });

module.exports = {
    track,
    requestPerformanceMiddleware,
    flush,
    start,
    stop
};
