// API Usage Tracker Service
// In-memory buffer that flushes to MongoDB every 30 seconds
// Provides axios interceptors and fetch wrappers for automatic tracking

const ApiUsage = require('../models/apiusage');

// Known quota limits
const QUOTA_LIMITS = {
    ticketmaster: { limit: 5000, unit: 'calls' },
    youtube: { limit: 10000, unit: 'quota_units' }
};

// YouTube quota costs by API method
const YOUTUBE_QUOTA_COSTS = {
    '/youtube/v3/search': 100,
    '/youtube/v3/playlistItems': 50, // insert
    '/youtube/v3/playlists': 50,     // insert
    // list operations are 1 unit
    default: 1
};

function getYouTubeQuotaCost(url, method) {
    if (!url) return 1;
    const urlStr = typeof url === 'string' ? url : url.toString();
    // Write operations cost more
    const isWrite = method && ['POST', 'PUT', 'DELETE'].includes(method.toUpperCase());

    if (urlStr.includes('/youtube/v3/search')) return 100;
    if (urlStr.includes('/youtube/v3/playlistItems') && isWrite) return 50;
    if (urlStr.includes('/youtube/v3/playlists') && isWrite) return 50;
    return 1;
}

// In-memory buffer: { 'service:date': { totalCalls, totalErrors, totalLatencyMs, maxLatencyMs, endpoints: {}, quotaUsed } }
const buffer = {};
let flushInterval = null;

function getDateKey() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function getBufferKey(service) {
    return `${service}:${getDateKey()}`;
}

function extractEndpoint(url, service) {
    if (!url) return 'unknown';
    try {
        const parsed = new URL(typeof url === 'string' ? url : url.toString());
        let path = parsed.pathname;

        // Simplify common API paths
        if (service === 'ticketmaster') {
            // /discovery/v2/events.json -> /events
            path = path.replace('/discovery/v2/', '/').replace('.json', '');
        } else if (service === 'seatgeek') {
            path = path.replace('/2/', '/');
        } else if (service === 'setlistfm') {
            path = path.replace('/rest/1.0/', '/');
        } else if (service === 'youtube') {
            path = path.replace('/youtube/v3/', '/');
        } else if (service === 'spotify') {
            path = path.replace('/v1/', '/');
        } else if (service === 'lastfm') {
            // Last.fm uses query param ?method=artist.getsimilar
            const method = parsed.searchParams.get('method');
            return method ? '/' + method : '/api';
        } else if (service === 'google_geocoding') {
            path = '/geocode';
        } else if (service === 'google_places') {
            path = path.replace('/v1/', '/');
        } else if (service === 'wikipedia') {
            // Distinguish Wikipedia vs Wikimedia Commons
            if (parsed.hostname.includes('commons')) path = '/commons';
            else path = '/wikipedia';
        } else if (service === 'google_auth') {
            if (path.includes('token')) path = '/token';
            else if (path.includes('userinfo')) path = '/userinfo';
        }

        // Truncate long paths with IDs (keep first 2 segments)
        const segments = path.split('/').filter(Boolean);
        if (segments.length > 2) {
            return '/' + segments.slice(0, 2).join('/');
        }
        return '/' + segments.join('/');
    } catch {
        return 'unknown';
    }
}

/**
 * Record an API call to the in-memory buffer
 */
function track(service, endpoint, latencyMs, statusCode, isError, options = {}) {
    const key = getBufferKey(service);

    if (!buffer[key]) {
        buffer[key] = {
            service,
            date: getDateKey(),
            totalCalls: 0,
            totalErrors: 0,
            totalLatencyMs: 0,
            maxLatencyMs: 0,
            endpoints: {},
            quotaUsed: 0
        };
    }

    const entry = buffer[key];
    entry.totalCalls++;
    if (isError) entry.totalErrors++;
    entry.totalLatencyMs += latencyMs;
    if (latencyMs > entry.maxLatencyMs) entry.maxLatencyMs = latencyMs;

    // Endpoint-level tracking
    const ep = endpoint || 'unknown';
    if (!entry.endpoints[ep]) {
        entry.endpoints[ep] = { calls: 0, errorCount: 0, totalLatencyMs: 0, maxLatencyMs: 0 };
    }
    const epStats = entry.endpoints[ep];
    epStats.calls++;
    if (isError) epStats.errorCount++;
    epStats.totalLatencyMs += latencyMs;
    if (latencyMs > epStats.maxLatencyMs) epStats.maxLatencyMs = latencyMs;

    // Quota estimation
    if (options.quotaCost) {
        entry.quotaUsed += options.quotaCost;
    }
}

/**
 * Flush buffer to MongoDB using atomic $inc upserts
 */
async function flush() {
    const keys = Object.keys(buffer);
    if (keys.length === 0) return;

    for (const key of keys) {
        const entry = buffer[key];
        delete buffer[key];

        try {
            // Build the update operations
            const update = {
                $inc: {
                    totalCalls: entry.totalCalls,
                    totalErrors: entry.totalErrors,
                    totalLatencyMs: entry.totalLatencyMs
                },
                $max: {
                    maxLatencyMs: entry.maxLatencyMs
                }
            };

            // Set quota info if this service has known limits
            const quotaConfig = QUOTA_LIMITS[entry.service];
            if (quotaConfig) {
                update.$inc['quota.estimatedUsed'] = entry.quotaUsed || entry.totalCalls;
                update.$setOnInsert = {
                    'quota.limit': quotaConfig.limit,
                    'quota.unit': quotaConfig.unit
                };
            }

            // Upsert the daily aggregate document
            const doc = await ApiUsage.findOneAndUpdate(
                { service: entry.service, date: entry.date },
                update,
                { upsert: true, new: true }
            );

            // Update endpoint-level stats (Map fields need separate handling)
            if (Object.keys(entry.endpoints).length > 0) {
                const endpointUpdates = {};
                for (const [ep, stats] of Object.entries(entry.endpoints)) {
                    // Sanitize endpoint key for MongoDB (dots not allowed in keys)
                    const safeEp = ep.replace(/\./g, '_');
                    endpointUpdates[`endpoints.${safeEp}.calls`] = stats.calls;
                    endpointUpdates[`endpoints.${safeEp}.errorCount`] = stats.errorCount;
                    endpointUpdates[`endpoints.${safeEp}.totalLatencyMs`] = stats.totalLatencyMs;
                }

                const epMaxUpdates = {};
                for (const [ep, stats] of Object.entries(entry.endpoints)) {
                    const safeEp = ep.replace(/\./g, '_');
                    epMaxUpdates[`endpoints.${safeEp}.maxLatencyMs`] = stats.maxLatencyMs;
                }

                await ApiUsage.updateOne(
                    { service: entry.service, date: entry.date },
                    {
                        $inc: endpointUpdates,
                        $max: epMaxUpdates
                    }
                );
            }
        } catch (err) {
            console.error(`[API Tracker] Flush error for ${entry.service}:`, err.message);
            // Re-buffer on failure so data isn't lost
            if (!buffer[key]) {
                buffer[key] = entry;
            }
        }
    }
}

/**
 * Create an axios instance with automatic tracking interceptors
 */
function createTrackedAxios(serviceName, axiosModule) {
    const instance = axiosModule.create();

    // Request interceptor: record start time
    instance.interceptors.request.use(config => {
        config._trackStartTime = Date.now();
        return config;
    });

    // Response interceptor: track success
    instance.interceptors.response.use(
        response => {
            const latency = Date.now() - (response.config._trackStartTime || Date.now());
            const endpoint = extractEndpoint(response.config.url, serviceName);
            track(serviceName, endpoint, latency, response.status, false);
            return response;
        },
        error => {
            const config = error.config || {};
            const latency = Date.now() - (config._trackStartTime || Date.now());
            const status = error.response?.status || 0;
            const endpoint = extractEndpoint(config.url, serviceName);
            track(serviceName, endpoint, latency, status, true);
            return Promise.reject(error);
        }
    );

    return instance;
}

/**
 * Create a tracked fetch wrapper
 */
function trackedFetch(serviceName) {
    return async function(url, options = {}) {
        const start = Date.now();
        const method = options.method || 'GET';

        try {
            const response = await fetch(url, options);
            const latency = Date.now() - start;
            const endpoint = extractEndpoint(url, serviceName);
            const isError = response.status >= 400;

            const quotaOpts = {};
            if (serviceName === 'youtube') {
                quotaOpts.quotaCost = getYouTubeQuotaCost(url, method);
            }

            track(serviceName, endpoint, latency, response.status, isError, quotaOpts);
            return response;
        } catch (err) {
            const latency = Date.now() - start;
            const endpoint = extractEndpoint(url, serviceName);
            track(serviceName, endpoint, latency, 0, true);
            throw err;
        }
    };
}

/**
 * Start the periodic flush timer
 */
function start() {
    if (flushInterval) return;
    flushInterval = setInterval(flush, 30000); // 30 seconds
    console.log('[API Tracker] Started (flushing every 30s)');
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
    console.log('[API Tracker] Stopped and flushed');
}

// Flush on process exit
process.on('SIGTERM', async () => { await flush(); });
process.on('SIGINT', async () => { await flush(); });
process.on('beforeExit', async () => { await flush(); });

module.exports = {
    track,
    flush,
    start,
    stop,
    createTrackedAxios,
    trackedFetch
};
