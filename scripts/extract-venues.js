// One-time migration: Extract unique venues from Events and create Venue documents
// Run: node scripts/extract-venues.js

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const Event = require('../models/Event');
const Venue = require('../models/Venue');

async function extractVenues() {
    await connectDB();
    console.log('Connected to database');

    // Aggregate unique venues from events
    const uniqueVenues = await Event.aggregate([
        {
            $match: {
                'venue.name': { $exists: true, $ne: null, $ne: 'Venue TBA' },
                'venue.city': { $exists: true, $ne: null, $ne: 'TBA' }
            }
        },
        {
            $group: {
                _id: {
                    name: '$venue.name',
                    city: '$venue.city',
                    state: '$venue.state'
                },
                address: { $first: '$venue.address' },
                country: { $first: '$venue.country' },
                zipCode: { $first: '$venue.zipCode' },
                capacity: { $first: '$venue.capacity' },
                location: { $first: '$venue.location' },
                totalEvents: { $sum: 1 },
                upcomingEvents: {
                    $sum: { $cond: [{ $gte: ['$date', new Date()] }, 1, 0] }
                }
            }
        }
    ]);

    console.log(`Found ${uniqueVenues.length} unique venues in events`);

    let created = 0;
    let existing = 0;
    let linked = 0;

    for (const v of uniqueVenues) {
        try {
            const venueData = {
                name: v._id.name,
                city: v._id.city,
                state: v._id.state,
                address: v.address,
                country: v.country || 'US',
                zipCode: v.zipCode,
                capacity: v.capacity,
                location: v.location
            };

            // Check if already exists
            const key = `${venueData.name.toLowerCase()}|${venueData.city.toLowerCase()}|${(venueData.state || '').toUpperCase()}`;
            let venue = await Venue.findOne({ normalizedKey: key });

            if (venue) {
                existing++;
            } else {
                venue = await Venue.findOrCreateFromEventVenue(venueData);
                created++;
            }

            // Update stats
            venue.stats.totalEvents = v.totalEvents;
            venue.stats.upcomingEvents = v.upcomingEvents;
            await venue.save();

            // Back-link events to this venue
            const result = await Event.updateMany(
                {
                    'venue.name': v._id.name,
                    'venue.city': v._id.city,
                    venueRef: { $exists: false }
                },
                { $set: { venueRef: venue._id } }
            );

            // Also update events that have venueRef: null
            const result2 = await Event.updateMany(
                {
                    'venue.name': v._id.name,
                    'venue.city': v._id.city,
                    venueRef: null
                },
                { $set: { venueRef: venue._id } }
            );

            linked += result.modifiedCount + result2.modifiedCount;
        } catch (err) {
            console.error(`Error processing venue ${v._id.name}: ${err.message}`);
        }
    }

    console.log('\n=== Migration Complete ===');
    console.log(`Venues created: ${created}`);
    console.log(`Venues already existed: ${existing}`);
    console.log(`Events linked to venues: ${linked}`);
    console.log(`Total venues in collection: ${await Venue.countDocuments()}`);

    await mongoose.connection.close();
    console.log('Database connection closed');
}

extractVenues().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
