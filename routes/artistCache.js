// Artist Cache Routes
// Manual triggers and status for artist caching job

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const artistCacheService = require('../services/artistCacheService');

// GET /api/v1/artist-cache/stats - Get cache job statistics
router.get('/stats', protect, async (req, res) => {
    try {
        const stats = artistCacheService.getCacheStats();
        res.json({ success: true, stats });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/v1/artist-cache/coverage - Get cache coverage info
router.get('/coverage', protect, async (req, res) => {
    try {
        const coverage = await artistCacheService.getCacheCoverage();
        res.json({ success: true, coverage });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/v1/artist-cache/uncached - Get list of uncached artists
router.get('/uncached', protect, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const uncached = await artistCacheService.getUncachedArtists();
        res.json({ 
            success: true, 
            total: uncached.length,
            artists: uncached.slice(0, limit)
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/v1/artist-cache/run - Run the cache job
router.post('/run', protect, async (req, res) => {
    try {
        const { maxArtists = 100, dryRun = false } = req.body;
        
        console.log(`\nArtist cache job triggered by: ${req.user.username}`);
        console.log(`Max artists: ${maxArtists}, Dry run: ${dryRun}`);
        
        const result = await artistCacheService.runCacheJob({
            verbose: true,
            maxArtists: Math.min(maxArtists, 500), // Cap at 500
            dryRun
        });
        
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/v1/artist-cache/single - Cache a single artist by name
router.post('/single', protect, async (req, res) => {
    try {
        const { artistName } = req.body;
        
        if (!artistName) {
            return res.status(400).json({ success: false, error: 'artistName required' });
        }
        
        const result = await artistCacheService.cacheArtist(artistName, { verbose: true });
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
