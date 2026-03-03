#!/usr/bin/env node
// Batch geocode venues that are missing coordinates
// Uses Google Geocoding API with venue name + city for accuracy
//
// Usage: node scripts/batchVenueGeocode.js [--dry-run]

require('dotenv').config();
const mongoose = require('mongoose');
const Venue = require('../models/Venue');

const GOOGLE_GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const DELAY_MS = 100; // 100ms = 10 req/sec (well under Google's 50 req/sec limit)
const dryRun = process.argv.includes('--dry-run');

async function geocodeVenue(venue) {
  const apiKey = process.env.GOOGLE_GEOCODING_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_GEOCODING_API_KEY not set');

  // Build a search string: venue name + address + city + country
  // Using venue name gives more precise results than just city
  const parts = [venue.name];
  if (venue.address) parts.push(venue.address);
  if (venue.city) parts.push(venue.city);
  if (venue.state) parts.push(venue.state);
  if (venue.country) parts.push(venue.country);
  const query = parts.join(', ');

  const url = `${GOOGLE_GEOCODING_URL}?address=${encodeURIComponent(query)}&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.status === 'OK' && data.results?.length > 0) {
    const loc = data.results[0].geometry.location;
    return { lat: loc.lat, lng: loc.lng, formatted: data.results[0].formatted_address };
  }

  if (data.status === 'OVER_QUERY_LIMIT') {
    throw new Error('OVER_QUERY_LIMIT');
  }

  return null;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');
  if (dryRun) console.log('*** DRY RUN — no changes will be saved ***\n');

  const venues = await Venue.find({
    $or: [
      { 'location.coordinates': { $exists: false } },
      { 'location.coordinates': null },
      { 'location.coordinates': [] },
      { 'location.coordinates': [0, 0] }
    ]
  }).sort({ 'stats.totalEvents': -1 });

  console.log(`Found ${venues.length} venues missing coordinates\n`);

  let geocoded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < venues.length; i++) {
    const venue = venues[i];
    try {
      const result = await geocodeVenue(venue);

      if (result) {
        if (!dryRun) {
          venue.location = {
            type: 'Point',
            coordinates: [result.lng, result.lat] // GeoJSON: [lng, lat]
          };
          await venue.save();
        }
        geocoded++;
        console.log(`  [${i + 1}/${venues.length}] ✓ ${venue.name} (${venue.city}) → ${result.lat.toFixed(4)}, ${result.lng.toFixed(4)}`);
      } else {
        skipped++;
        console.log(`  [${i + 1}/${venues.length}] - ${venue.name} (${venue.city}) — not found`);
      }
    } catch (err) {
      if (err.message === 'OVER_QUERY_LIMIT') {
        console.error('\n  ⚠ Google API quota exceeded — stopping.');
        console.log(`  Processed ${i} of ${venues.length} before hitting limit.\n`);
        break;
      }
      failed++;
      console.error(`  [${i + 1}/${venues.length}] ✗ ${venue.name} — ${err.message}`);
    }

    if ((i + 1) % 50 === 0) {
      console.log(`\n  Progress: ${i + 1}/${venues.length} | geocoded: ${geocoded} | skipped: ${skipped} | failed: ${failed}\n`);
    }

    if (i < venues.length - 1) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  console.log('\n=== Batch Complete ===');
  console.log(`Total: ${venues.length}`);
  console.log(`Geocoded: ${geocoded}`);
  console.log(`Not found: ${skipped}`);
  console.log(`Failed: ${failed}`);

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Batch failed:', err);
  process.exit(1);
});
