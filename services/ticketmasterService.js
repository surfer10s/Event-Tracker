// Ticketmaster API Service
// This handles all communication with Ticketmaster API
// Think of this as a data access layer specifically for the TM API

const axios = require('axios');
const Artist = require('../models/Artist');
const Event = require('../models/Event');
const Tour = require('../models/Tour');
const Venue = require('../models/Venue');

// Base URL for Ticketmaster Discovery API
const TM_BASE_URL = 'https://app.ticketmaster.com/discovery/v2';

class TicketmasterService {
  constructor() {
    this.apiKey = process.env.TICKETMASTER_API_KEY;
    this.affiliateId = process.env.TICKETMASTER_AFFILIATE_ID;
    
    if (!this.apiKey) {
      console.warn('WARNING: Ticketmaster API key not found in environment variables');
    }
  }

  // Build affiliate URL with your tracking ID
  buildAffiliateUrl(originalUrl) {
    if (!originalUrl) return null;
    
    // Add your affiliate ID to the URL
    // Format depends on Ticketmaster's affiliate program requirements
    if (this.affiliateId) {
      const separator = originalUrl.includes('?') ? '&' : '?';
      return `${originalUrl}${separator}affiliate=${this.affiliateId}`;
    }
    
    return originalUrl;
  }

  // Search for events by keyword
  async searchEvents(params = {}) {
    try {
      const {
        keyword = '',
        city = '',
        stateCode = '',
        venueId = '',
        startDateTime = '',
        endDateTime = '',
        size = 20,
        page = 0,
        sort = 'date,asc'
      } = params;

      // Build query parameters
      const queryParams = {
        apikey: this.apiKey,
        size,
        page,
        sort
      };

      if (keyword) queryParams.keyword = keyword;
      if (city) queryParams.city = city;
      if (stateCode) queryParams.stateCode = stateCode;
      if (venueId) queryParams.venueId = venueId;
      if (startDateTime) queryParams.startDateTime = startDateTime;
      if (endDateTime) queryParams.endDateTime = endDateTime;

      // Make API request
      const response = await axios.get(`${TM_BASE_URL}/events.json`, {
        params: queryParams
      });

      // Extract events from response
      const events = response.data._embedded?.events || [];
      
      return {
        success: true,
        events: events.map(event => this.formatEvent(event)),
        pagination: {
          page: response.data.page?.number || 0,
          size: response.data.page?.size || 0,
          totalElements: response.data.page?.totalElements || 0,
          totalPages: response.data.page?.totalPages || 0
        }
      };

    } catch (error) {
      console.error('Ticketmaster API Error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.fault?.faultstring || error.message,
        events: []
      };
    }
  }

  // Get events by Ticketmaster venue ID
  async getEventsByVenueId(tmVenueId, options = {}) {
    return await this.searchEvents({ venueId: tmVenueId, size: 50, ...options });
  }

  // Get events by artist name
  async getEventsByArtist(artistName, params = {}) {
    return await this.searchEvents({
      keyword: artistName,
      ...params
    });
  }

  // Format Ticketmaster event data to match our Event schema
  formatEvent(tmEvent) {
    // Extract venue info
    const venue = tmEvent._embedded?.venues?.[0] || {};
    
    // Extract ALL price ranges (can include standard, resale, VIP, etc.)
    const priceRanges = (tmEvent.priceRanges || []).map(pr => ({
      type: pr.type || 'standard',
      min: pr.min,
      max: pr.max,
      currency: pr.currency || 'USD'
    }));
    
    // Get the standard/primary price range for backwards compatibility
    const primaryPriceRange = priceRanges.find(pr => pr.type === 'standard') || priceRanges[0] || {};
    
    // Extract presale info
    const presales = [];
    if (tmEvent.sales?.presales) {
      for (const presale of tmEvent.sales.presales) {
        presales.push({
          name: presale.name,
          startDateTime: presale.startDateTime ? new Date(presale.startDateTime) : undefined,
          endDateTime: presale.endDateTime ? new Date(presale.endDateTime) : undefined
        });
      }
    }
    
    // Extract artist info
    const attractions = tmEvent._embedded?.attractions || [];
    const mainAttraction = attractions[0] || {};

    // Build venue location in GeoJSON format
    let venueLocation = undefined;
    if (venue.location?.latitude && venue.location?.longitude) {
      venueLocation = {
        type: 'Point',
        coordinates: [
          parseFloat(venue.location.longitude), // longitude first
          parseFloat(venue.location.latitude)   // latitude second
        ]
      };
    }

    return {
      // External ID for syncing
      externalIds: {
        ticketmaster: tmEvent.id
      },
      
      // Basic info
      name: tmEvent.name,
      date: new Date(tmEvent.dates?.start?.dateTime || tmEvent.dates?.start?.localDate),
      
      // Venue - with TBA fallbacks for missing data
      venue: {
        name: venue.name || 'Venue TBA',
        address: venue.address?.line1,
        city: venue.city?.name || 'TBA',
        state: venue.state?.stateCode,
        country: venue.country?.countryCode || 'US',
        zipCode: venue.postalCode,
        location: venueLocation
      },
      
      // Ticket info - enhanced!
      ticketInfo: {
        minPrice: primaryPriceRange.min,
        maxPrice: primaryPriceRange.max,
        currency: primaryPriceRange.currency || 'USD',
        priceRanges: priceRanges,
        status: this.mapTicketStatus(tmEvent.dates?.status?.code),
        resaleStatus: 'unknown', // Would need Inventory Status API for this
        onSaleDate: tmEvent.sales?.public?.startDateTime ? 
          new Date(tmEvent.sales.public.startDateTime) : undefined,
        offSaleDate: tmEvent.sales?.public?.endDateTime ? 
          new Date(tmEvent.sales.public.endDateTime) : undefined,
        presales: presales,
        ticketLimit: this.parseTicketLimit(tmEvent.ticketLimit),
        allInclusivePricing: tmEvent.allInclusivePricing || false,
        lastInventoryCheck: new Date()
      },
      
      // Affiliate links
      affiliateLinks: {
        ticketmaster: {
          url: this.buildAffiliateUrl(tmEvent.url),
          affiliateId: this.affiliateId,
          lastChecked: new Date()
        }
      },
      
      // Images
      images: {
        thumbnail: tmEvent.images?.find(img => img.width < 500)?.url,
        medium: tmEvent.images?.find(img => img.width >= 500 && img.width < 1000)?.url,
        large: tmEvent.images?.find(img => img.width >= 1000)?.url
      },
      
      // Artist info (for creating/linking Artist records)
      artistInfo: {
        name: mainAttraction.name || 'Unknown Artist',
        externalId: mainAttraction.id,
        genre: mainAttraction.classifications?.[0]?.genre?.name,
        images: mainAttraction.images
      },
      
      // Supporting acts
      supportingActs: attractions.slice(1).map(act => ({
        name: act.name
      })),
      
      description: tmEvent.info || tmEvent.pleaseNote,

      // Venue external ID for linking to Venue document
      venueExternalId: venue.id || undefined,

      lastUpdated: new Date()
    };
  }

  // Map Ticketmaster status codes to our schema
  mapTicketStatus(statusCode) {
    const statusMap = {
      'onsale': 'on_sale',
      'offsale': 'sold_out',
      'cancelled': 'cancelled',
      'postponed': 'postponed',
      'rescheduled': 'rescheduled'
    };
    
    return statusMap[statusCode] || 'not_yet_on_sale';
  }

  // Parse ticket limit from Ticketmaster data
  parseTicketLimit(ticketLimitData) {
    if (!ticketLimitData) return undefined;
    
    // Try to get the numeric limit directly
    if (typeof ticketLimitData === 'number') {
      return ticketLimitData;
    }
    
    // Try info field - might be a string like "8" or "8 tickets per customer"
    const info = ticketLimitData.info;
    if (info) {
      // Extract the first number from the string
      const match = String(info).match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > 0) {
          return num;
        }
      }
    }
    
    return undefined;
  }

  // Save events to database (with duplicate checking)
  async saveEventToDatabase(formattedEvent) {
    try {
      // Check if event already exists
      let event = await Event.findOne({
        'externalIds.ticketmaster': formattedEvent.externalIds.ticketmaster
      });

      // Find or create the artist
      let artist = await Artist.findOne({
        'externalIds.ticketmaster': formattedEvent.artistInfo.externalId
      });

      if (!artist) {
        artist = await Artist.create({
          name: formattedEvent.artistInfo.name,
          externalIds: {
            ticketmaster: formattedEvent.artistInfo.externalId
          },
          genre: formattedEvent.artistInfo.genre ? [formattedEvent.artistInfo.genre] : [],
          images: {
            large: formattedEvent.artistInfo.images?.[0]?.url
          },
          tourStatus: 'active',
          lastUpdated: new Date()
        });
      }

      // Update artist stats
      artist.stats.upcomingEvents = await Event.countDocuments({
        artist: artist._id,
        date: { $gte: new Date() }
      });
      await artist.save();

      // Find or create Venue document
      const Venue = require('../models/Venue');
      let venueRef = null;
      if (formattedEvent.venue?.name && formattedEvent.venue?.city && formattedEvent.venue.name !== 'Venue TBA') {
        try {
          const venueDoc = await Venue.findOrCreateFromEventVenue(formattedEvent.venue);
          if (venueDoc) {
            venueRef = venueDoc._id;
            // Set TM venue ID if not already set
            if (formattedEvent.venueExternalId && !venueDoc.externalIds?.ticketmaster) {
              venueDoc.externalIds.ticketmaster = formattedEvent.venueExternalId;
              await venueDoc.save();
            }
          }
        } catch (venueErr) {
          console.error('Error creating venue:', venueErr.message);
        }
      }

      // Create or update event
      if (event) {
        // Update existing event
        Object.assign(event, {
          ...formattedEvent,
          artist: artist._id,
          venueRef: venueRef || event.venueRef,
          lastUpdated: new Date()
        });
        await event.save();
        return { success: true, event, artist, created: false };
      } else {
        // Create new event
        event = await Event.create({
          ...formattedEvent,
          artist: artist._id,
          venueRef
        });
        return { success: true, event, artist, created: true };
      }

    } catch (error) {
      console.error('Error saving event to database:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Bulk import events (useful for populating database)
  async importEvents(searchParams) {
    try {
      const result = await this.searchEvents(searchParams);
      
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const savedEvents = [];
      const errors = [];

      // Save each event
      for (const eventData of result.events) {
        const saveResult = await this.saveEventToDatabase(eventData);
        
        if (saveResult.success) {
          savedEvents.push(saveResult.event);
        } else {
          errors.push({
            eventName: eventData.name,
            error: saveResult.error
          });
        }
      }

      return {
        success: true,
        imported: savedEvents.length,
        errors: errors.length,
        details: {
          savedEvents,
          errors
        }
      };

    } catch (error) {
      console.error('Error importing events:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Get upcoming events for a specific artist (from TM API)
  async getArtistUpcomingEvents(artistId) {
    try {
      const response = await axios.get(`${TM_BASE_URL}/events.json`, {
        params: {
          apikey: this.apiKey,
          attractionId: artistId,
          sort: 'date,asc'
        }
      });

      const events = response.data._embedded?.events || [];
      
      return {
        success: true,
        events: events.map(event => this.formatEvent(event))
      };

    } catch (error) {
      console.error('Error fetching artist events:', error.message);
      return {
        success: false,
        error: error.message,
        events: []
      };
    }
  }

  // Search for artists/attractions
  async searchArtists(keyword, options = {}) {
    try {
      const { musicOnly = true } = options;
      
      const params = {
        apikey: this.apiKey,
        keyword: keyword,
        size: 20
      };
      
      // Filter to music only by default (excludes sports, theater, etc.)
      if (musicOnly) {
        params.classificationName = 'music';
      }
      
      const response = await axios.get(`${TM_BASE_URL}/attractions.json`, { params });

      const attractions = response.data._embedded?.attractions || [];
      
      return {
        success: true,
        artists: attractions.map(attraction => ({
          name: attraction.name,
          externalId: attraction.id,
          genre: attraction.classifications?.[0]?.genre?.name,
          segment: attraction.classifications?.[0]?.segment?.name,
          images: attraction.images,
          url: attraction.url
        }))
      };

    } catch (error) {
      console.error('Error searching artists:', error.message);
      return {
        success: false,
        error: error.message,
        artists: []
      };
    }
  }

  // Check inventory status for events (requires Inventory Status API access)
  // Contact devportalinquiry@ticketmaster.com to request access
  async checkInventoryStatus(eventIds) {
    try {
      // eventIds should be an array of Ticketmaster event IDs
      const ids = Array.isArray(eventIds) ? eventIds.join(',') : eventIds;
      
      const response = await axios.get('https://app.ticketmaster.com/inventory-status/v1/availability', {
        params: {
          apikey: this.apiKey,
          events: ids
        }
      });

      // Response format:
      // [{ 
      //   eventId: "xxx",
      //   status: "TICKETS_AVAILABLE" | "TICKETS_NOT_AVAILABLE",
      //   resaleStatus: "TICKETS_AVAILABLE" | "TICKETS_NOT_AVAILABLE",
      //   currency: "USD",
      //   priceRanges: [
      //     { type: "primary", minPrice: 59.00, maxPrice: 249.00, listingsExtendBeyondMax: false },
      //     { type: "resale", minPrice: 69.00, maxPrice: 2000.00, listingsExtendBeyondMax: true }
      //   ]
      // }]
      
      return {
        success: true,
        inventory: response.data
      };

    } catch (error) {
      // If 403, likely don't have access to this API
      if (error.response?.status === 403) {
        console.log('Inventory Status API requires authorization. Contact devportalinquiry@ticketmaster.com');
      }
      return {
        success: false,
        error: error.message,
        needsAuth: error.response?.status === 403
      };
    }
  }

  // Fetch detailed venue info from TM Discovery API
  async getVenueDetails(tmVenueId) {
    try {
      const response = await axios.get(`${TM_BASE_URL}/venues/${tmVenueId}.json`, {
        params: { apikey: this.apiKey }
      });

      const v = response.data;

      // Pick best image sizes
      const images = {};
      if (v.images && v.images.length > 0) {
        const sorted = [...v.images].sort((a, b) => (b.width || 0) - (a.width || 0));
        // Hero requires a genuinely large image (>= 1024px) — don't stretch small logos
        images.hero = sorted.find(img => img.width >= 1024 && img.ratio === '16_9')?.url
          || sorted.find(img => img.width >= 1024)?.url;
        images.large = sorted.find(img => img.width >= 1000)?.url;
        images.medium = sorted.find(img => img.width >= 500)?.url
          || sorted.find(img => img.width >= 300)?.url;
        images.thumbnail = sorted.find(img => img.width < 500)?.url
          || sorted[sorted.length - 1]?.url; // smallest available
      }

      // Extract social links from externalLinks and social
      const social = {};
      const extLinks = v.externalLinks || {};
      if (extLinks.twitter?.length) social.twitter = extLinks.twitter[0].url;
      if (extLinks.facebook?.length) social.facebook = extLinks.facebook[0].url;
      if (extLinks.instagram?.length) social.instagram = extLinks.instagram[0].url;
      if (extLinks.wiki?.length) social.wiki = extLinks.wiki[0].url;
      // Also check social object
      if (v.social) {
        if (v.social.twitter?.handle && !social.twitter) social.twitter = `https://twitter.com/${v.social.twitter.handle}`;
      }

      return {
        success: true,
        // v.type is always "venue" — only use classifications if meaningful
        venueType: v.classifications?.[0]?.segment?.name || (v.type && v.type !== 'venue' ? v.type : undefined),
        url: v.url,
        images,
        capacity: v.capacity,
        generalInfo: v.generalInfo ? {
          generalRule: v.generalInfo.generalRule,
          childRule: v.generalInfo.childRule
        } : undefined,
        boxOfficeInfo: v.boxOfficeInfo ? {
          phoneNumber: v.boxOfficeInfo.phoneNumberDetail,
          openHours: v.boxOfficeInfo.openHoursDetail,
          acceptedPayment: v.boxOfficeInfo.acceptedPaymentDetail,
          willCall: v.boxOfficeInfo.willCallDetail
        } : undefined,
        parkingDetail: v.parkingDetail,
        accessibleSeatingDetail: v.accessibleSeatingDetail,
        social,
        address: v.address?.line1,
        city: v.city?.name,
        state: v.state?.stateCode,
        country: v.country?.countryCode,
        zipCode: v.postalCode,
        location: v.location ? {
          latitude: parseFloat(v.location.latitude),
          longitude: parseFloat(v.location.longitude)
        } : undefined
      };
    } catch (error) {
      console.error('Error fetching venue details from TM:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  // Search TM for a venue by name/city and return the best-matching venue ID
  async lookupVenueTmId(name, city) {
    try {
      const response = await axios.get(`${TM_BASE_URL}/venues.json`, {
        params: {
          apikey: this.apiKey,
          keyword: name,
          size: 5
        }
      });

      const venues = response.data._embedded?.venues || [];
      if (venues.length === 0) return null;

      // Prefer a venue whose city matches
      const cityLower = (city || '').toLowerCase();
      const match = venues.find(v => (v.city?.name || '').toLowerCase() === cityLower) || venues[0];
      return match.id;
    } catch (error) {
      console.error('[Venue Lookup] TM search failed:', error.message);
      return null;
    }
  }

  // Query Wikidata for venue capacity and type (indoor/outdoor)
  async getWikidataVenueInfo(venueName) {
    try {
      // Sanitize venue name for SPARQL (escape quotes)
      const safeName = venueName.replace(/"/g, '\\"');
      const sparql = `
        SELECT ?item ?itemLabel ?capacity ?instanceLabel WHERE {
          ?item rdfs:label "${safeName}"@en .
          OPTIONAL { ?item wdt:P1083 ?capacity . }
          OPTIONAL { ?item wdt:P31 ?instance . }
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
        } LIMIT 10
      `;
      const response = await axios.get('https://query.wikidata.org/sparql', {
        params: { query: sparql, format: 'json' },
        headers: { 'User-Agent': 'EventTracker/1.0' },
        timeout: 5000
      });

      const results = response.data.results.bindings;
      if (!results.length) return null;

      // Get max capacity (Wikidata often has multiple configs)
      const capacities = results.map(r => parseInt(r.capacity?.value)).filter(n => n > 0);
      const capacity = capacities.length ? Math.max(...capacities) : null;

      // Collect all instance types
      const types = [...new Set(results.map(r => r.instanceLabel?.value).filter(Boolean))];

      // Determine indoor/outdoor from instance types
      const OUTDOOR_TYPES = ['sylvan theater', 'outdoor concert venue', 'amphitheatre', 'amphitheater', 'stadium', 'baseball venue', 'football venue'];
      const INDOOR_TYPES = ['arena', 'multi-purpose hall', 'concert hall', 'theatre building', 'performing arts center', 'nightclub', 'music venue'];

      const typesLower = types.map(t => t.toLowerCase());
      let openAir = null;
      if (typesLower.some(t => OUTDOOR_TYPES.some(ot => t.includes(ot)))) {
        openAir = true;
      } else if (typesLower.some(t => INDOOR_TYPES.some(it => t.includes(it)))) {
        openAir = false;
      }

      // Also check venue name as a fallback for open-air detection
      const nameLower = venueName.toLowerCase();
      if (openAir === null) {
        const outdoorKeywords = ['amphitheatre', 'amphitheater', 'pavilion', 'bowl', 'field', 'stadium', 'park', 'outdoor'];
        if (outdoorKeywords.some(kw => nameLower.includes(kw))) openAir = true;
      }

      // Derive a readable venueType from Wikidata instance types
      let venueType = null;
      const typeMap = {
        'arena': 'Arena', 'multi-purpose hall': 'Arena',
        'stadium': 'Stadium', 'baseball venue': 'Stadium', 'football venue': 'Stadium',
        'concert hall': 'Concert Hall', 'performing arts center': 'Concert Hall',
        'theatre building': 'Theater', 'theater': 'Theater',
        'sylvan theater': 'Amphitheater', 'outdoor concert venue': 'Amphitheater', 'amphitheatre': 'Amphitheater',
        'nightclub': 'Club', 'music venue': 'Music Venue'
      };
      for (const t of typesLower) {
        for (const [key, label] of Object.entries(typeMap)) {
          if (t.includes(key)) { venueType = label; break; }
        }
        if (venueType) break;
      }

      return { capacity, openAir, venueType, wikidataTypes: types };
    } catch (error) {
      console.error('[Wikidata] Query failed:', error.message);
      return null;
    }
  }

  // Enrich a Venue document with detailed TM data (7-day cooldown)
  async enrichVenueFromTM(venueDoc) {
    const ENRICH_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

    // Skip if enriched recently
    if (venueDoc.lastEnrichedAt && (Date.now() - venueDoc.lastEnrichedAt.getTime()) < ENRICH_COOLDOWN_MS) {
      return venueDoc;
    }

    // If no TM ID, try to find one by name/city
    let tmId = venueDoc.externalIds?.ticketmaster;
    if (!tmId) {
      tmId = await this.lookupVenueTmId(venueDoc.name, venueDoc.city);
      if (!tmId) {
        // No match found — set cooldown so we don't keep searching
        venueDoc.lastEnrichedAt = new Date();
        await venueDoc.save();
        return venueDoc;
      }
      if (!venueDoc.externalIds) venueDoc.externalIds = {};
      venueDoc.externalIds.ticketmaster = tmId;
    }

    const details = await this.getVenueDetails(tmId);
    if (!details.success) return venueDoc;

    // Update fields (only overwrite with non-null values)
    if (details.venueType) venueDoc.venueType = details.venueType;
    if (details.url) venueDoc.url = details.url;
    if (details.capacity && !venueDoc.capacity) venueDoc.capacity = details.capacity;

    // Images — merge, don't overwrite existing
    if (details.images) {
      if (!venueDoc.images) venueDoc.images = {};
      if (details.images.hero) venueDoc.images.hero = details.images.hero;
      if (details.images.large) venueDoc.images.large = details.images.large;
      if (details.images.medium) venueDoc.images.medium = details.images.medium;
      if (details.images.thumbnail) venueDoc.images.thumbnail = details.images.thumbnail;
    }

    if (details.generalInfo) venueDoc.generalInfo = details.generalInfo;
    if (details.boxOfficeInfo) venueDoc.boxOfficeInfo = details.boxOfficeInfo;
    if (details.parkingDetail) venueDoc.parkingDetail = details.parkingDetail;
    if (details.accessibleSeatingDetail) venueDoc.accessibleSeatingDetail = details.accessibleSeatingDetail;
    if (details.social && Object.keys(details.social).length > 0) venueDoc.social = details.social;

    // Fill in missing address/location data from TM
    if (details.address && !venueDoc.address) venueDoc.address = details.address;
    if (details.zipCode && !venueDoc.zipCode) venueDoc.zipCode = details.zipCode;
    if (details.location && (!venueDoc.location?.coordinates || venueDoc.location.coordinates.length !== 2)) {
      venueDoc.location = {
        type: 'Point',
        coordinates: [details.location.longitude, details.location.latitude]
      };
    }

    // Supplement with Wikidata for capacity, venue type, and indoor/outdoor
    try {
      const wikiInfo = await this.getWikidataVenueInfo(venueDoc.name);
      if (wikiInfo) {
        if (wikiInfo.capacity && !venueDoc.capacity) venueDoc.capacity = wikiInfo.capacity;
        if (wikiInfo.venueType && !venueDoc.venueType) venueDoc.venueType = wikiInfo.venueType;
        if (wikiInfo.openAir !== null && venueDoc.openAir == null) venueDoc.openAir = wikiInfo.openAir;
      }
    } catch (wikiErr) {
      console.error('[Wikidata] Enrichment failed, skipping:', wikiErr.message);
    }

    venueDoc.lastEnrichedAt = new Date();
    await venueDoc.save();

    return venueDoc;
  }

  // Update events in database with inventory status
  async updateEventInventory(eventId) {
    try {
      // Find event in our database
      const event = await Event.findOne({ 'externalIds.ticketmaster': eventId });
      if (!event) {
        return { success: false, error: 'Event not found' };
      }

      // Check inventory status
      const inventoryResult = await this.checkInventoryStatus(eventId);
      if (!inventoryResult.success) {
        return inventoryResult;
      }

      const inventory = inventoryResult.inventory[0];
      if (!inventory) {
        return { success: false, error: 'No inventory data returned' };
      }

      // Update event with inventory data
      event.ticketInfo.status = inventory.status === 'TICKETS_AVAILABLE' ? 'on_sale' : 'sold_out';
      event.ticketInfo.resaleStatus = inventory.resaleStatus === 'TICKETS_AVAILABLE' ? 'available' : 'not_available';
      
      // Update price ranges from inventory API (more accurate/real-time)
      if (inventory.priceRanges) {
        event.ticketInfo.priceRanges = inventory.priceRanges.map(pr => ({
          type: pr.type,
          min: pr.minPrice,
          max: pr.maxPrice,
          currency: inventory.currency
        }));
        
        // Update main min/max from primary prices
        const primary = inventory.priceRanges.find(pr => pr.type === 'primary');
        if (primary) {
          event.ticketInfo.minPrice = primary.minPrice;
          event.ticketInfo.maxPrice = primary.maxPrice;
        }
      }
      
      event.ticketInfo.lastInventoryCheck = new Date();
      await event.save();

      return { success: true, event };

    } catch (error) {
      console.error('Error updating event inventory:', error.message);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
module.exports = new TicketmasterService();