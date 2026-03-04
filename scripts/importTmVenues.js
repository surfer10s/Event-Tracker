#!/usr/bin/env node
// Batch import all US venues from Ticketmaster Discovery API
// Paginates state-by-state to get full coverage
// Deduplicates against existing venues using normalizedKey
//
// Usage: node scripts/importTmVenues.js

require('dotenv').config();
const axios = require('axios');
const mongoose = require('mongoose');
const Venue = require('../models/venue');

const TM_BASE_URL = 'https://app.ticketmaster.com/discovery/v2';
const API_KEY = process.env.TICKETMASTER_API_KEY;
const PAGE_SIZE = 200; // max allowed by TM API
const DELAY_MS = 250;  // 4 req/sec to stay under TM rate limit (5/sec)

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
  'DC'
];

async function fetchTmVenuesForState(stateCode, page = 0) {
  const res = await axios.get(`${TM_BASE_URL}/venues.json`, {
    params: {
      apikey: API_KEY,
      countryCode: 'US',
      stateCode,
      size: PAGE_SIZE,
      page,
      sort: 'name,asc'
    },
    timeout: 15000
  });

  const venues = res.data._embedded?.venues || [];
  const pageInfo = res.data.page || {};
  return { venues, totalElements: pageInfo.totalElements || 0, totalPages: pageInfo.totalPages || 0 };
}

function parseTmVenue(v) {
  const name = v.name?.trim();
  const city = v.city?.name?.trim();
  const state = v.state?.stateCode;
  if (!name || !city) return null;

  let location;
  if (v.location?.latitude && v.location?.longitude) {
    const lat = parseFloat(v.location.latitude);
    const lng = parseFloat(v.location.longitude);
    if (!isNaN(lat) && !isNaN(lng)) {
      location = { type: 'Point', coordinates: [lng, lat] };
    }
  }

  return {
    name,
    city,
    state: state || '',
    country: v.country?.countryCode || 'US',
    address: v.address?.line1,
    zipCode: v.postalCode,
    location,
    capacity: v.upcomingEvents?._total ? undefined : undefined, // TM doesn't expose capacity in list
    url: v.url,
    externalIds: { ticketmaster: v.id }
  };
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Pre-load all existing normalizedKeys for fast dedup
  const existingKeys = new Set();
  const existing = await Venue.find({}, { normalizedKey: 1 }).lean();
  existing.forEach(v => existingKeys.add(v.normalizedKey));
  console.log(`Existing venues in DB: ${existingKeys.size}`);

  let totalImported = 0;
  let totalSkipped = 0;
  let totalFromTm = 0;
  let statesFailed = [];

  for (const state of US_STATES) {
    try {
      // First page to get totals
      const first = await fetchTmVenuesForState(state, 0);
      const totalPages = Math.min(first.totalPages, 50); // TM API caps at page 49
      console.log(`\n[${state}] ${first.totalElements} venues (${totalPages} pages)`);

      let stateImported = 0;
      let stateSkipped = 0;

      // Process first page
      for (const tmVenue of first.venues) {
        const parsed = parseTmVenue(tmVenue);
        if (!parsed) continue;
        totalFromTm++;

        const key = `${parsed.name.toLowerCase()}|${parsed.city.toLowerCase()}|${(parsed.state || '').toUpperCase()}`;
        if (existingKeys.has(key)) {
          stateSkipped++;
          continue;
        }

        try {
          await Venue.create(parsed);
          existingKeys.add(key);
          stateImported++;
        } catch (err) {
          if (err.code === 11000) {
            stateSkipped++; // duplicate key race condition
          } else {
            console.error(`  Error creating "${parsed.name}": ${err.message}`);
          }
        }
      }

      await new Promise(r => setTimeout(r, DELAY_MS));

      // Remaining pages
      for (let page = 1; page < totalPages; page++) {
        try {
          const result = await fetchTmVenuesForState(state, page);

          for (const tmVenue of result.venues) {
            const parsed = parseTmVenue(tmVenue);
            if (!parsed) continue;
            totalFromTm++;

            const key = `${parsed.name.toLowerCase()}|${parsed.city.toLowerCase()}|${(parsed.state || '').toUpperCase()}`;
            if (existingKeys.has(key)) {
              stateSkipped++;
              continue;
            }

            try {
              await Venue.create(parsed);
              existingKeys.add(key);
              stateImported++;
            } catch (err) {
              if (err.code === 11000) {
                stateSkipped++;
              } else {
                console.error(`  Error creating "${parsed.name}": ${err.message}`);
              }
            }
          }

          await new Promise(r => setTimeout(r, DELAY_MS));
        } catch (pageErr) {
          console.error(`  [${state}] Page ${page} failed: ${pageErr.message}`);
        }
      }

      totalImported += stateImported;
      totalSkipped += stateSkipped;
      console.log(`  [${state}] Done: +${stateImported} new, ${stateSkipped} already existed`);

    } catch (err) {
      console.error(`  [${state}] Failed: ${err.message}`);
      statesFailed.push(state);
      await new Promise(r => setTimeout(r, 1000)); // extra delay on error
    }
  }

  console.log('\n=== Import Complete ===');
  console.log(`TM venues found: ${totalFromTm}`);
  console.log(`New venues imported: ${totalImported}`);
  console.log(`Already existed (skipped): ${totalSkipped}`);
  console.log(`Final DB count: ${await Venue.countDocuments()}`);
  if (statesFailed.length) {
    console.log(`States that failed: ${statesFailed.join(', ')}`);
  }

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
