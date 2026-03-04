#!/usr/bin/env node
// Batch fetch real venue photos for all venues missing one
// Skips TM API entirely — only hits Wikipedia/Wikimedia/Google Places
//
// Usage: node scripts/batchVenuePhotos.js [--force]
//   --force   Re-fetch even for venues that already have a photoSource

require('dotenv').config();
const mongoose = require('mongoose');
const Venue = require('../models/venue');
const { fetchVenuePhoto } = require('../services/venuePhotoService');

const DELAY_MS = 1500; // delay between venues to be polite to APIs
const force = process.argv.includes('--force');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Run for ALL venues — TM "hero" images are usually just logos, not real photos
  const venues = await Venue.find({}).sort({ 'stats.totalEvents': -1 });
  console.log(`Found ${venues.length} venues to fetch photos for`);

  let fetched = 0;
  let skipped = 0;
  let failed = 0;
  const sources = { wikimedia: 0, google_places: 0 };

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
        console.log(`  [${i + 1}/${venues.length}] ✓ ${venue.name} — ${photo.source}`);
      } else {
        skipped++;
        console.log(`  [${i + 1}/${venues.length}] - ${venue.name} — no photo found`);
      }
    } catch (err) {
      failed++;
      console.error(`  [${i + 1}/${venues.length}] ✗ ${venue.name} — ${err.message}`);
    }

    // Progress summary every 50 venues
    if ((i + 1) % 50 === 0) {
      console.log(`\n  Progress: ${i + 1}/${venues.length} | fetched: ${fetched} | skipped: ${skipped} | failed: ${failed}\n`);
    }

    // Rate limit delay
    if (i < venues.length - 1) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  console.log('\n=== Batch Complete ===');
  console.log(`Total: ${venues.length}`);
  console.log(`Fetched: ${fetched} (Wikipedia/Commons: ${sources.wikimedia || 0}, Google Places: ${sources.google_places || 0})`);
  console.log(`No photo found: ${skipped}`);
  console.log(`Failed: ${failed}`);

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Batch failed:', err);
  process.exit(1);
});
