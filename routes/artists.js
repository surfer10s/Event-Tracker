const express = require('express');
const router = express.Router();
const Artist = require('../models/artist');

// GET /api/v1/artists/search?q=searchTerm&limit=10
router.get('/search', async (req, res) => {
    try {
        const { q, limit = 10 } = req.query;

        if (!q || q.trim().length < 2) {
            return res.json({ success: true, artists: [] });
        }

        const searchLimit = Math.min(parseInt(limit) || 10, 50);

        // Use regex for partial matching (text index only does full-word matching)
        const artists = await Artist.find({
            name: { $regex: q.trim(), $options: 'i' },
            isActive: true
        })
        .select('name genre images externalIds tourStatus stats')
        .sort({ 'stats.followers': -1, 'stats.upcomingEvents': -1 })
        .limit(searchLimit);

        res.json({
            success: true,
            count: artists.length,
            artists
        });
    } catch (error) {
        console.error('Artist search error:', error);
        res.status(500).json({ success: false, message: 'Error searching artists' });
    }
});

// GET /api/v1/artists/:id
router.get('/:id', async (req, res) => {
    try {
        const artist = await Artist.findById(req.params.id);

        if (!artist) {
            return res.status(404).json({ success: false, message: 'Artist not found' });
        }

        res.json({ success: true, artist });
    } catch (error) {
        console.error('Get artist error:', error);
        res.status(500).json({ success: false, message: 'Error fetching artist' });
    }
});

module.exports = router;
