// API Usage Admin Routes
// Endpoints for viewing API usage metrics
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/adminAuth');
const ApiUsage = require('../models/apiusage');

// GET /api/v1/admin/api-usage?range=today|7d|30d&service=xxx
// Get aggregated API usage data
router.get('/', requireAdmin, async (req, res) => {
    try {
        const { range = 'today', service } = req.query;

        // Calculate date range
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

        const query = { date: { $gte: startDate, $lte: today } };
        if (service) query.service = service;

        const docs = await ApiUsage.find(query).sort({ date: -1, service: 1 }).lean();

        // Aggregate by service
        const serviceMap = {};
        const dailyTotals = {};

        for (const doc of docs) {
            if (!serviceMap[doc.service]) {
                serviceMap[doc.service] = {
                    service: doc.service,
                    totalCalls: 0,
                    totalErrors: 0,
                    totalLatencyMs: 0,
                    maxLatencyMs: 0,
                    quota: null
                };
            }

            const svc = serviceMap[doc.service];
            svc.totalCalls += doc.totalCalls;
            svc.totalErrors += doc.totalErrors;
            svc.totalLatencyMs += doc.totalLatencyMs;
            if (doc.maxLatencyMs > svc.maxLatencyMs) svc.maxLatencyMs = doc.maxLatencyMs;

            // Use the most recent quota info
            if (doc.quota?.limit && !svc.quota) {
                svc.quota = {
                    limit: doc.quota.limit,
                    unit: doc.quota.unit
                };
            }

            // Daily totals for trend chart
            if (!dailyTotals[doc.date]) {
                dailyTotals[doc.date] = { date: doc.date, calls: 0, errors: 0 };
            }
            dailyTotals[doc.date].calls += doc.totalCalls;
            dailyTotals[doc.date].errors += doc.totalErrors;
        }

        // Calculate derived stats
        const services = Object.values(serviceMap).map(svc => ({
            ...svc,
            avgLatencyMs: svc.totalCalls > 0 ? Math.round(svc.totalLatencyMs / svc.totalCalls) : 0,
            errorRate: svc.totalCalls > 0 ? parseFloat(((svc.totalErrors / svc.totalCalls) * 100).toFixed(1)) : 0
        }));

        // Get today's quota usage for TM and YouTube
        const todayDocs = docs.filter(d => d.date === today);
        const quotas = {};
        for (const doc of todayDocs) {
            if (doc.quota?.limit) {
                quotas[doc.service] = {
                    limit: doc.quota.limit,
                    unit: doc.quota.unit,
                    used: doc.quota.estimatedUsed || doc.totalCalls
                };
            }
        }

        // Summary
        const totalCalls = services.reduce((sum, s) => sum + s.totalCalls, 0);
        const totalErrors = services.reduce((sum, s) => sum + s.totalErrors, 0);

        res.json({
            success: true,
            range,
            summary: {
                totalCalls,
                totalErrors,
                errorRate: totalCalls > 0 ? parseFloat(((totalErrors / totalCalls) * 100).toFixed(1)) : 0,
                activeServices: services.filter(s => s.totalCalls > 0).length
            },
            quotas,
            services: services.sort((a, b) => b.totalCalls - a.totalCalls),
            daily: Object.values(dailyTotals).sort((a, b) => a.date.localeCompare(b.date))
        });
    } catch (err) {
        console.error('[API Usage] Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/v1/admin/api-usage/endpoints/:service?date=YYYY-MM-DD
// Get endpoint-level breakdown for a specific service
router.get('/endpoints/:service', requireAdmin, async (req, res) => {
    try {
        const { service } = req.params;
        const { date } = req.query;

        // Default to today
        const targetDate = date || new Date().toISOString().slice(0, 10);

        const doc = await ApiUsage.findOne({ service, date: targetDate }).lean();

        if (!doc) {
            return res.json({
                success: true,
                service,
                date: targetDate,
                endpoints: []
            });
        }

        // Convert Map to array with computed stats
        const endpoints = [];
        if (doc.endpoints) {
            for (const [path, stats] of Object.entries(doc.endpoints)) {
                endpoints.push({
                    path,
                    calls: stats.calls || 0,
                    errors: stats.errorCount || 0,
                    errorRate: stats.calls > 0 ? parseFloat(((stats.errorCount / stats.calls) * 100).toFixed(1)) : 0,
                    avgLatencyMs: stats.calls > 0 ? Math.round(stats.totalLatencyMs / stats.calls) : 0,
                    maxLatencyMs: stats.maxLatencyMs || 0
                });
            }
        }

        res.json({
            success: true,
            service,
            date: targetDate,
            totalCalls: doc.totalCalls,
            totalErrors: doc.totalErrors,
            endpoints: endpoints.sort((a, b) => b.calls - a.calls)
        });
    } catch (err) {
        console.error('[API Usage] Endpoint detail error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
