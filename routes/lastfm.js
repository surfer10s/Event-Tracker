// Last.fm API Routes
const express = require('express');
const router = express.Router();

const LASTFM_API_URL = 'https://ws.audioscrobbler.com/2.0/';

// GET /api/v1/lastfm/similar/:artistName - Get similar artists
router.get('/similar/:artistName', async (req, res) => {
    try {
        const { artistName } = req.params;
        const limit = parseInt(req.query.limit) || 30;
        
        if (!process.env.LASTFM_API_KEY || process.env.LASTFM_API_KEY === 'your_lastfm_api_key_here') {
            return res.status(500).json({
                success: false,
                error: 'Last.fm API key not configured. Add LASTFM_API_KEY to your .env file.'
            });
        }
        
        const url = `${LASTFM_API_URL}?method=artist.getsimilar&artist=${encodeURIComponent(artistName)}&api_key=${process.env.LASTFM_API_KEY}&format=json&limit=${limit}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error) {
            return res.status(400).json({
                success: false,
                error: data.message || 'Last.fm API error',
                code: data.error
            });
        }
        
        if (!data.similarartists?.artist) {
            return res.json({
                success: true,
                artists: [],
                message: 'No similar artists found'
            });
        }
        
        // Format the response
        const artists = data.similarartists.artist.map(artist => ({
            name: artist.name,
            match: parseFloat(artist.match),
            matchPercent: Math.round(parseFloat(artist.match) * 100),
            url: artist.url,
            image: artist.image?.find(img => img.size === 'large')?.['#text'] || 
                   artist.image?.find(img => img.size === 'medium')?.['#text'] ||
                   artist.image?.[2]?.['#text'] || null
        }));
        
        res.json({
            success: true,
            basedOn: artistName,
            count: artists.length,
            artists
        });
        
    } catch (error) {
        console.error('Last.fm similar artists error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/v1/lastfm/artist/:artistName - Get artist info
router.get('/artist/:artistName', async (req, res) => {
    try {
        const { artistName } = req.params;
        
        if (!process.env.LASTFM_API_KEY || process.env.LASTFM_API_KEY === 'your_lastfm_api_key_here') {
            return res.status(500).json({
                success: false,
                error: 'Last.fm API key not configured'
            });
        }
        
        const url = `${LASTFM_API_URL}?method=artist.getinfo&artist=${encodeURIComponent(artistName)}&api_key=${process.env.LASTFM_API_KEY}&format=json`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error) {
            return res.status(400).json({
                success: false,
                error: data.message || 'Last.fm API error'
            });
        }
        
        const artist = data.artist;
        
        res.json({
            success: true,
            artist: {
                name: artist.name,
                mbid: artist.mbid,
                url: artist.url,
                image: artist.image?.find(img => img.size === 'large')?.['#text'] || null,
                listeners: parseInt(artist.stats?.listeners) || 0,
                playcount: parseInt(artist.stats?.playcount) || 0,
                bio: artist.bio?.summary?.replace(/<[^>]*>/g, '') || null,
                tags: artist.tags?.tag?.map(t => t.name) || [],
                similar: artist.similar?.artist?.map(a => a.name) || []
            }
        });
        
    } catch (error) {
        console.error('Last.fm artist info error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/v1/lastfm/top-artists - Get top artists (for discovery)
router.get('/top-artists', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        
        if (!process.env.LASTFM_API_KEY || process.env.LASTFM_API_KEY === 'your_lastfm_api_key_here') {
            return res.status(500).json({
                success: false,
                error: 'Last.fm API key not configured'
            });
        }
        
        const url = `${LASTFM_API_URL}?method=chart.gettopartists&api_key=${process.env.LASTFM_API_KEY}&format=json&limit=${limit}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error) {
            return res.status(400).json({
                success: false,
                error: data.message || 'Last.fm API error'
            });
        }
        
        const artists = data.artists?.artist?.map(artist => ({
            name: artist.name,
            playcount: parseInt(artist.playcount) || 0,
            listeners: parseInt(artist.listeners) || 0,
            url: artist.url,
            image: artist.image?.find(img => img.size === 'large')?.['#text'] || null
        })) || [];
        
        res.json({
            success: true,
            count: artists.length,
            artists
        });
        
    } catch (error) {
        console.error('Last.fm top artists error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;