#!/usr/bin/env node
// Optimized venue scoring + classification pipeline per state
// Claude-first approach: classify before API calls to minimize TM/Setlist.fm usage
//
// Pass 1: Keyword deactivation (instant, free)
// Pass 2: Claude AI classification for ALL unscored venues (no rate limit)
// Pass 3: Ticketmaster — ONLY for Claude-confirmed music venues
// Pass 4: Setlist.fm — ONLY for active low/zero-score music venues
// Pass 5: Deactivate zero-score venues
//
// Usage:
//   node scripts/batchVenuePipeline.js --states WY,UT,CO
//   node scripts/batchVenuePipeline.js --states MT --setlist-only   # skip TM (already done)
//   node scripts/batchVenuePipeline.js --states TX --skip-setlist   # skip Setlist.fm
//   node scripts/batchVenuePipeline.js --states MO --setlist-only   # backfill setlist data

require('dotenv').config();
const mongoose = require('mongoose');
const Anthropic = require('@anthropic-ai/sdk');
const Venue = require('../models/Venue');
const tmService = require('../services/ticketmasterService');
const setlistService = require('../services/setlistService');

const args = process.argv.slice(2);
function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const STATES = (getArg('--states') || '').split(',').filter(Boolean).map(s => s.toUpperCase());
const SETLIST_ONLY = args.includes('--setlist-only');
const SKIP_CLAUDE = args.includes('--skip-claude');
const SKIP_SETLIST = args.includes('--skip-setlist');
const SKIP_TM = args.includes('--skip-tm');

const TM_DELAY = 1000;
const SETLIST_DELAY = 1500;
const CLAUDE_DELAY = 500;
const HIGH_SCORE_THRESHOLD = 15; // venues above this skip Claude classification

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Non-music keyword patterns
const KEYWORD_PATTERNS = [
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
const EXCEPTION_PATTERNS = [
  'House of Blues', 'Brooklyn Steel', 'Church of the Living Arts',
  'The Church', 'Ryman', 'Tabernacle', 'Cathedral', 'Sanctuary',
  'Hotel Cafe', 'Hotel Utah', 'Hotel Crocodile'
];
const keywordRegex = new RegExp(KEYWORD_PATTERNS.join('|'), 'i');
const exceptionRegex = new RegExp(EXCEPTION_PATTERNS.join('|'), 'i');

function computeActivityScore(tm, setlist) {
  return Math.min(100, (tm * 3) + (setlist * 0.5));
}
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

async function classifyVenue(name, city, state) {
  const location = [city, state].filter(Boolean).join(', ');
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{ role: 'user', content: `Is "${name}" in ${location} primarily a music/concert venue, or a non-music location? Reply ONLY JSON: {"isMusicVenue": <true|false>, "reason": "<brief>"}` }]
      });
      const text = msg.content[0]?.text?.trim();
      const m = text?.match(/\{[\s\S]*\}/);
      return m ? JSON.parse(m[0]) : null;
    } catch (e) {
      const st = e?.status || e?.response?.status;
      if ((st >= 500 || st === 429) && attempt < 3) {
        await delay(Math.pow(2, attempt) * 1000);
      } else { return null; }
    }
  }
  return null;
}

// ========== PASS 1: Keyword deactivation (runs on ALL venues) ==========
async function pass1_keywords(state) {
  // Run on all active venues — no score requirement (they may not be scored yet)
  const col = mongoose.connection.db.collection('venues');
  const kwCandidates = await col.find({
    state,
    isActive: { $ne: false },
    name: keywordRegex
  }).project({ name: 1, city: 1, state: 1 }).toArray();

  const kwDeactivate = kwCandidates.filter(v => !exceptionRegex.test(v.name));
  if (kwDeactivate.length > 0) {
    await col.updateMany(
      { _id: { $in: kwDeactivate.map(v => v._id) } },
      { $set: { isActive: false } }
    );
    console.log(`  [Keywords] Deactivated ${kwDeactivate.length} obvious non-venues`);
  } else {
    console.log(`  [Keywords] No keyword matches`);
  }
  return kwDeactivate.length;
}

// ========== PASS 2: Claude AI classification (ALL unscored venues) ==========
async function pass2_claude(state) {
  if (SKIP_CLAUDE) { console.log(`  [Claude] Skipped (--skip-claude)`); return { music: 0, nonMusic: 0 }; }

  // Classify ALL active venues that haven't been TM-scored yet
  // This runs BEFORE TM so we only spend TM calls on confirmed music venues
  const col = mongoose.connection.db.collection('venues');
  const candidates = await col.find({
    state,
    isActive: { $ne: false },
    $or: [
      { 'stats.lastActivityCheck': null },
      { 'stats.lastActivityCheck': { $exists: false } }
    ]
  }).project({ name: 1, city: 1, state: 1, 'stats.upcomingEvents': 1 }).toArray();

  // Skip venues with high existing upcomingEvents — they're clearly active
  const HIGH_UPCOMING_THRESHOLD = 3;
  const toClassify = candidates.filter(v => (v.stats?.upcomingEvents || 0) < HIGH_UPCOMING_THRESHOLD);
  const skippedHigh = candidates.length - toClassify.length;

  if (skippedHigh > 0) {
    console.log(`  [Claude] Skipping ${skippedHigh} venues with ${HIGH_UPCOMING_THRESHOLD}+ upcoming events (clearly active)`);
  }

  if (toClassify.length === 0) {
    console.log(`  [Claude] No venues to classify`);
    return { music: 0, nonMusic: 0 };
  }

  console.log(`  [Claude] Classifying ${toClassify.length} venues (~$${(toClassify.length * 0.001).toFixed(2)})...`);
  let music = 0, nonMusic = 0, failed = 0;
  const toDeactivate = [];
  const start = Date.now();

  for (let i = 0; i < toClassify.length; i++) {
    const v = toClassify[i];
    const result = await classifyVenue(v.name, v.city, v.state);
    if (result === null) { failed++; }
    else if (result.isMusicVenue) { music++; }
    else { nonMusic++; toDeactivate.push(v._id); }
    await delay(CLAUDE_DELAY);

    if ((i + 1) % 100 === 0 || i === toClassify.length - 1) {
      const eta = ((Date.now() - start) / (i + 1)) * (toClassify.length - i - 1);
      console.log(`  [Claude] ${i + 1}/${toClassify.length} | music: ${music} | non-music: ${nonMusic} | failed: ${failed} | ETA: ${fmt(eta)}`);
    }
  }

  if (toDeactivate.length > 0) {
    await col.updateMany(
      { _id: { $in: toDeactivate } },
      { $set: { isActive: false } }
    );
  }
  console.log(`  [Claude] Done: ${music} music, ${nonMusic} non-music, ${failed} failed in ${fmt(Date.now() - start)}`);
  return { music, nonMusic };
}

// ========== PASS 3: Ticketmaster (ONLY for active/music venues) ==========
async function pass3_ticketmaster(state) {
  // Only score venues that survived keyword + Claude filtering
  const col = mongoose.connection.db.collection('venues');
  const rawVenues = await col.find({
    state,
    isActive: { $ne: false },
    'externalIds.ticketmaster': { $exists: true, $ne: null },
    $or: [
      { 'stats.lastActivityCheck': null },
      { 'stats.lastActivityCheck': { $exists: false } }
    ]
  }).toArray();

  if (rawVenues.length === 0) { console.log(`  [TM] No active venues need TM scoring`); return; }

  const ids = rawVenues.map(v => v._id);
  const venues = await Venue.find({ _id: { $in: ids }, includeInactive: true }).sort({ 'stats.upcomingEvents': -1 });
  console.log(`  [TM] Scoring ${venues.length} active music venues (non-music already filtered)...`);

  let scored = 0, skipped = 0;
  const start = Date.now();

  for (let i = 0; i < venues.length; i++) {
    const v = venues[i];
    let tmCount = null;
    let rateLimited = false;
    try {
      const r = await tmService.searchEvents({ venueId: v.externalIds.ticketmaster, classificationName: 'music', size: 1 });
      if (r.success) {
        tmCount = r.pagination.totalElements;
      } else if (r.error && /rate limit|quota violation/i.test(r.error)) {
        rateLimited = true;
      }
    } catch (e) {
      if (e.response?.status === 429 || /rate limit|quota violation/i.test(e.message)) {
        rateLimited = true;
      }
    }

    if (rateLimited) {
      console.log(`  [TM] *** RATE LIMITED at ${i+1}/${venues.length} — stopping TM pass ***`);
      break;
    }
    await delay(TM_DELAY);

    if (tmCount === null) { skipped++; continue; }
    v.stats.tmUpcomingEventCount = tmCount;
    v.stats.activityScore = computeActivityScore(tmCount, 0);
    v.stats.lastActivityCheck = new Date();
    await v.save();
    scored++;

    if ((i + 1) % 100 === 0) {
      const eta = ((Date.now() - start) / (i + 1)) * (venues.length - i - 1);
      console.log(`  [TM] ${i + 1}/${venues.length} scored | elapsed: ${fmt(Date.now() - start)} | ETA: ${fmt(eta)}`);
    }
  }
  console.log(`  [TM] Done: ${scored} scored, ${skipped} skipped in ${fmt(Date.now() - start)}`);
}

// ========== PASS 4: Setlist.fm (only active low/zero-score venues) ==========
async function pass4_setlistfm(state) {
  const col = mongoose.connection.db.collection('venues');
  const rawVenues = await col.find({
    state,
    isActive: { $ne: false },
    'stats.lastActivityCheck': { $ne: null },
    $and: [
      { $or: [
        { 'stats.setlistfmPastEventCount': null },
        { 'stats.setlistfmPastEventCount': { $exists: false } }
      ]},
      { $or: [
        { 'stats.tmUpcomingEventCount': { $in: [0, null] } },
        { 'stats.activityScore': { $gt: 0, $lte: 25 } }
      ]}
    ]
  }).toArray();

  if (rawVenues.length === 0) { console.log(`  [Setlist] No active venues need Setlist.fm data`); return; }

  const ids = rawVenues.map(v => v._id);
  const venues = await Venue.find({ _id: { $in: ids }, includeInactive: true });
  console.log(`  [Setlist] Checking ${venues.length} active venues...`);

  let scored = 0, rateLimited = false;
  const start = Date.now();

  for (let i = 0; i < venues.length; i++) {
    const v = venues[i];
    let setlistCount = 0;
    try {
      const r = await setlistService.searchSetlists({ venueName: v.name, cityName: v.city });
      if (r.success) setlistCount = r.pagination.total;
    } catch (e) {
      if (e.response?.status === 429) {
        console.log(`  [Setlist] *** RATE LIMITED at ${i+1}/${venues.length} — stopping ***`);
        rateLimited = true;
        break;
      }
      if (e.response?.status === 404) setlistCount = 0;
    }
    await delay(SETLIST_DELAY);

    const tm = v.stats.tmUpcomingEventCount || 0;
    v.stats.setlistfmPastEventCount = setlistCount;
    v.stats.activityScore = computeActivityScore(tm, setlistCount);
    await v.save();
    scored++;

    if ((i + 1) % 100 === 0) {
      const eta = ((Date.now() - start) / (i + 1)) * (venues.length - i - 1);
      console.log(`  [Setlist] ${i + 1}/${venues.length} scored | elapsed: ${fmt(Date.now() - start)} | ETA: ${fmt(eta)}`);
    }
  }
  console.log(`  [Setlist] Done: ${scored} scored in ${fmt(Date.now() - start)}${rateLimited ? ' (RATE LIMITED — incomplete)' : ''}`);
  return rateLimited;
}

// ========== PASS 5: Deactivate zero-score ==========
async function pass5_deactivateZeros(state) {
  const col = mongoose.connection.db.collection('venues');
  const zeros = await col.countDocuments({
    state,
    'stats.activityScore': 0,
    'stats.lastActivityCheck': { $ne: null },
    isActive: { $ne: false }
  });

  if (zeros === 0) { console.log(`  [Zeros] No zero-score venues to deactivate`); return 0; }

  await col.updateMany(
    { state, 'stats.activityScore': 0, 'stats.lastActivityCheck': { $ne: null }, isActive: { $ne: false } },
    { $set: { isActive: false } }
  );
  console.log(`  [Zeros] Deactivated ${zeros} zero-score venues`);
  return zeros;
}

// ========== State summary ==========
async function stateSummary(state) {
  const col = mongoose.connection.db.collection('venues');
  const active = await col.countDocuments({ state, isActive: { $ne: false } });
  const inactive = await col.countDocuments({ state, isActive: false });
  const total = active + inactive;

  const buckets = {};
  for (const [label, min, max] of [['0', 0, 0], ['1-15', 1, 15], ['16-50', 16, 50], ['51-100', 51, 100]]) {
    buckets[label] = await col.countDocuments({
      state, isActive: { $ne: false },
      'stats.activityScore': { $gte: min, $lte: max }
    });
  }

  console.log(`\n  ┌─────────────────────────────────┐`);
  console.log(`  │ ${state} SUMMARY                         │`);
  console.log(`  ├─────────────────────────────────┤`);
  console.log(`  │ Active venues:    ${String(active).padStart(5)}        │`);
  console.log(`  │ Inactive venues:  ${String(inactive).padStart(5)}        │`);
  console.log(`  │ Total:            ${String(total).padStart(5)}        │`);
  console.log(`  │ Active rate:      ${((active / total) * 100).toFixed(1).padStart(5)}%       │`);
  console.log(`  ├─────────────────────────────────┤`);
  console.log(`  │ Active score distribution:       │`);
  console.log(`  │   0:       ${String(buckets['0']).padStart(5)}               │`);
  console.log(`  │   1-15:    ${String(buckets['1-15']).padStart(5)}               │`);
  console.log(`  │   16-50:   ${String(buckets['16-50']).padStart(5)}               │`);
  console.log(`  │   51-100:  ${String(buckets['51-100']).padStart(5)}               │`);
  console.log(`  └─────────────────────────────────┘\n`);
}

// ========== Main ==========
async function run() {
  if (STATES.length === 0) {
    console.error('Usage: node scripts/batchVenuePipeline.js --states WY,UT,CO');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  for (const state of STATES) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`  PROCESSING: ${state}`);
    console.log(`${'='.repeat(50)}`);

    if (SETLIST_ONLY) {
      // Setlist-only mode: just backfill setlist data for already-scored states
      console.log(`\n--- Setlist.fm Backfill Mode ---`);
      const rateLimited = await pass4_setlistfm(state);
      if (rateLimited) {
        console.log(`\n*** Setlist.fm rate limited — stopping. Resume later. ***`);
        await stateSummary(state);
        break;
      }
      await stateSummary(state);
      continue;
    }

    // Pass 1: Keyword deactivation (instant, free)
    console.log(`\n--- Pass 1: Keyword Deactivation ---`);
    await pass1_keywords(state);

    // Pass 2: Claude AI classification (all unscored venues — no rate limit)
    console.log(`\n--- Pass 2: Claude AI Classification ---`);
    await pass2_claude(state);

    // Pass 3: Ticketmaster (only surviving active music venues)
    if (!SKIP_TM) {
      console.log(`\n--- Pass 3: Ticketmaster (music venues only) ---`);
      await pass3_ticketmaster(state);
    } else {
      console.log(`\n--- Pass 3: Ticketmaster --- SKIPPED (--skip-tm)`);
    }

    // Pass 4: Setlist.fm (only active low/zero-score)
    if (!SKIP_SETLIST) {
      console.log(`\n--- Pass 4: Setlist.fm (active venues only) ---`);
      const rateLimited = await pass4_setlistfm(state);
      if (rateLimited) {
        console.log(`\n*** Setlist.fm rate limited — stopping pipeline. Resume later. ***`);
        await stateSummary(state);
        break;
      }
    } else {
      console.log(`\n--- Pass 4: Setlist.fm --- SKIPPED (--skip-setlist)`);
    }

    // Pass 5: Deactivate zeros
    console.log(`\n--- Pass 5: Deactivate Zero-Score ---`);
    await pass5_deactivateZeros(state);

    // Summary
    await stateSummary(state);
  }

  await mongoose.disconnect();
  console.log('Pipeline complete.');
}

run().catch(err => { console.error('Pipeline failed:', err); process.exit(1); });
