#!/usr/bin/env node
// Batch deactivate (soft-delete) venues with an activity score of 0
// These are venues with no music events on Ticketmaster or Setlist.fm
//
// Usage:
//   node scripts/batchVenueDeactivate.js                    # deactivate all scored zeros
//   node scripts/batchVenueDeactivate.js --state CA         # only California
//   node scripts/batchVenueDeactivate.js --dry-run          # preview without saving
//   node scripts/batchVenueDeactivate.js --reactivate       # undo: set isActive back to true

require('dotenv').config();
const mongoose = require('mongoose');
const Venue = require('../models/Venue');

// --- CLI args ---
const args = process.argv.slice(2);
function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const STATE_FILTER = getArg('--state');
const DRY_RUN = args.includes('--dry-run');
const REACTIVATE = args.includes('--reactivate');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  if (REACTIVATE) {
    // --- Reactivate: set isActive back to true ---
    const query = { isActive: false, includeInactive: true };
    if (STATE_FILTER) query.state = STATE_FILTER.toUpperCase();

    const venues = await Venue.find(query).select('name city state stats.activityScore');
    console.log(`=== Reactivate Venues ===`);
    if (STATE_FILTER) console.log(`State filter: ${STATE_FILTER.toUpperCase()}`);
    console.log(`Venues to reactivate: ${venues.length}`);
    if (DRY_RUN) console.log(`*** DRY RUN — no changes will be saved ***`);
    console.log('');

    if (!DRY_RUN && venues.length > 0) {
      const filter = { isActive: false };
      if (STATE_FILTER) filter.state = STATE_FILTER.toUpperCase();
      const result = await Venue.updateMany(filter, { $set: { isActive: true } });
      console.log(`Reactivated: ${result.modifiedCount} venues`);
    }
  } else {
    // --- Deactivate: set isActive to false for zero-score venues ---
    const query = {
      'stats.activityScore': 0,
      'stats.lastActivityCheck': { $ne: null },
      isActive: { $ne: false },
      includeInactive: true
    };
    if (STATE_FILTER) query.state = STATE_FILTER.toUpperCase();

    const venues = await Venue.find(query).select('name city state stats.activityScore').lean();

    // Group by state for summary
    const byState = {};
    for (const v of venues) {
      const st = v.state || 'unknown';
      if (!byState[st]) byState[st] = 0;
      byState[st]++;
    }

    console.log(`=== Deactivate Zero-Score Venues ===`);
    if (STATE_FILTER) console.log(`State filter: ${STATE_FILTER.toUpperCase()}`);
    console.log(`Venues to deactivate: ${venues.length}`);
    if (DRY_RUN) console.log(`*** DRY RUN — no changes will be saved ***`);
    console.log('\nBy state:');
    for (const [st, count] of Object.entries(byState).sort()) {
      console.log(`  ${st}: ${count}`);
    }

    if (!DRY_RUN && venues.length > 0) {
      const ids = venues.map(v => v._id);
      const result = await Venue.updateMany(
        { _id: { $in: ids } },
        { $set: { isActive: false } }
      );
      console.log(`\nDeactivated: ${result.modifiedCount} venues`);
    }
  }

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Batch failed:', err);
  process.exit(1);
});
