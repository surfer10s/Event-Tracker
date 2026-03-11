// Artist Import Routes - Batch import artists from seed list via Ticketmaster
// Admin-only routes mounted at /api/v1/artist-import

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { requireAdmin } = require('../middleware/adminAuth');
const Artist = require('../models/artist');
const ticketmasterService = require('../services/ticketmasterService');

const SEED_LIST_PATH = path.join(__dirname, '..', 'scripts', 'artist-seed-list.json');

// Helper: read seed list from disk
function readSeedList() {
  if (!fs.existsSync(SEED_LIST_PATH)) return [];
  return JSON.parse(fs.readFileSync(SEED_LIST_PATH, 'utf8'));
}

// Helper: write seed list to disk
function writeSeedList(list) {
  fs.writeFileSync(SEED_LIST_PATH, JSON.stringify(list, null, 2), 'utf8');
}

// Helper: escape regex special chars for case-insensitive name match
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /stats - Seed list count, already-imported count, pending count
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const seedList = readSeedList();
    const seedNames = seedList.map(a => a.name);

    // Case-insensitive check which seed artists already exist in DB
    const existingArtists = await Artist.find({
      name: { $in: seedNames.map(n => new RegExp(`^${escapeRegex(n)}$`, 'i')) }
    }).select('name');

    const existingNamesLower = new Set(existingArtists.map(a => a.name.toLowerCase()));
    const imported = seedNames.filter(n => existingNamesLower.has(n.toLowerCase())).length;

    res.json({
      success: true,
      total: seedList.length,
      imported,
      pending: seedList.length - imported
    });
  } catch (error) {
    console.error('Artist import stats error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /seed-list - Full seed list with import status per artist
router.get('/seed-list', requireAdmin, async (req, res) => {
  try {
    const seedList = readSeedList();
    const seedNames = seedList.map(a => a.name);

    // Batch lookup all seed artists in DB
    const existingArtists = await Artist.find({
      name: { $in: seedNames.map(n => new RegExp(`^${escapeRegex(n)}$`, 'i')) }
    }).select('name externalIds');

    const existingMap = {};
    for (const a of existingArtists) {
      existingMap[a.name.toLowerCase()] = {
        id: a._id,
        tmId: a.externalIds?.ticketmaster
      };
    }

    const enriched = seedList.map((item, index) => {
      const existing = existingMap[item.name.toLowerCase()];
      return {
        index,
        name: item.name,
        genre: item.genre || '',
        notes: item.notes || '',
        status: existing ? 'imported' : 'pending',
        artistId: existing?.id || null,
        tmId: existing?.tmId || null
      };
    });

    res.json({ success: true, artists: enriched });
  } catch (error) {
    console.error('Seed list error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /run - Batch import with { limit, fetchEvents, dryRun }
router.post('/run', requireAdmin, async (req, res) => {
  try {
    const { limit = 50, fetchEvents = false, dryRun = false } = req.body;
    const seedList = readSeedList();
    const startTime = Date.now();

    const results = {
      created: 0,
      alreadyExisted: 0,
      notFound: 0,
      tmSearches: 0,
      errors: 0,
      artists: []
    };

    // Find pending artists (not yet in DB)
    const allArtists = await Artist.find({}).select('name externalIds');
    const existingNamesLower = new Set(allArtists.map(a => a.name.toLowerCase()));
    const existingTmIds = new Set(
      allArtists.filter(a => a.externalIds?.ticketmaster).map(a => a.externalIds.ticketmaster)
    );

    const pending = seedList.filter(item => !existingNamesLower.has(item.name.toLowerCase()));
    const toProcess = pending.slice(0, limit);

    for (const item of toProcess) {
      try {
        // Double-check DB (in case of duplicates created during this run)
        const dbCheck = await Artist.findOne({
          name: new RegExp(`^${escapeRegex(item.name)}$`, 'i')
        });

        if (dbCheck) {
          results.alreadyExisted++;
          results.artists.push({ name: item.name, status: 'already_existed' });
          continue;
        }

        // Search Ticketmaster
        results.tmSearches++;
        const tmResult = await ticketmasterService.searchArtists(item.name);

        if (!tmResult.success || tmResult.artists.length === 0) {
          results.notFound++;
          results.artists.push({ name: item.name, status: 'not_found' });
          // Rate limit delay
          await delay(1000);
          continue;
        }

        // Exact case-insensitive name match only
        const match = tmResult.artists.find(
          a => a.name.toLowerCase() === item.name.toLowerCase()
        );

        if (!match) {
          results.notFound++;
          results.artists.push({ name: item.name, status: 'not_found', note: 'No exact match' });
          await delay(1000);
          continue;
        }

        // Check TM ID dedup
        if (existingTmIds.has(match.externalId)) {
          results.alreadyExisted++;
          results.artists.push({ name: item.name, status: 'already_existed', note: 'TM ID exists' });
          await delay(1000);
          continue;
        }

        if (dryRun) {
          results.created++;
          results.artists.push({
            name: match.name,
            status: 'would_create',
            tmId: match.externalId,
            genre: match.genre
          });
          await delay(1000);
          continue;
        }

        // Create artist doc (same pattern as autoImportArtistsAsFavorites)
        const artist = await Artist.create({
          name: match.name,
          externalIds: { ticketmaster: match.externalId },
          genre: match.genre ? [match.genre] : [],
          images: {
            large: match.images?.[0]?.url,
            medium: match.images?.[1]?.url,
            thumbnail: match.images?.[2]?.url
          },
          tourStatus: 'unknown',
          lastUpdated: new Date()
        });

        // Track the new TM ID to prevent duplicates within this batch
        existingTmIds.add(match.externalId);
        existingNamesLower.add(match.name.toLowerCase());

        // Optionally fetch events
        if (fetchEvents && match.externalId) {
          try {
            const evResult = await ticketmasterService.getArtistUpcomingEvents(match.externalId);
            if (evResult.success && evResult.events.length > 0) {
              let savedCount = 0;
              for (const event of evResult.events) {
                try {
                  const saveResult = await ticketmasterService.saveEventToDatabase(event);
                  if (saveResult && saveResult.success) savedCount++;
                } catch (e) { /* skip individual event errors */ }
              }
              results.artists.push({
                name: match.name,
                status: 'created',
                tmId: match.externalId,
                genre: match.genre,
                eventsFetched: evResult.events.length,
                eventsSaved: savedCount
              });
            } else {
              results.artists.push({
                name: match.name,
                status: 'created',
                tmId: match.externalId,
                genre: match.genre,
                eventsFetched: 0
              });
            }
          } catch (evErr) {
            console.error(`Event fetch error for ${match.name}:`, evErr.message);
            results.artists.push({
              name: match.name,
              status: 'created',
              tmId: match.externalId,
              genre: match.genre,
              eventsFetched: 0,
              eventError: evErr.message
            });
          }
        } else {
          results.artists.push({
            name: match.name,
            status: 'created',
            tmId: match.externalId,
            genre: match.genre
          });
        }

        results.created++;

        // Rate limit: 1s between TM calls
        await delay(1000);

      } catch (artistErr) {
        console.error(`Import error for "${item.name}":`, artistErr.message);
        results.errors++;
        results.artists.push({ name: item.name, status: 'error', error: artistErr.message });
        await delay(1000);
      }
    }

    results.duration = Date.now() - startTime;
    results.dryRun = dryRun;

    console.log(`Artist import complete: ${results.created} created, ${results.alreadyExisted} existed, ${results.notFound} not found, ${results.tmSearches} TM searches, ${results.duration}ms`);

    res.json({ success: true, ...results });
  } catch (error) {
    console.error('Artist import run error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /add-to-seed - Add artist to seed list
router.post('/add-to-seed', requireAdmin, async (req, res) => {
  try {
    const { name, genre, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Artist name is required' });
    }

    const seedList = readSeedList();

    // Check for duplicate (case-insensitive)
    const exists = seedList.some(a => a.name.toLowerCase() === name.trim().toLowerCase());
    if (exists) {
      return res.status(400).json({ success: false, error: 'Artist already in seed list' });
    }

    const entry = { name: name.trim() };
    if (genre && genre.trim()) entry.genre = genre.trim();
    if (notes && notes.trim()) entry.notes = notes.trim();

    seedList.push(entry);
    writeSeedList(seedList);

    res.json({ success: true, message: `Added "${entry.name}" to seed list`, total: seedList.length });
  } catch (error) {
    console.error('Add to seed list error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /seed-list/:index - Remove artist from seed list
router.delete('/seed-list/:index', requireAdmin, async (req, res) => {
  try {
    const index = parseInt(req.params.index, 10);
    const seedList = readSeedList();

    if (isNaN(index) || index < 0 || index >= seedList.length) {
      return res.status(400).json({ success: false, error: 'Invalid index' });
    }

    const removed = seedList.splice(index, 1)[0];
    writeSeedList(seedList);

    res.json({ success: true, message: `Removed "${removed.name}" from seed list`, total: seedList.length });
  } catch (error) {
    console.error('Remove from seed list error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = router;
