// Ticketmaster API Service
// This handles all communication with Ticketmaster API
// Think of this as a data access layer specifically for the TM API

const axios = require('axios');
const Artist = require('../models/Artist');
const Event = require('../models/Event');
const Tour = require('../models/Tour');

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
    
    // Extract price range
    const priceRange = tmEvent.priceRanges?.[0] || {};
    
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
      
      // Venue
      venue: {
        name: venue.name,
        address: venue.address?.line1,
        city: venue.city?.name,
        state: venue.state?.stateCode,
        country: venue.country?.countryCode || 'US',
        zipCode: venue.postalCode,
        location: venueLocation
      },
      
      // Ticket info
      ticketInfo: {
        minPrice: priceRange.min,
        maxPrice: priceRange.max,
        currency: priceRange.currency || 'USD',
        status: this.mapTicketStatus(tmEvent.dates?.status?.code),
        onSaleDate: tmEvent.sales?.public?.startDateTime ? 
          new Date(tmEvent.sales.public.startDateTime) : undefined,
        offSaleDate: tmEvent.sales?.public?.endDateTime ? 
          new Date(tmEvent.sales.public.endDateTime) : undefined
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

      // Create or update event
      if (event) {
        // Update existing event
        Object.assign(event, {
          ...formattedEvent,
          artist: artist._id,
          lastUpdated: new Date()
        });
        await event.save();
      } else {
        // Create new event
        event = await Event.create({
          ...formattedEvent,
          artist: artist._id
        });
      }

      return { success: true, event, artist };

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
  async searchArtists(keyword) {
    try {
      const response = await axios.get(`${TM_BASE_URL}/attractions.json`, {
        params: {
          apikey: this.apiKey,
          keyword: keyword,
          size: 20
        }
      });

      const attractions = response.data._embedded?.attractions || [];
      
      return {
        success: true,
        artists: attractions.map(attraction => ({
          name: attraction.name,
          externalId: attraction.id,
          genre: attraction.classifications?.[0]?.genre?.name,
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
}

// Export singleton instance
module.exports = new TicketmasterService();