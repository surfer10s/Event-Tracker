// Event Controller
// Business logic for event operations
// Think of these as stored procedures that handle the actual work

const Event = require('../models/Event');
const Artist = require('../models/Artist');

// Get all upcoming events with filtering
exports.getUpcomingEvents = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      city,
      state,
      artist,
      startDate,
      endDate,
      minPrice,
      maxPrice,
      status = 'on_sale',
      sortBy = 'date',
      sortOrder = 'asc'
    } = req.query;

    // Build filter query (like a WHERE clause in SQL)
    const filter = {
      date: { $gte: new Date() } // Only future events
    };

    // Add optional filters
    if (city) {
      filter['venue.city'] = new RegExp(city, 'i'); // Case-insensitive search
    }

    if (state) {
      filter['venue.state'] = state.toUpperCase();
    }

    if (artist) {
      // Search by artist ID or name
      const artistDoc = await Artist.findOne({
        $or: [
          { _id: artist },
          { name: new RegExp(artist, 'i') }
        ]
      });
      if (artistDoc) {
        filter.artist = artistDoc._id;
      }
    }

    if (startDate) {
      filter.date.$gte = new Date(startDate);
    }

    if (endDate) {
      filter.date.$lte = new Date(endDate);
    }

    if (minPrice) {
      filter['ticketInfo.minPrice'] = { $gte: parseFloat(minPrice) };
    }

    if (maxPrice) {
      filter['ticketInfo.maxPrice'] = { $lte: parseFloat(maxPrice) };
    }

    if (status) {
      filter['ticketInfo.status'] = status;
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination (like OFFSET and FETCH in SQL)
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const events = await Event.find(filter)
      .populate('artist', 'name genre images tourStatus') // JOIN with Artist table
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await Event.countDocuments(filter);

    res.json({
      success: true,
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
      events
    });

  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching events',
      error: error.message
    });
  }
};

// Get single event by ID
exports.getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('artist')
      .populate('tour');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    res.json({
      success: true,
      event
    });

  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching event',
      error: error.message
    });
  }
};

// Get single event by Ticketmaster ID
exports.getEventByTicketmasterId = async (req, res) => {
  try {
    const { ticketmasterId } = req.params;

    if (!ticketmasterId || ticketmasterId === 'undefined' || ticketmasterId === 'null' || ticketmasterId === '') {
      return res.status(400).json({
        success: false,
        message: 'Valid Ticketmaster ID is required'
      });
    }

    // First try to find in our database
    let event = await Event.findOne({ 'externalIds.ticketmaster': ticketmasterId })
      .populate('artist')
      .populate('tour');

    if (event) {
      return res.json({
        success: true,
        source: 'database',
        event
      });
    }

    // If not in database, fetch from Ticketmaster API
    const ticketmasterService = require('../services/ticketmasterService');
    const axios = require('axios');

    try {
      const response = await axios.get(`https://app.ticketmaster.com/discovery/v2/events/${ticketmasterId}.json`, {
        params: { apikey: process.env.TICKETMASTER_API_KEY }
      });

      if (response.data) {
        const formattedEvent = ticketmasterService.formatEvent(response.data);
        return res.json({
          success: true,
          source: 'ticketmaster_live',
          event: formattedEvent
        });
      }
    } catch (tmError) {
      console.error('Ticketmaster API error:', tmError.message);
    }

    return res.status(404).json({
      success: false,
      message: 'Event not found'
    });

  } catch (error) {
    console.error('Error fetching event by Ticketmaster ID:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching event',
      error: error.message
    });
  }
};

// Search events by keyword
exports.searchEvents = async (req, res) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: 'Search query (q) is required'
      });
    }

    // Search in event name and description
    const filter = {
      date: { $gte: new Date() },
      $or: [
        { name: new RegExp(q, 'i') },
        { description: new RegExp(q, 'i') }
      ]
    };

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const events = await Event.find(filter)
      .populate('artist', 'name genre images')
      .sort({ date: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Event.countDocuments(filter);

    res.json({
      success: true,
      query: q,
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
      events
    });

  } catch (error) {
    console.error('Error searching events:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching events',
      error: error.message
    });
  }
};

// Get events near a location (using geospatial query)
exports.getEventsNearby = async (req, res) => {
  try {
    const { longitude, latitude, maxDistance = 50, limit = 20 } = req.query;

    if (!longitude || !latitude) {
      return res.status(400).json({
        success: false,
        message: 'longitude and latitude are required'
      });
    }

    const maxDistanceMeters = parseFloat(maxDistance) * 1609.34; // miles to meters

    const events = await Event.find({
      'venue.location': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: maxDistanceMeters
        }
      },
      date: { $gte: new Date() }
    })
    .populate('artist', 'name genre images')
    .limit(parseInt(limit));

    res.json({
      success: true,
      location: {
        longitude: parseFloat(longitude),
        latitude: parseFloat(latitude)
      },
      maxDistance: parseFloat(maxDistance),
      count: events.length,
      events
    });

  } catch (error) {
    console.error('Error finding nearby events:', error);
    res.status(500).json({
      success: false,
      message: 'Error finding nearby events',
      error: error.message
    });
  }
};

// Get events by artist
exports.getEventsByArtist = async (req, res) => {
  try {
    const { artistId } = req.params;
    const { page = 1, limit = 20, includesPast = false } = req.query;

    // Validate artistId - must be a valid MongoDB ObjectId
    if (!artistId || artistId === 'undefined' || artistId === 'null') {
      return res.status(400).json({
        success: false,
        message: 'Valid artist ID is required'
      });
    }

    // Check if it's a valid ObjectId format (24 hex characters)
    if (!/^[0-9a-fA-F]{24}$/.test(artistId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid artist ID format'
      });
    }

    // Verify artist exists
    const artist = await Artist.findById(artistId);
    if (!artist) {
      return res.status(404).json({
        success: false,
        message: 'Artist not found'
      });
    }

    const filter = { artist: artistId };
    
    // Only future events unless includePast is true
    if (!includesPast || includesPast === 'false') {
      filter.date = { $gte: new Date() };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const events = await Event.find(filter)
      .populate('artist')
      .sort({ date: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Event.countDocuments(filter);

    res.json({
      success: true,
      artist: {
        id: artist._id,
        name: artist.name,
        genre: artist.genre,
        tourStatus: artist.tourStatus
      },
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
      events
    });

  } catch (error) {
    console.error('Error fetching artist events:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching artist events',
      error: error.message
    });
  }
};

// Track affiliate link click
exports.trackAffiliateClick = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { platform } = req.body; // 'ticketmaster', 'stubhub', or 'seatgeek'

    if (!platform) {
      return res.status(400).json({
        success: false,
        message: 'Platform is required (ticketmaster, stubhub, or seatgeek)'
      });
    }

    const event = await Event.findById(eventId);
    
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check if affiliate link exists for this platform
    const affiliateLink = event.affiliateLinks[platform];
    
    if (!affiliateLink || !affiliateLink.url) {
      return res.status(404).json({
        success: false,
        message: `No ${platform} affiliate link available for this event`
      });
    }

    // Track the click
    await event.recordClick(platform);

    // Return the affiliate URL to redirect user
    res.json({
      success: true,
      url: affiliateLink.url,
      message: 'Click tracked successfully'
    });

  } catch (error) {
    console.error('Error tracking click:', error);
    res.status(500).json({
      success: false,
      message: 'Error tracking click',
      error: error.message
    });
  }
};

// Get event statistics
exports.getEventStats = async (req, res) => {
  try {
    const totalEvents = await Event.countDocuments({ date: { $gte: new Date() } });
    const totalArtists = await Artist.countDocuments();
    const onSaleEvents = await Event.countDocuments({ 
      date: { $gte: new Date() },
      'ticketInfo.status': 'on_sale' 
    });

    // Top cities with most events
    const topCities = await Event.aggregate([
      { $match: { date: { $gte: new Date() } } },
      { $group: { _id: '$venue.city', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      stats: {
        totalUpcomingEvents: totalEvents,
        totalArtists,
        onSaleEvents,
        topCities: topCities.map(city => ({
          city: city._id,
          eventCount: city.count
        }))
      }
    });

  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: error.message
    });
  }
};

// Get tour map data for an artist
exports.getTourMapData = async (req, res) => {
  try {
    const { artistId } = req.params;
    const { startDate, endDate } = req.query;

    // Try to find artist by MongoDB _id or Ticketmaster external ID
    let artist = null;
    
    // Check if it's a valid MongoDB ObjectId
    if (artistId.match(/^[0-9a-fA-F]{24}$/)) {
      artist = await Artist.findById(artistId);
    }
    
    // If not found or not valid ObjectId, try Ticketmaster ID
    if (!artist) {
      artist = await Artist.findOne({ 'externalIds.ticketmaster': artistId });
    }
    
    if (!artist) {
      return res.status(404).json({
        success: false,
        message: 'Artist not found'
      });
    }

    const filter = { 
      artist: artist._id,
      'venue.location': { $exists: true, $ne: null }
    };
    
    // Add date filters if provided
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    } else {
      // Default to future events
      filter.date = { $gte: new Date() };
    }

    const events = await Event.find(filter)
      .sort({ date: 1 })
      .select('name date venue ticketInfo affiliateLinks images');

    // Format for map display
    const mapData = events
      .filter(event => event.venue.location && event.venue.location.coordinates)
      .map(event => ({
        id: event._id,
        name: event.name,
        date: event.date,
        venue: {
          name: event.venue.name,
          city: event.venue.city,
          state: event.venue.state,
          country: event.venue.country,
          coordinates: event.venue.location.coordinates // [lng, lat]
        },
        ticketInfo: event.ticketInfo,
        affiliateUrl: event.affiliateLinks?.ticketmaster?.url,
        image: event.images?.thumbnail
      }));

    res.json({
      success: true,
      artist: {
        id: artist._id,
        name: artist.name,
        genre: artist.genre
      },
      eventCount: mapData.length,
      events: mapData
    });

  } catch (error) {
    console.error('Error fetching tour map data:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tour map data',
      error: error.message
    });
  }
};