// Sync Routes - Background sync management
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminAuth');
const backgroundSyncService = require('../services/backgroundSyncService');
const notificationService = require('../services/notificationService');

// GET /api/v1/sync/progress - SSE endpoint for real-time progress
router.get('/progress', async (req, res) => {
    // Get token from query param (EventSource doesn't support headers)
    const token = req.query.token;
    
    if (!token) {
        return res.status(401).json({ success: false, error: 'No token provided' });
    }
    
    // Verify token
    const jwt = require('jsonwebtoken');
    try {
        jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
    }
    
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering for SSE
    res.flushHeaders();

    // Send current progress immediately
    const currentProgress = backgroundSyncService.getCurrentProgress();
    res.write(`data: ${JSON.stringify(currentProgress)}\n\n`);

    // Listen for progress updates
    const progressHandler = (progress) => {
        res.write(`data: ${JSON.stringify(progress)}\n\n`);
    };

    const emitter = backgroundSyncService.getProgressEmitter();
    emitter.on('progress', progressHandler);

    // Clean up on client disconnect
    req.on('close', () => {
        emitter.off('progress', progressHandler);
    });
});

// GET /api/v1/sync/stats - Get sync statistics
router.get('/stats', protect, async (req, res) => {
    try {
        const stats = backgroundSyncService.getSyncStats();
        res.json({ success: true, stats });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/v1/sync/full - Run full sync for all artists (admin)
router.post('/full', requireAdmin, async (req, res) => {
    try {
        console.log(`Full sync triggered by user: ${req.user.username}`);
        
        // Start sync in background, respond immediately
        res.json({ 
            success: true, 
            message: 'Full sync started. Check /api/v1/sync/stats for progress.' 
        });
        
        // Run sync after response
        const result = await backgroundSyncService.runFullSync({ verbose: true });
        console.log('Full sync completed:', result);
        
    } catch (err) {
        console.error('Full sync error:', err);
        // Response already sent, just log
    }
});

// POST /api/v1/sync/full-blocking - Run full sync and wait for result (admin)
router.post('/full-blocking', requireAdmin, async (req, res) => {
    try {
        console.log(`Full sync (blocking) triggered by user: ${req.user.username}`);
        const result = await backgroundSyncService.runFullSync({ verbose: true });
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/v1/sync/my-artists - Sync only current user's artists
router.post('/my-artists', protect, async (req, res) => {
    try {
        console.log(`User sync triggered by: ${req.user.username}`);
        const result = await backgroundSyncService.syncUserArtists(req.user._id, { verbose: true });
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/v1/sync/full-pipeline - Run full sync + notification check + send digests (admin)
router.post('/full-pipeline', requireAdmin, async (req, res) => {
    // Respond immediately — pipeline runs in background, progress via SSE
    console.log(`\n========================================`);
    console.log(`FULL PIPELINE triggered by: ${req.user.username}`);
    console.log(`========================================\n`);

    res.json({ success: true, message: 'Full pipeline started. Monitor progress via SSE.' });

    // Run pipeline in background (after response sent)
    try {
        // Step 1: Sync events from Ticketmaster
        console.log('STEP 1: Syncing events from Ticketmaster...');
        const syncResult = await backgroundSyncService.runFullSync({ verbose: true });

        // Step 2: Emit phase change to notifications
        const emitter = backgroundSyncService.getProgressEmitter();
        emitter.emit('progress', {
            isRunning: true,
            phase: 'notifications',
            currentArtist: 'Checking notifications for all users...',
            currentIndex: 0,
            totalArtists: 0,
            eventsFound: syncResult.eventsFound || 0,
            eventsSaved: syncResult.eventsSaved || 0,
            errors: syncResult.errors || 0
        });

        // Step 2: Check for matching events and create notifications
        console.log('\nSTEP 2: Checking for notification matches...');
        const notifResult = await notificationService.checkEventsForAllUsers();

        // Emit pipeline complete
        emitter.emit('progress', {
            isRunning: false,
            phase: 'complete',
            currentArtist: 'Pipeline complete!',
            currentIndex: syncResult.artistsChecked || 0,
            totalArtists: syncResult.artistsChecked || 0,
            eventsFound: syncResult.eventsFound || 0,
            eventsSaved: syncResult.eventsSaved || 0,
            errors: syncResult.errors || 0
        });

        console.log('\n========================================');
        console.log('FULL PIPELINE COMPLETE');
        console.log(`Sync: ${syncResult.eventsFound} found, ${syncResult.eventsSaved} saved`);
        console.log(`Notifications: ${JSON.stringify(notifResult)}`);
        console.log('========================================\n');

    } catch (err) {
        console.error('Pipeline error:', err);
        // Emit error state so SSE clients know it failed
        const emitter = backgroundSyncService.getProgressEmitter();
        emitter.emit('progress', {
            isRunning: false,
            phase: 'error',
            currentArtist: `Pipeline error: ${err.message}`,
            errors: 1
        });
    }
});

// POST /api/v1/sync/my-pipeline - Sync user's artists + check notifications
router.post('/my-pipeline', protect, async (req, res) => {
    console.log(`User pipeline triggered by: ${req.user.username}`);
    const userId = req.user._id;

    // Respond immediately — pipeline runs in background, progress via SSE
    res.json({ success: true, message: 'User pipeline started. Monitor progress via SSE.' });

    try {
        // Step 1: Sync user's artists
        const syncResult = await backgroundSyncService.syncUserArtists(userId, { verbose: true });

        // Step 2: Emit phase change to notifications
        const emitter = backgroundSyncService.getProgressEmitter();
        emitter.emit('progress', {
            isRunning: true,
            phase: 'notifications',
            currentArtist: 'Checking notifications...',
            currentIndex: 0,
            totalArtists: 0,
            eventsFound: syncResult.eventsFound || 0,
            eventsSaved: syncResult.eventsSaved || 0,
            errors: 0
        });

        // Step 2: Check notifications for this user
        const notifResult = await notificationService.checkEventsForUser(userId);

        // Emit pipeline complete
        emitter.emit('progress', {
            isRunning: false,
            phase: 'complete',
            currentArtist: 'Pipeline complete!',
            currentIndex: syncResult.artistsChecked || 0,
            totalArtists: syncResult.artistsChecked || 0,
            eventsFound: syncResult.eventsFound || 0,
            eventsSaved: syncResult.eventsSaved || 0,
            errors: 0
        });

        console.log(`User pipeline complete: ${syncResult.eventsFound} found, ${syncResult.eventsSaved} saved`);

    } catch (err) {
        console.error('User pipeline error:', err);
        const emitter = backgroundSyncService.getProgressEmitter();
        emitter.emit('progress', {
            isRunning: false,
            phase: 'error',
            currentArtist: `Pipeline error: ${err.message}`,
            errors: 1
        });
    }
});

// POST /api/v1/sync/cleanup - Clean up old events (admin)
router.post('/cleanup', requireAdmin, async (req, res) => {
    try {
        const { daysOld = 30 } = req.body;
        const result = await backgroundSyncService.cleanupOldEvents(daysOld);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/v1/sync/venue-enrich-stats - Get venue enrichment statistics (admin)
router.get('/venue-enrich-stats', requireAdmin, async (req, res) => {
    try {
        const Venue = require('../models/venue');
        const total = await Venue.countDocuments();
        const hasCapacity = await Venue.countDocuments({ capacity: { $ne: null } });
        const hasType = await Venue.countDocuments({ venueType: { $ne: null } });
        const hasOpenAir = await Venue.countDocuments({ openAir: { $ne: null } });
        const allThree = await Venue.countDocuments({ capacity: { $ne: null }, venueType: { $ne: null }, openAir: { $ne: null } });
        const enriched = await Venue.countDocuments({ lastEnrichedAt: { $ne: null } });

        res.json({
            success: true,
            stats: { total, enriched, hasCapacity, hasType, hasOpenAir, allThree, missingAny: total - allThree }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/v1/sync/enrich-venues - Batch enrich all venues missing data (admin)
// Body: { retryIncomplete: true } to re-try venues still missing capacity/type/openAir
router.post('/enrich-venues', requireAdmin, async (req, res) => {
    try {
        const ticketmasterService = require('../services/ticketmasterService');
        const retryIncomplete = req.body?.retryIncomplete || false;
        console.log(`Venue enrichment triggered by user: ${req.user.username} (retryIncomplete: ${retryIncomplete})`);

        // Respond immediately, run in background
        res.json({
            success: true,
            message: 'Venue enrichment started. Check server logs for progress.'
        });

        const result = await ticketmasterService.batchEnrichVenues({ retryIncomplete });
        console.log('Venue enrichment completed:', result);
    } catch (err) {
        console.error('Venue enrichment error:', err);
    }
});

// GET /api/v1/sync/artists - Get list of artists that will be synced (admin)
router.get('/artists', requireAdmin, async (req, res) => {
    try {
        const artists = await backgroundSyncService.getArtistsToSync();
        res.json({ 
            success: true, 
            count: artists.length,
            artists: artists.map(a => ({
                name: a.name,
                ticketmasterId: a.ticketmasterId,
                source: a.source
            }))
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;