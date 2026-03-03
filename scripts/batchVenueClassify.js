#!/usr/bin/env node
// Use Claude AI to classify low-score venues as music vs non-music
// Deactivates venues classified as non-music venues
//
// Usage:
//   node scripts/batchVenueClassify.js --dry-run          # classify but don't deactivate
//   node scripts/batchVenueClassify.js                    # classify and deactivate non-music
//   node scripts/batchVenueClassify.js --state CA         # only California
//   node scripts/batchVenueClassify.js --max-score 20     # custom score threshold (default 15)
//   node scripts/batchVenueClassify.js --limit 100        # cap at N venues

require('dotenv').config();
const mongoose = require('mongoose');
const Anthropic = require('@anthropic-ai/sdk');
const Venue = require('../models/Venue');

const args = process.argv.slice(2);
function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const DRY_RUN = args.includes('--dry-run');
const STATE_FILTER = getArg('--state');
const MAX_SCORE = parseInt(getArg('--max-score') || '15', 10);
const LIMIT = parseInt(getArg('--limit') || '0', 10);
const DELAY_MS = 500; // Claude API is fast, 2 req/sec is safe

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function classifyVenue(name, city, state) {
  const location = [city, state].filter(Boolean).join(', ');

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `Is "${name}" in ${location} primarily a music/concert venue, or is it a non-music location (hotel, church, school, restaurant, sports-only facility, corporate space, etc.) that only occasionally hosts music?

Reply ONLY with JSON: {"isMusicVenue": <true|false>, "reason": "<brief explanation>"}`
        }]
      });

      const text = message.content[0]?.text?.trim();
      if (!text) return null;

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      const status = error?.status || error?.response?.status;
      if ((status >= 500 || status === 429) && attempt < 3) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`  [Claude] Retry ${attempt}/3 (${status}), waiting ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        console.error(`  [Claude] Failed for "${name}": ${error.message}`);
        return null;
      }
    }
  }
  return null;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatDuration(ms) {
  const secs = Math.floor(ms / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const query = {
    isActive: { $ne: false },
    'stats.activityScore': { $gt: 0, $lte: MAX_SCORE },
    'stats.lastActivityCheck': { $ne: null }
  };
  if (STATE_FILTER) query.state = STATE_FILTER.toUpperCase();

  let findQuery = Venue.find(query)
    .select('name city state stats.activityScore venueType')
    .sort({ 'stats.activityScore': 1 });
  if (LIMIT > 0) findQuery = findQuery.limit(LIMIT);

  const venues = await findQuery;

  console.log(`=== Claude AI Venue Classification ===`);
  console.log(`Venues to classify: ${venues.length}`);
  console.log(`Score threshold: <= ${MAX_SCORE}`);
  if (STATE_FILTER) console.log(`State: ${STATE_FILTER.toUpperCase()}`);
  if (DRY_RUN) console.log('*** DRY RUN — no deactivations ***');
  console.log(`Estimated cost: ~$${(venues.length * 0.001).toFixed(2)}\n`);

  let musicVenues = 0;
  let nonMusicVenues = 0;
  let failed = 0;
  const toDeactivate = [];
  const startTime = Date.now();

  for (let i = 0; i < venues.length; i++) {
    const v = venues[i];
    const result = await classifyVenue(v.name, v.city, v.state);

    if (result === null) {
      failed++;
      console.log(`  [?] "${v.name}" (${v.city}, ${v.state}) — Claude failed`);
    } else if (result.isMusicVenue) {
      musicVenues++;
      // Don't log every music venue to reduce noise
    } else {
      nonMusicVenues++;
      toDeactivate.push(v);
      console.log(`  [X] [${v.stats.activityScore}] "${v.name}" (${v.city}, ${v.state}) — ${result.reason}`);
    }

    await delay(DELAY_MS);

    // Progress every 50
    if ((i + 1) % 50 === 0 || i === venues.length - 1) {
      const elapsed = Date.now() - startTime;
      const eta = (elapsed / (i + 1)) * (venues.length - i - 1);
      console.log(`  --- [${i + 1}/${venues.length}] music: ${musicVenues} | non-music: ${nonMusicVenues} | failed: ${failed} | elapsed: ${formatDuration(elapsed)} | ETA: ${formatDuration(eta)}`);
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`Music venues (kept): ${musicVenues}`);
  console.log(`Non-music venues: ${nonMusicVenues}`);
  console.log(`Failed: ${failed}`);
  console.log(`Time: ${formatDuration(Date.now() - startTime)}`);

  if (toDeactivate.length > 0) {
    // Group by state for summary
    const byState = {};
    toDeactivate.forEach(v => {
      const st = v.state || '??';
      if (!byState[st]) byState[st] = 0;
      byState[st]++;
    });
    console.log('\nNon-music by state:');
    for (const [st, count] of Object.entries(byState).sort()) {
      console.log(`  ${st}: ${count}`);
    }

    if (!DRY_RUN) {
      const ids = toDeactivate.map(v => v._id);
      const result = await Venue.updateMany({ _id: { $in: ids } }, { $set: { isActive: false } });
      console.log(`\nDeactivated: ${result.modifiedCount} venues`);
    } else {
      console.log(`\n*** DRY RUN — would deactivate ${toDeactivate.length} venues ***`);
    }
  }

  await mongoose.disconnect();
}

run().catch(err => { console.error('Failed:', err); process.exit(1); });
