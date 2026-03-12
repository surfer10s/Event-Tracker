// Activity Log Admin Routes
// Endpoints for viewing user activity and request performance metrics
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/adminAuth');
const ActivityLog = require('../models/activitylog');
const RequestLog = require('../models/requestlog');

/**
 * Calculate date range from range parameter
 */
function getDateRange(range) {
    const today = new Date().toISOString().slice(0, 10);
    let startDate = today;

    if (range === '7d') {
        const d = new Date();
        d.setDate(d.getDate() - 6);
        startDate = d.toISOString().slice(0, 10);
    } else if (range === '30d') {
        const d = new Date();
        d.setDate(d.getDate() - 29);
        startDate = d.toISOString().slice(0, 10);
    }

    // Convert to Date objects for ActivityLog (which uses Date timestamps)
    const start = new Date(startDate + 'T00:00:00.000Z');
    const end = new Date(today + 'T23:59:59.999Z');

    return { startDate, today, start, end };
}

/**
 * Approximate P95 from latency histogram buckets
 */
function approxP95(doc) {
    const buckets = doc.latencyBuckets || {};
    const total = doc.totalRequests || 0;
    if (total === 0) return 0;

    const target = Math.ceil(total * 0.95);
    const ordered = [
        { key: 'under50', ceiling: 50, count: buckets.under50 || 0 },
        { key: 'under100', ceiling: 100, count: buckets.under100 || 0 },
        { key: 'under250', ceiling: 250, count: buckets.under250 || 0 },
        { key: 'under500', ceiling: 500, count: buckets.under500 || 0 },
        { key: 'under1000', ceiling: 1000, count: buckets.under1000 || 0 },
        { key: 'under2000', ceiling: 2000, count: buckets.under2000 || 0 },
        { key: 'over2000', ceiling: doc.maxLatencyMs || 5000, count: buckets.over2000 || 0 }
    ];

    let cumulative = 0;
    for (const bucket of ordered) {
        cumulative += bucket.count;
        if (cumulative >= target) return bucket.ceiling;
    }
    return doc.maxLatencyMs || 0;
}

// GET /api/v1/admin/activity/summary?range=today|7d|30d
// Summary stats for activity + requests
router.get('/summary', requireAdmin, async (req, res) => {
    try {
        const { range = 'today' } = req.query;
        const { startDate, today, start, end } = getDateRange(range);

        // Activity summary
        const activityDocs = await ActivityLog.find({
            timestamp: { $gte: start, $lte: end }
        }).lean();

        const uniqueUsers = new Set();
        const actionBreakdown = {};
        let loginsToday = 0;
        let failedLoginsToday = 0;

        const todayStart = new Date(today + 'T00:00:00.000Z');
        const todayEnd = new Date(today + 'T23:59:59.999Z');

        for (const doc of activityDocs) {
            if (doc.userId) uniqueUsers.add(doc.userId.toString());
            actionBreakdown[doc.action] = (actionBreakdown[doc.action] || 0) + 1;

            // Today-specific counts
            if (doc.timestamp >= todayStart && doc.timestamp <= todayEnd) {
                if (doc.action === 'user.login' || doc.action === 'user.login_google') loginsToday++;
                if (doc.action === 'user.login_failed') failedLoginsToday++;
            }
        }

        // Request summary
        const requestDocs = await RequestLog.find({
            date: { $gte: startDate, $lte: today }
        }).lean();

        let totalRequests = 0;
        let totalErrors = 0;
        let totalLatencyMs = 0;

        for (const doc of requestDocs) {
            totalRequests += doc.totalRequests;
            totalErrors += (doc.status4xx || 0) + (doc.status5xx || 0);
            totalLatencyMs += doc.totalLatencyMs;
        }

        res.json({
            success: true,
            range,
            activity: {
                totalActions: activityDocs.length,
                uniqueUsers: uniqueUsers.size,
                loginsToday,
                failedLoginsToday,
                breakdown: actionBreakdown
            },
            requests: {
                totalRequests,
                totalErrors,
                errorRate: totalRequests > 0 ? parseFloat(((totalErrors / totalRequests) * 100).toFixed(1)) : 0,
                avgLatencyMs: totalRequests > 0 ? Math.round(totalLatencyMs / totalRequests) : 0
            }
        });
    } catch (err) {
        console.error('[Activity Log] Summary error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/v1/admin/activity/events?range=today|7d|30d&action=xxx&limit=50&offset=0
// Recent activity events (paginated, filterable)
router.get('/events', requireAdmin, async (req, res) => {
    try {
        const { range = 'today', action, limit = 50, offset = 0 } = req.query;
        const { start, end } = getDateRange(range);

        const query = { timestamp: { $gte: start, $lte: end } };
        if (action) query.action = action;

        const total = await ActivityLog.countDocuments(query);
        const events = await ActivityLog.find(query)
            .sort({ timestamp: -1 })
            .skip(parseInt(offset))
            .limit(parseInt(limit))
            .populate('userId', 'username email')
            .lean();

        res.json({
            success: true,
            total,
            limit: parseInt(limit),
            offset: parseInt(offset),
            events
        });
    } catch (err) {
        console.error('[Activity Log] Events error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/v1/admin/activity/requests?range=today|7d|30d
// Request performance by endpoint + daily totals
router.get('/requests', requireAdmin, async (req, res) => {
    try {
        const { range = 'today' } = req.query;
        const { startDate, today } = getDateRange(range);

        const docs = await RequestLog.find({
            date: { $gte: startDate, $lte: today }
        }).lean();

        // Aggregate by endpoint
        const endpointMap = {};
        const dailyTotals = {};

        for (const doc of docs) {
            // Endpoint aggregation
            if (!endpointMap[doc.endpoint]) {
                endpointMap[doc.endpoint] = {
                    endpoint: doc.endpoint,
                    totalRequests: 0,
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

            const ep = endpointMap[doc.endpoint];
            ep.totalRequests += doc.totalRequests;
            ep.status4xx += doc.status4xx || 0;
            ep.status5xx += doc.status5xx || 0;
            ep.totalLatencyMs += doc.totalLatencyMs;
            if (doc.maxLatencyMs > ep.maxLatencyMs) ep.maxLatencyMs = doc.maxLatencyMs;

            // Merge latency buckets
            const lb = doc.latencyBuckets || {};
            ep.latencyBuckets.under50 += lb.under50 || 0;
            ep.latencyBuckets.under100 += lb.under100 || 0;
            ep.latencyBuckets.under250 += lb.under250 || 0;
            ep.latencyBuckets.under500 += lb.under500 || 0;
            ep.latencyBuckets.under1000 += lb.under1000 || 0;
            ep.latencyBuckets.under2000 += lb.under2000 || 0;
            ep.latencyBuckets.over2000 += lb.over2000 || 0;

            // Daily totals
            if (!dailyTotals[doc.date]) {
                dailyTotals[doc.date] = { date: doc.date, requests: 0, errors: 0 };
            }
            dailyTotals[doc.date].requests += doc.totalRequests;
            dailyTotals[doc.date].errors += (doc.status4xx || 0) + (doc.status5xx || 0);
        }

        // Calculate derived stats per endpoint
        const endpoints = Object.values(endpointMap).map(ep => {
            const errors = ep.status4xx + ep.status5xx;
            return {
                endpoint: ep.endpoint,
                totalRequests: ep.totalRequests,
                errors,
                errorRate: ep.totalRequests > 0 ? parseFloat(((errors / ep.totalRequests) * 100).toFixed(1)) : 0,
                avgLatencyMs: ep.totalRequests > 0 ? Math.round(ep.totalLatencyMs / ep.totalRequests) : 0,
                approxP95Ms: approxP95(ep),
                maxLatencyMs: ep.maxLatencyMs
            };
        });

        res.json({
            success: true,
            range,
            endpoints: endpoints.sort((a, b) => b.totalRequests - a.totalRequests),
            daily: Object.values(dailyTotals).sort((a, b) => a.date.localeCompare(b.date))
        });
    } catch (err) {
        console.error('[Activity Log] Requests error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
