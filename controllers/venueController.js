// Venue Controller
const Venue = require('../models/Venue');
const Event = require('../models/Event');
const User = require('../models/User');
const ticketmasterService = require('../services/ticketmasterService');

const VENUE_SYNC_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours

// GET /venues — List/search venues
exports.getVenues = async (req, res) => {
    try {
        const { q, city, state, page = 1, limit = 20 } = req.query;

        const filter = {};
        if (q) {
            filter.name = new RegExp(q, 'i');
        }
        if (city) {
            filter.city = new RegExp(city, 'i');
        }
        if (state) {
            filter.state = state.toUpperCase();
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const venues = await Venue.find(filter)
            .sort({ 'stats.upcomingEvents': -1, name: 1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Venue.countDocuments(filter);

        res.json({
            success: true,
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / parseInt(limit)),
            venues
        });
    } catch (error) {
        console.error('Error fetching venues:', error);
        res.status(500).json({ success: false, message: 'Error fetching venues', error: error.message });
    }
};

// GET /venues/nearby — Geospatial search
exports.getVenuesNearby = async (req, res) => {
    try {
        const { longitude, latitude, maxDistance = 50, limit = 50 } = req.query;

        if (!longitude || !latitude) {
            return res.status(400).json({ success: false, message: 'longitude and latitude are required' });
        }

        const maxDistanceMeters = parseFloat(maxDistance) * 1609.34;

        const venues = await Venue.find({
            location: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(longitude), parseFloat(latitude)]
                    },
                    $maxDistance: maxDistanceMeters
                }
            }
        }).limit(parseInt(limit));

        res.json({
            success: true,
            location: { longitude: parseFloat(longitude), latitude: parseFloat(latitude) },
            maxDistance: parseFloat(maxDistance),
            count: venues.length,
            venues
        });
    } catch (error) {
        console.error('Error finding nearby venues:', error);
        res.status(500).json({ success: false, message: 'Error finding nearby venues', error: error.message });
    }
};

// GET /venues/following — User's followed venues
exports.getFollowedVenues = async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .populate('favoriteVenues');

        const venuesWithCounts = await Promise.all(
            (user.favoriteVenues || []).map(async (venue) => {
                const upcomingCount = await Event.countDocuments({
                    $or: [
                        { venueRef: venue._id },
                        { 'venue.name': venue.name, 'venue.city': venue.city }
                    ],
                    date: { $gte: new Date() }
                });
                const venueObj = venue.toObject();
                venueObj.upcomingEventCount = upcomingCount;
                return venueObj;
            })
        );

        res.json({
            success: true,
            count: venuesWithCounts.length,
            venues: venuesWithCounts
        });
    } catch (error) {
        console.error('Error fetching followed venues:', error);
        res.status(500).json({ success: false, message: 'Error fetching followed venues', error: error.message });
    }
};

// GET /venues/:venueId — Single venue profile
exports.getVenueById = async (req, res) => {
    try {
        const venue = await Venue.findById(req.params.venueId);

        if (!venue) {
            return res.status(404).json({ success: false, message: 'Venue not found' });
        }

        // Check if requesting user follows this venue
        let isFollowing = false;
        if (req.user) {
            const user = await User.findById(req.user.id);
            isFollowing = user.favoriteVenues?.some(id => id.toString() === venue._id.toString()) || false;
        }

        res.json({
            success: true,
            venue,
            isFollowing
        });
    } catch (error) {
        console.error('Error fetching venue:', error);
        res.status(500).json({ success: false, message: 'Error fetching venue', error: error.message });
    }
};

// GET /venues/:venueId/events — Events at a venue (with live TM backfill)
exports.getEventsByVenue = async (req, res) => {
    try {
        const { venueId } = req.params;
        const { page = 1, limit = 20, includePast = 'false', grouped } = req.query;

        const venue = await Venue.findById(venueId);
        if (!venue) {
            return res.status(404).json({ success: false, message: 'Venue not found' });
        }

        // Live TM backfill — skip if synced within cooldown window
        const now = new Date();
        const needsSync = !venue.lastSyncedAt ||
            (now - venue.lastSyncedAt) > VENUE_SYNC_COOLDOWN_MS;

        if (needsSync) {
            try {
                let tmResult;
                const tmVenueId = venue.externalIds?.ticketmaster;

                if (tmVenueId) {
                    console.log(`[Venue Sync] Fetching TM events for venue ID: ${tmVenueId}`);
                    tmResult = await ticketmasterService.getEventsByVenueId(tmVenueId);
                } else {
                    console.log(`[Venue Sync] No TM ID — keyword search for "${venue.name}" in ${venue.city}`);
                    tmResult = await ticketmasterService.searchEvents({
                        keyword: venue.name,
                        city: venue.city
                    });
                }

                if (tmResult.success && tmResult.events.length > 0) {
                    // Save all returned events in parallel (dedup handles duplicates)
                    const saveResults = await Promise.all(
                        tmResult.events.map(event =>
                            ticketmasterService.saveEventToDatabase(event)
                        )
                    );

                    // Back-link any saved events to this venue's venueRef
                    const savedEvents = saveResults
                        .filter(r => r.success && r.event)
                        .map(r => r.event);

                    if (savedEvents.length > 0) {
                        await Event.updateMany(
                            {
                                _id: { $in: savedEvents.map(e => e._id) },
                                venueRef: { $exists: false }
                            },
                            { $set: { venueRef: venue._id } }
                        );
                    }

                    console.log(`[Venue Sync] Saved/updated ${savedEvents.length} events for "${venue.name}"`);
                }

                // Update venue sync timestamp and stats
                venue.lastSyncedAt = now;
                venue.stats.upcomingEvents = await Event.countDocuments({
                    $or: [
                        { venueRef: venue._id },
                        { 'venue.name': venue.name, 'venue.city': venue.city }
                    ],
                    date: { $gte: now }
                });
                venue.stats.totalEvents = await Event.countDocuments({
                    $or: [
                        { venueRef: venue._id },
                        { 'venue.name': venue.name, 'venue.city': venue.city }
                    ]
                });
                await venue.save();

            } catch (syncError) {
                // Log but don't fail the request — still return cached DB results
                console.error('[Venue Sync] TM fetch failed, returning cached results:', syncError.message);
                venue.lastSyncedAt = now;
                await venue.save();
            }
        }

        // Local DB query
        const matchFilter = {
            $or: [
                { venueRef: venue._id },
                { 'venue.name': venue.name, 'venue.city': venue.city }
            ]
        };

        if (includePast !== 'true') {
            matchFilter.date = { $gte: new Date() };
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        if (grouped === 'true') {
            // Grouped mode — collapse multi-show artists into residency groups
            const result = await Event.aggregate([
                { $match: matchFilter },
                { $sort: { date: 1 } },
                {
                    $group: {
                        _id: '$artist',
                        firstDate: { $first: '$date' },
                        lastDate: { $last: '$date' },
                        eventCount: { $sum: 1 },
                        events: { $push: '$$ROOT' }
                    }
                },
                {
                    $lookup: {
                        from: 'artists',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'artistInfo'
                    }
                },
                { $unwind: { path: '$artistInfo', preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        firstDate: 1,
                        lastDate: 1,
                        eventCount: 1,
                        events: 1,
                        artist: {
                            _id: '$artistInfo._id',
                            name: '$artistInfo.name',
                            genre: '$artistInfo.genre',
                            images: '$artistInfo.images'
                        }
                    }
                },
                { $sort: { firstDate: 1 } },
                {
                    $facet: {
                        items: [{ $skip: skip }, { $limit: limitNum }],
                        totalCount: [{ $count: 'count' }]
                    }
                }
            ]);

            const rawItems = result[0].items;
            const total = result[0].totalCount[0]?.count || 0;

            // Build mixed items array: residency groups for multi-show, plain events for single-show
            const items = rawItems.map(group => {
                if (group.eventCount === 1) {
                    const event = group.events[0];
                    event.artist = group.artist;
                    return { type: 'event', event };
                }
                return {
                    type: 'residency',
                    artist: group.artist,
                    eventCount: group.eventCount,
                    firstDate: group.firstDate,
                    lastDate: group.lastDate,
                    events: group.events.map(e => {
                        e.artist = group.artist;
                        return e;
                    })
                };
            });

            return res.json({
                success: true,
                venue: { _id: venue._id, name: venue.name, city: venue.city, state: venue.state },
                grouped: true,
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
                items
            });
        }

        // Default flat mode (unchanged)
        const events = await Event.find(matchFilter)
            .populate('artist', 'name genre images')
            .sort({ date: 1 })
            .skip(skip)
            .limit(limitNum);

        const total = await Event.countDocuments(matchFilter);

        res.json({
            success: true,
            venue: { _id: venue._id, name: venue.name, city: venue.city, state: venue.state },
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum),
            events
        });
    } catch (error) {
        console.error('Error fetching venue events:', error);
        res.status(500).json({ success: false, message: 'Error fetching venue events', error: error.message });
    }
};

// POST /venues/:venueId/follow — Follow a venue
exports.followVenue = async (req, res) => {
    try {
        const { venueId } = req.params;

        const venue = await Venue.findById(venueId);
        if (!venue) {
            return res.status(404).json({ success: false, message: 'Venue not found' });
        }

        const user = await User.findById(req.user.id);

        if (user.favoriteVenues?.some(id => id.toString() === venueId)) {
            return res.status(400).json({ success: false, message: 'Already following this venue' });
        }

        user.favoriteVenues.push(venueId);
        await user.save();

        // Update venue followers count
        venue.stats.followers = await User.countDocuments({ favoriteVenues: venueId });
        await venue.save();

        res.json({
            success: true,
            message: 'Now following venue',
            venue: { _id: venue._id, name: venue.name, followers: venue.stats.followers }
        });
    } catch (error) {
        console.error('Follow venue error:', error);
        res.status(500).json({ success: false, message: 'Error following venue', error: error.message });
    }
};

// DELETE /venues/:venueId/follow — Unfollow a venue
exports.unfollowVenue = async (req, res) => {
    try {
        const { venueId } = req.params;

        const user = await User.findById(req.user.id);
        user.favoriteVenues = (user.favoriteVenues || []).filter(
            id => id.toString() !== venueId
        );
        await user.save();

        // Update venue followers count
        const venue = await Venue.findById(venueId);
        if (venue) {
            venue.stats.followers = await User.countDocuments({ favoriteVenues: venueId });
            await venue.save();
        }

        res.json({
            success: true,
            message: 'Unfollowed venue'
        });
    } catch (error) {
        console.error('Unfollow venue error:', error);
        res.status(500).json({ success: false, message: 'Error unfollowing venue', error: error.message });
    }
};
