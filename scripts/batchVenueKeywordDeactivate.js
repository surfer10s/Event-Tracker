#!/usr/bin/env node
// Deactivate low-score venues matching non-music-venue name keywords
//
// Usage:
//   node scripts/batchVenueKeywordDeactivate.js --dry-run    # preview only
//   node scripts/batchVenueKeywordDeactivate.js              # deactivate for real

require('dotenv').config();
const mongoose = require('mongoose');
const Venue = require('../models/venue');

const DRY_RUN = process.argv.includes('--dry-run');
const MAX_SCORE = 15;

// Non-music venue keywords
const keywords = [
  'Church', 'Baptist', 'Methodist', 'Lutheran', 'Presbyterian',
  'Chapel', 'Synagogue', 'Mosque',
  'Hotel', 'Motel', 'Marriott', 'Hilton', 'Hyatt', 'Holiday Inn', 'Best Western',
  'Sheraton', 'Ramada', 'Courtyard by', 'Hampton Inn', 'Comfort Inn', 'La Quinta',
  'Transportation Center', 'Transit Center', 'Airport', 'Train Station',
  'Mall(?!ory)', 'Shopping Center', 'Shopping Mall', 'Walmart', 'Target',
  'Hospital', 'Medical Center',
  'Elementary School', 'Middle School', 'High School',
  'Public Library',
  'Community Center', 'Rec Center', 'Recreation Center',
  'Parking Lot', 'Parking Garage'
];

// Exceptions — venues with these words that ARE music venues
const exceptions = [
  'House of Blues', 'Brooklyn Steel', 'Church of the Living Arts',
  'The Church', 'Ryman', 'Tabernacle', 'Cathedral', 'Sanctuary',
  'Hotel Cafe', 'Hotel Utah', 'Hotel Crocodile'
];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const regex = new RegExp(keywords.join('|'), 'i');
  const exceptionRegex = new RegExp(exceptions.join('|'), 'i');

  const candidates = await Venue.find({
    isActive: { $ne: false },
    name: regex,
    'stats.activityScore': { $gt: 0, $lte: MAX_SCORE },
    'stats.lastActivityCheck': { $ne: null }
  }).select('name city state stats.activityScore').sort({ 'stats.activityScore': -1 });

  // Filter out exceptions
  const toDeactivate = candidates.filter(v => !exceptionRegex.test(v.name));
  const excepted = candidates.filter(v => exceptionRegex.test(v.name));

  console.log(`=== Keyword Deactivation (score <= ${MAX_SCORE}) ===`);
  if (DRY_RUN) console.log('*** DRY RUN — no changes ***\n');
  console.log(`Matched: ${candidates.length} | Excepted: ${excepted.length} | To deactivate: ${toDeactivate.length}\n`);

  if (excepted.length > 0) {
    console.log('--- Excepted (kept active) ---');
    excepted.forEach(v => console.log(`  [${v.stats.activityScore}] ${v.name} (${v.city}, ${v.state})`));
    console.log('');
  }

  // Group by state
  const byState = {};
  toDeactivate.forEach(v => {
    const st = v.state || 'unknown';
    if (!byState[st]) byState[st] = [];
    byState[st].push(v);
  });

  console.log('--- To deactivate ---');
  for (const [state, venues] of Object.entries(byState).sort()) {
    console.log(`\n  ${state} (${venues.length}):`);
    venues.forEach(v => console.log(`    [${v.stats.activityScore}] ${v.name} (${v.city})`));
  }

  if (!DRY_RUN && toDeactivate.length > 0) {
    const ids = toDeactivate.map(v => v._id);
    const result = await Venue.updateMany({ _id: { $in: ids } }, { $set: { isActive: false } });
    console.log(`\nDeactivated: ${result.modifiedCount} venues`);
  }

  await mongoose.disconnect();
}

run().catch(err => { console.error('Failed:', err); process.exit(1); });
