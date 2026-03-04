#!/usr/bin/env node
// Quick venue analysis script
require('dotenv').config();
const mongoose = require('mongoose');
const Venue = require('../models/venue');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  // venueType distribution
  const types = await Venue.aggregate([
    { $group: { _id: '$venueType', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  console.log('=== venueType distribution ===');
  types.forEach(t => console.log('  ' + (t._id || '(null)') + ': ' + t.count));

  // openAir distribution
  const openAir = await Venue.aggregate([
    { $group: { _id: '$openAir', count: { $sum: 1 } } }
  ]);
  console.log('\n=== openAir distribution ===');
  openAir.forEach(t => console.log('  ' + (t._id === null ? '(null)' : t._id) + ': ' + t.count));

  // How many have TM external IDs
  const withTmId = await Venue.countDocuments({ 'externalIds.ticketmaster': { $exists: true, $ne: null } });
  console.log('\nVenues with Ticketmaster ID:', withTmId);

  // Sample non-music-looking venues
  const samples = await Venue.find({ name: { $regex: /church|parking|farm|school|mall/i } }).select('name city state venueType').limit(20);
  console.log('\n=== Sample non-music-looking venues ===');
  samples.forEach(v => console.log('  ' + v.name + ' (' + v.city + ', ' + v.state + ') — type: ' + (v.venueType || 'null')));

  // Capacity distribution
  const capBuckets = await Venue.aggregate([
    { $match: { capacity: { $gt: 0 } } },
    { $bucket: {
      groupBy: '$capacity',
      boundaries: [0, 500, 1000, 5000, 10000, 25000, 50000, 100000],
      default: '100000+',
      output: { count: { $sum: 1 } }
    }}
  ]);
  console.log('\n=== Capacity distribution ===');
  capBuckets.forEach(b => console.log('  ' + b._id + ': ' + b.count));

  const noCapacity = await Venue.countDocuments({ $or: [{ capacity: null }, { capacity: 0 }, { capacity: { $exists: false } }] });
  console.log('  No capacity data:', noCapacity);

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
