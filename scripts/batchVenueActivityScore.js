#!/usr/bin/env node
// Batch venue activity scoring job
// Queries Ticketmaster (upcoming events) and Setlist.fm (past concerts) to compute
// an activity score (0-100) for each venue, identifying genuinely active music venues.
//
// Usage:
//   node scripts/batchVenueActivityScore.js                    # all unscored venues
//   node scripts/batchVenueActivityScore.js --limit 500        # cap at 500 venues
//   node scripts/batchVenueActivityScore.js --state CA         # only California venues
//   node scripts/batchVenueActivityScore.js --rescore          # re-score venues scored >30 days ago
//   node scripts/batchVenueActivityScore.js --tm-only          # skip Setlist.fm (TM data only)
//   node scripts/batchVenueActivityScore.js --setlist-only     # skip TM (Setlist.fm data only)
//   node scripts/batchVenueActivityScore.js --zeros-only       # only venues with 0 TM music events

require('dotenv').config();
const mongoose = require('mongoose');
const Venue = require('../models/Venue');
const tmService = require('../services/ticketmasterService');
const setlistService = require('../services/setlistService');

// --- CLI args ---
const args = process.argv.slice(2);
function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const STATE_FILTER = getArg('--state');
const LIMIT = getArg('--limit') ? parseInt(getArg('--limit'), 10) : 0;
const RESCORE = args.includes('--rescore');
const TM_ONLY = args.includes('--tm-only');
const SETLIST_ONLY = args.includes('--setlist-only');
const ZEROS_ONLY = args.includes('--zeros-only');

// --- Rate limit delays ---
const TM_DELAY_MS = 1000;       // 1 req/sec (conservative, well under 5/sec limit)
const SETLIST_DELAY_MS = 1500;   // ~0.7 req/sec (conservative, well under 2/sec limit)

// --- Score formula ---
function computeActivityScore(tmCount, setlistCount) {
  return Math.min(100, (tmCount * 3) + (setlistCount * 0.5));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDuration(ms) {
  const secs = Math.floor(ms / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  // --- Build query ---
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const query = {
    'externalIds.ticketmaster': { $exists: true, $ne: null }
  };

  if (ZEROS_ONLY) {
    // Target venues with 0 TM music events that are missing Setlist.fm data
    query.$and = [
      { $or: [
        { 'stats.tmUpcomingEventCount': 0 },
        { 'stats.tmUpcomingEventCount': null }
      ]},
      { $or: [
        { 'stats.setlistfmPastEventCount': null },
        { 'stats.setlistfmPastEventCount': { $exists: false } }
      ]}
    ];
  } else if (RESCORE) {
    // Re-score venues that were scored more than 30 days ago
    query.$or = [
      { 'stats.lastActivityCheck': null },
      { 'stats.lastActivityCheck': { $exists: false } },
      { 'stats.lastActivityCheck': { $lt: thirtyDaysAgo } }
    ];
  } else {
    // Only unscored venues
    query.$or = [
      { 'stats.lastActivityCheck': null },
      { 'stats.lastActivityCheck': { $exists: false } }
    ];
  }

  if (STATE_FILTER) {
    query.state = STATE_FILTER.toUpperCase();
  }

  let findQuery = Venue.find(query).sort({ 'stats.upcomingEvents': -1 });
  if (LIMIT > 0) {
    findQuery = findQuery.limit(LIMIT);
  }

  const venues = await findQuery;

  console.log(`=== Venue Activity Scoring ===`);
  console.log(`Venues to process: ${venues.length}`);
  if (STATE_FILTER) console.log(`State filter: ${STATE_FILTER.toUpperCase()}`);
  if (LIMIT) console.log(`Limit: ${LIMIT}`);
  if (RESCORE) console.log(`Mode: rescore (>30 days stale)`);
  if (TM_ONLY) console.log(`Mode: TM-only (skipping Setlist.fm)`);
  if (SETLIST_ONLY) console.log(`Mode: setlist-only (skipping TM)`);
  if (ZEROS_ONLY) console.log(`Mode: zeros-only (TM music events = 0)`);
  console.log('');

  if (venues.length === 0) {
    console.log('No venues to score. Done.');
    await mongoose.disconnect();
    return;
  }

  // --- Process venues ---
  let scored = 0;
  let skipped = 0;
  let errors = 0;
  let totalScore = 0;
  const buckets = { 0: 0, '1-25': 0, '26-50': 0, '51-75': 0, '76-100': 0 };
  const startTime = Date.now();

  for (let i = 0; i < venues.length; i++) {
    const venue = venues[i];
    const tmId = venue.externalIds.ticketmaster;
    let tmCount = null;
    let setlistCount = null;

    // --- Step A: Ticketmaster upcoming event count ---
    if (!SETLIST_ONLY) {
      try {
        const tmResult = await tmService.searchEvents({ venueId: tmId, classificationName: 'music', size: 1 });
        if (tmResult.success) {
          tmCount = tmResult.pagination.totalElements;
        } else {
          console.warn(`  [TM] Failed for "${venue.name}": ${tmResult.error}`);
        }
      } catch (err) {
        if (err.response?.status === 429) {
          console.warn(`  [TM] Rate limited on "${venue.name}", skipping TM count`);
        } else {
          console.warn(`  [TM] Error for "${venue.name}": ${err.message}`);
        }
      }

      await delay(TM_DELAY_MS);
    } else {
      // Carry forward existing TM count
      tmCount = venue.stats.tmUpcomingEventCount || 0;
    }

    // --- Step B: Setlist.fm past event count ---
    if (!TM_ONLY) {
      try {
        const setlistResult = await setlistService.searchSetlists({
          venueName: venue.name,
          cityName: venue.city
        });
        if (setlistResult.success) {
          setlistCount = setlistResult.pagination.total;
        } else {
          console.warn(`  [Setlist.fm] Failed for "${venue.name}": ${setlistResult.error}`);
        }
      } catch (err) {
        if (err.response?.status === 429) {
          console.warn(`  [Setlist.fm] Rate limited on "${venue.name}", skipping setlist count`);
        } else if (err.response?.status === 404) {
          setlistCount = 0;
        } else {
          console.warn(`  [Setlist.fm] Error for "${venue.name}": ${err.message}`);
        }
      }

      await delay(SETLIST_DELAY_MS);
    }

    // --- Step C: Compute score and save ---
    if (tmCount === null && setlistCount === null) {
      // Both APIs failed — skip this venue, don't mark as checked
      skipped++;
      continue;
    }

    const safeTm = tmCount || 0;
    const safeSetlist = setlistCount || 0;
    const score = computeActivityScore(safeTm, safeSetlist);

    try {
      venue.stats.tmUpcomingEventCount = tmCount;
      venue.stats.setlistfmPastEventCount = setlistCount;
      venue.stats.activityScore = score;
      venue.stats.lastActivityCheck = new Date();
      await venue.save();

      scored++;
      totalScore += score;

      // Bucket the score
      if (score === 0) buckets[0]++;
      else if (score <= 25) buckets['1-25']++;
      else if (score <= 50) buckets['26-50']++;
      else if (score <= 75) buckets['51-75']++;
      else buckets['76-100']++;

    } catch (saveErr) {
      errors++;
      console.error(`  [Save] Error saving "${venue.name}": ${saveErr.message}`);
      continue;
    }

    // --- Progress logging every 100 venues ---
    if ((i + 1) % 100 === 0 || i === venues.length - 1) {
      const elapsed = Date.now() - startTime;
      const perVenue = elapsed / (i + 1);
      const remaining = perVenue * (venues.length - i - 1);
      console.log(
        `  [${i + 1}/${venues.length}] scored: ${scored} | skipped: ${skipped} | errors: ${errors} ` +
        `| elapsed: ${formatDuration(elapsed)} | ETA: ${formatDuration(remaining)}`
      );
    }
  }

  // --- Final summary ---
  const elapsed = Date.now() - startTime;
  console.log('\n=== Scoring Complete ===');
  console.log(`Total processed: ${venues.length}`);
  console.log(`Scored: ${scored}`);
  console.log(`Skipped (both APIs failed): ${skipped}`);
  console.log(`Save errors: ${errors}`);
  console.log(`Average score: ${scored > 0 ? (totalScore / scored).toFixed(1) : 'N/A'}`);
  console.log(`Time: ${formatDuration(elapsed)}`);
  console.log('\nScore distribution:');
  console.log(`  0:       ${buckets[0]}`);
  console.log(`  1-25:    ${buckets['1-25']}`);
  console.log(`  26-50:   ${buckets['26-50']}`);
  console.log(`  51-75:   ${buckets['51-75']}`);
  console.log(`  76-100:  ${buckets['76-100']}`);

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Batch failed:', err);
  process.exit(1);
});
