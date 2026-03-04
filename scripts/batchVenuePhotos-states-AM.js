#!/usr/bin/env node
// Batch fetch venue photos for venues in states A-M
// Skips venues that already have a hero image
//
// Usage: node scripts/batchVenuePhotos-states-AM.js

require('dotenv').config();
const mongoose = require('mongoose');
const Venue = require('../models/venue');
const { fetchVenuePhoto } = require('../services/venuePhotoService');

const DELAY_MS = 1500;

// All US states where the first letter is A through M
const STATES = [
  'AL', 'AK', 'AZ', 'AR',        // A
  'CA', 'CO', 'CT',               // C
  'DE',                            // D
  'FL',                            // F
  'GA',                            // G
  'HI',                            // H
  'ID', 'IL', 'IN', 'IA',         // I
  'KS', 'KY',                     // K
  'LA',                            // L
  'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT'  // M
];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');
  console.log(`Targeting states: ${STATES.join(', ')}\n`);

  const venues = await Venue.find({
    state: { $in: STATES },
    $or: [
      { 'images.hero': { $exists: false } },
      { 'images.hero': '' },
      { 'images.hero': null }
    ]
  }).sort({ 'stats.upcomingEvents': -1, state: 1 });

  console.log(`${venues.length} venues need photos\n`);

  let fetched = 0;
  let skipped = 0;
  let failed = 0;
  const sources = {};
  const startTime = Date.now();

  for (let i = 0; i < venues.length; i++) {
    const venue = venues[i];
    try {
      const photo = await fetchVenuePhoto(venue.name, venue.city, venue.state);

      if (photo) {
        if (!venue.images) venue.images = {};
        venue.images.hero = photo.url;
        venue.images.photoSource = photo.source;
        if (photo.attribution) {
          venue.images.photoAttribution = photo.attribution;
        }
        if (!venue.images.large && photo.width && photo.width >= 1024) {
          venue.images.large = photo.url;
        }
        await venue.save();
        fetched++;
        sources[photo.source] = (sources[photo.source] || 0) + 1;
        console.log(`  [${i + 1}/${venues.length}] ✓ ${venue.name} (${venue.state}) — ${photo.source}`);
      } else {
        skipped++;
        console.log(`  [${i + 1}/${venues.length}] - ${venue.name} (${venue.state}) — no photo found`);
      }
    } catch (err) {
      failed++;
      console.error(`  [${i + 1}/${venues.length}] ✗ ${venue.name} (${venue.state}) — ${err.message}`);
    }

    // Progress summary every 100 venues
    if ((i + 1) % 100 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      const rate = ((i + 1) / (Date.now() - startTime) * 1000).toFixed(1);
      const remaining = (((venues.length - i - 1) / rate) / 60).toFixed(1);
      console.log(`\n  Progress: ${i + 1}/${venues.length} | fetched: ${fetched} | skipped: ${skipped} | failed: ${failed} | ${elapsed}min elapsed | ~${remaining}min remaining\n`);
    }

    if (i < venues.length - 1) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log('\n=== Batch Complete (States A-M) ===');
  console.log(`Total processed: ${venues.length}`);
  console.log(`Fetched: ${fetched}`);
  Object.entries(sources).forEach(([src, count]) => console.log(`  - ${src}: ${count}`));
  console.log(`No photo found: ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total time: ${totalTime} minutes`);

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Batch failed:', err);
  process.exit(1);
});
