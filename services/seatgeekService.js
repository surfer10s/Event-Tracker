// SeatGeek API Service
// Focused on fetching resale pricing data to enrich Ticketmaster events

const axios = require('axios');

const SEATGEEK_BASE_URL = 'https://api.seatgeek.com/2';

class SeatGeekService {
  constructor() {
    this.clientId = process.env.SEATGEEK_API_KEY;
    this.clientSecret = process.env.SEATGEEK_CLIENT_SECRET;
    this.affiliateId = process.env.SEATGEEK_AFFILIATE_ID;
    
    if (!this.clientId) {
      console.warn('WARNING: SeatGeek API key not found in environment variables');
    }
  }

  // Build affiliate URL
  buildAffiliateUrl(originalUrl) {
    if (!originalUrl) return null;
    if (this.affiliateId) {
      const separator = originalUrl.includes('?') ? '&' : '?';
      return `${originalUrl}${separator}aid=${this.affiliateId}`;
    }
    return originalUrl;
  }

  // Search for events by performer name
  async searchEventsByPerformer(performerName, options = {}) {
    try {
      const { perPage = 25, page = 1 } = options;
      
      const response = await axios.get(`${SEATGEEK_BASE_URL}/events`, {
        params: {
          'performers.slug': this.slugify(performerName),
          per_page: perPage,
          page: page,
          client_id: this.clientId
        }
      });

      return {
        success: true,
        events: response.data.events.map(event => this.formatEvent(event)),
        meta: response.data.meta
      };
    } catch (error) {
      // Try searching by query if slug doesn't work
      if (error.response?.status === 404 || error.response?.data?.events?.length === 0) {
        return this.searchEventsByQuery(performerName, options);
      }
      
      console.error('SeatGeek API Error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        events: []
      };
    }
  }

  // Search events by general query
  async searchEventsByQuery(query, options = {}) {
    try {
      const { perPage = 25, page = 1 } = options;
      
      const response = await axios.get(`${SEATGEEK_BASE_URL}/events`, {
        params: {
          q: query,
          per_page: perPage,
          page: page,
          client_id: this.clientId
        }
      });

      return {
        success: true,
        events: response.data.events.map(event => this.formatEvent(event)),
        meta: response.data.meta
      };
    } catch (error) {
      console.error('SeatGeek API Error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        events: []
      };
    }
  }

  // Get a specific event by SeatGeek ID
  async getEventById(seatgeekId) {
    try {
      const response = await axios.get(`${SEATGEEK_BASE_URL}/events/${seatgeekId}`, {
        params: {
          client_id: this.clientId
        }
      });

      return {
        success: true,
        event: this.formatEvent(response.data)
      };
    } catch (error) {
      console.error('SeatGeek API Error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  // Find matching SeatGeek event for a Ticketmaster event
  async findMatchingEvent(tmEvent) {
    try {
      const artistName = tmEvent.artist?.name || tmEvent.artistInfo?.name;
      const venueName = tmEvent.venue?.name;
      const city = tmEvent.venue?.city;

      if (!artistName) {
        return { success: false, error: 'No artist name provided' };
      }

      // Parse the TM event date - extract just the date portion (YYYY-MM-DD)
      // to avoid timezone issues between TM (local) and SG (UTC)
      const tmDateStr = new Date(tmEvent.date).toISOString().split('T')[0];

      // Search by performer
      const result = await this.searchEventsByPerformer(artistName, { perPage: 50 });
      
      if (!result.success || result.events.length === 0) {
        return { success: false, error: 'No matching events found' };
      }

      // Find best match by date and venue
      const matches = result.events.filter(sgEvent => {
        // Use local date from SeatGeek to compare (avoids timezone issues)
        // dateLocal format is like "2026-04-21T20:00:00"
        const sgDateStr = sgEvent.dateLocal ? 
          sgEvent.dateLocal.split('T')[0] : 
          new Date(sgEvent.date).toISOString().split('T')[0];
        
        const sameDay = sgDateStr === tmDateStr;
        
        // Check venue match (fuzzy)
        const venueMatch = !venueName || !sgEvent.venue?.name || 
          this.fuzzyMatch(venueName, sgEvent.venue.name) ||
          this.fuzzyMatch(city, sgEvent.venue?.city);
        
        return sameDay && venueMatch;
      });

      if (matches.length === 0) {
        return { success: false, error: 'No matching event found for date/venue' };
      }

      // Return best match (first one that matches date/venue)
      return {
        success: true,
        event: matches[0],
        confidence: matches.length === 1 ? 'high' : 'medium'
      };
    } catch (error) {
      console.error('Error finding matching event:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Get pricing data for an event
  async getPricingData(seatgeekEventId) {
    try {
      const response = await axios.get(`${SEATGEEK_BASE_URL}/events/${seatgeekEventId}`, {
        params: {
          client_id: this.clientId
        }
      });

      const event = response.data;
      
      return {
        success: true,
        pricing: {
          lowestPrice: event.stats?.lowest_price,
          highestPrice: event.stats?.highest_price,
          averagePrice: event.stats?.average_price,
          medianPrice: event.stats?.median_price,
          listingCount: event.stats?.listing_count,
          dealScore: event.score, // SeatGeek's deal score (0-1, higher = better deal)
          url: this.buildAffiliateUrl(event.url)
        }
      };
    } catch (error) {
      console.error('Error fetching pricing:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Enrich a Ticketmaster event with SeatGeek pricing
  async enrichEventWithPricing(tmEvent) {
    try {
      // Find matching SeatGeek event
      const matchResult = await this.findMatchingEvent(tmEvent);
      
      if (!matchResult.success) {
        return { 
          success: false, 
          error: matchResult.error,
          enriched: false 
        };
      }

      const sgEvent = matchResult.event;
      
      // Build enrichment data
      const enrichment = {
        seatgeek: {
          eventId: sgEvent.id,
          url: this.buildAffiliateUrl(sgEvent.url),
          pricing: {
            lowestPrice: sgEvent.stats?.lowestPrice,
            highestPrice: sgEvent.stats?.highestPrice,
            averagePrice: sgEvent.stats?.averagePrice,
            medianPrice: sgEvent.stats?.medianPrice,
            listingCount: sgEvent.stats?.listingCount
          },
          dealScore: sgEvent.score,
          matchConfidence: matchResult.confidence,
          lastChecked: new Date()
        }
      };

      return {
        success: true,
        enriched: true,
        data: enrichment
      };
    } catch (error) {
      console.error('Error enriching event:', error.message);
      return { success: false, error: error.message, enriched: false };
    }
  }

  // Format SeatGeek event data
  formatEvent(sgEvent) {
    return {
      id: sgEvent.id,
      name: sgEvent.title || sgEvent.short_title,
      date: sgEvent.datetime_utc || sgEvent.datetime_local,
      dateLocal: sgEvent.datetime_local,
      
      venue: {
        id: sgEvent.venue?.id,
        name: sgEvent.venue?.name,
        address: sgEvent.venue?.address,
        city: sgEvent.venue?.city,
        state: sgEvent.venue?.state,
        country: sgEvent.venue?.country,
        postalCode: sgEvent.venue?.postal_code,
        location: sgEvent.venue?.location ? {
          lat: sgEvent.venue.location.lat,
          lng: sgEvent.venue.location.lon
        } : null,
        capacity: sgEvent.venue?.capacity
      },

      performers: (sgEvent.performers || []).map(p => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        image: p.image,
        isPrimary: p.primary
      })),

      // Pricing stats - this is the rich data we want!
      stats: {
        lowestPrice: sgEvent.stats?.lowest_price,
        highestPrice: sgEvent.stats?.highest_price,
        averagePrice: sgEvent.stats?.average_price,
        medianPrice: sgEvent.stats?.median_price,
        listingCount: sgEvent.stats?.listing_count,
        visibleListingCount: sgEvent.stats?.visible_listing_count
      },

      // Deal score (0-1, higher = better value)
      score: sgEvent.score,
      
      // Popularity score
      popularity: sgEvent.popularity,

      // Event type
      type: sgEvent.type,

      // URLs
      url: this.buildAffiliateUrl(sgEvent.url),

      // Announce date
      announceDate: sgEvent.announce_date,

      // Status
      status: sgEvent.status
    };
  }

  // Helper: Convert artist name to slug
  slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special chars
      .replace(/\s+/g, '-')     // Spaces to hyphens
      .replace(/-+/g, '-')      // Multiple hyphens to single
      .trim();
  }

  // Helper: Fuzzy string matching
  fuzzyMatch(str1, str2) {
    if (!str1 || !str2) return false;
    const s1 = str1.toLowerCase().replace(/[^\w]/g, '');
    const s2 = str2.toLowerCase().replace(/[^\w]/g, '');
    return s1.includes(s2) || s2.includes(s1);
  }

  // Search performers
  async searchPerformers(query) {
    try {
      const response = await axios.get(`${SEATGEEK_BASE_URL}/performers`, {
        params: {
          q: query,
          client_id: this.clientId
        }
      });

      return {
        success: true,
        performers: response.data.performers.map(p => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          image: p.image,
          score: p.score,
          popularity: p.popularity,
          type: p.type,
          numUpcomingEvents: p.num_upcoming_events
        }))
      };
    } catch (error) {
      console.error('SeatGeek API Error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.message,
        performers: []
      };
    }
  }

  // Test API connection
  async testConnection() {
    try {
      const response = await axios.get(`${SEATGEEK_BASE_URL}/events`, {
        params: {
          per_page: 1,
          client_id: this.clientId
        }
      });

      return {
        success: true,
        message: 'SeatGeek API connection successful',
        meta: response.data.meta
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }
}

module.exports = new SeatGeekService();