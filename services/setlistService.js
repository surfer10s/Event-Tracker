// Setlist.fm API Service
// This handles all communication with Setlist.fm API
// Cross-reference tour data, get setlists, venue history, and artist stats

const axios = require('axios');
const Artist = require('../models/Artist');

// Base URL for Setlist.fm API
const SETLIST_BASE_URL = 'https://api.setlist.fm/rest/1.0';

class SetlistService {
  constructor() {
    this.apiKey = process.env.SETLISTFM_API_KEY;
    
    if (!this.apiKey) {
      console.warn('WARNING: Setlist.fm API key not found in environment variables');
    }
  }

  // Get API headers
  getHeaders() {
    return {
      'Accept': 'application/json',
      'x-api-key': this.apiKey
    };
  }

  // Search for artists on Setlist.fm
  async searchArtists(query) {
    try {
      const response = await axios.get(`${SETLIST_BASE_URL}/search/artists`, {
        params: {
          artistName: query,
          p: 1,
          sort: 'relevance'
        },
        headers: this.getHeaders()
      });

      const artists = response.data.artist || [];
      
      return {
        success: true,
        artists: artists.map(artist => ({
          mbid: artist.mbid, // MusicBrainz ID
          name: artist.name,
          sortName: artist.sortName,
          disambiguation: artist.disambiguation,
          url: artist.url
        }))
      };

    } catch (error) {
      // Handle 404 as "no results found" - not an error
      if (error.response?.status === 404) {
        return {
          success: true,
          artists: []
        };
      }
      
      console.error('Setlist.fm artist search error:', error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        artists: []
      };
    }
  }

  // Get artist details by MusicBrainz ID
  async getArtist(mbid) {
    try {
      const response = await axios.get(`${SETLIST_BASE_URL}/artist/${mbid}`, {
        headers: this.getHeaders()
      });

      return {
        success: true,
        artist: response.data
      };

    } catch (error) {
      console.error('Setlist.fm get artist error:', error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  // Get artist setlists
  async getArtistSetlists(mbid, page = 1) {
    try {
      const response = await axios.get(`${SETLIST_BASE_URL}/artist/${mbid}/setlists`, {
        params: {
          p: page
        },
        headers: this.getHeaders()
      });

      const setlists = response.data.setlist || [];
      
      return {
        success: true,
        setlists: setlists.map(setlist => this.formatSetlist(setlist)),
        pagination: {
          page: response.data.page,
          itemsPerPage: response.data.itemsPerPage,
          total: response.data.total
        }
      };

    } catch (error) {
      console.error('Setlist.fm get setlists error:', error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        setlists: []
      };
    }
  }

  // Get recent setlists for an artist (most recent tour data)
  async getRecentSetlists(mbid, limit = 20) {
    try {
      const result = await this.getArtistSetlists(mbid, 1);
      
      if (!result.success) {
        return result;
      }

      // Limit to most recent
      const recentSetlists = result.setlists.slice(0, limit);

      return {
        success: true,
        setlists: recentSetlists,
        count: recentSetlists.length
      };

    } catch (error) {
      console.error('Error getting recent setlists:', error.message);
      return {
        success: false,
        error: error.message,
        setlists: []
      };
    }
  }

  // Get setlist by ID
  async getSetlist(setlistId) {
    try {
      const response = await axios.get(`${SETLIST_BASE_URL}/setlist/${setlistId}`, {
        headers: this.getHeaders()
      });

      return {
        success: true,
        setlist: this.formatSetlist(response.data)
      };

    } catch (error) {
      console.error('Setlist.fm get setlist error:', error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  // Search setlists by criteria
  async searchSetlists(params = {}) {
    try {
      const {
        artistMbid,
        artistName,
        cityName,
        countryCode,
        date,
        tourName,
        venueName,
        year,
        page = 1
      } = params;

      const queryParams = { p: page };
      
      if (artistMbid) queryParams.artistMbid = artistMbid;
      if (artistName) queryParams.artistName = artistName;
      if (cityName) queryParams.cityName = cityName;
      if (countryCode) queryParams.countryCode = countryCode;
      if (date) queryParams.date = date; // Format: dd-MM-yyyy
      if (tourName) queryParams.tourName = tourName;
      if (venueName) queryParams.venueName = venueName;
      if (year) queryParams.year = year;

      const response = await axios.get(`${SETLIST_BASE_URL}/search/setlists`, {
        params: queryParams,
        headers: this.getHeaders()
      });

      const setlists = response.data.setlist || [];

      return {
        success: true,
        setlists: setlists.map(setlist => this.formatSetlist(setlist)),
        pagination: {
          page: response.data.page,
          itemsPerPage: response.data.itemsPerPage,
          total: response.data.total
        }
      };

    } catch (error) {
      // Handle 404 as "no results found" - not an error
      if (error.response?.status === 404) {
        return {
          success: true,
          setlists: [],
          pagination: {
            page: 1,
            itemsPerPage: 20,
            total: 0
          }
        };
      }

      console.error('Setlist.fm search error:', error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        setlists: []
      };
    }
  }

  // Get venue information
  async getVenue(venueId) {
    try {
      const response = await axios.get(`${SETLIST_BASE_URL}/venue/${venueId}`, {
        headers: this.getHeaders()
      });

      return {
        success: true,
        venue: response.data
      };

    } catch (error) {
      console.error('Setlist.fm get venue error:', error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  // Format setlist data to a cleaner structure
  formatSetlist(setlist) {
    const songs = [];
    const sets = [];
    
    // Extract songs from sets - preserve structure
    if (setlist.sets && setlist.sets.set) {
      setlist.sets.set.forEach((set, index) => {
        const setData = {
          name: set.name || (set.encore ? `Encore ${set.encore}` : (index === 0 ? 'Main Set' : `Set ${index + 1}`)),
          encore: set.encore || null,
          songs: []
        };
        
        if (set.song) {
          set.song.forEach(song => {
            const songData = {
              name: song.name,
              cover: song.cover ? {
                name: song.cover.name,
                sortName: song.cover.sortName,
                mbid: song.cover.mbid
              } : null,
              info: song.info,
              tape: song.tape || false
            };
            songs.push(songData);
            setData.songs.push(songData);
          });
        }
        
        if (setData.songs.length > 0) {
          sets.push(setData);
        }
      });
    }

    return {
      id: setlist.id,
      versionId: setlist.versionId,
      eventDate: setlist.eventDate,
      lastUpdated: setlist.lastUpdated,
      artist: {
        mbid: setlist.artist.mbid,
        name: setlist.artist.name,
        sortName: setlist.artist.sortName,
        disambiguation: setlist.artist.disambiguation,
        url: setlist.artist.url
      },
      venue: {
        id: setlist.venue.id,
        name: setlist.venue.name,
        city: {
          id: setlist.venue.city.id,
          name: setlist.venue.city.name,
          state: setlist.venue.city.state,
          stateCode: setlist.venue.city.stateCode,
          coords: setlist.venue.city.coords,
          country: setlist.venue.city.country
        }
      },
      tour: setlist.tour ? {
        name: setlist.tour.name
      } : null,
      sets: sets,
      songs: songs,
      songCount: songs.length,
      info: setlist.info,
      url: setlist.url
    };
  }

  // Cross-reference with our database artist
  async linkArtistByName(artistName) {
    try {
      // Search Setlist.fm for the artist
      const searchResult = await this.searchArtists(artistName);
      
      if (!searchResult.success || searchResult.artists.length === 0) {
        return {
          success: false,
          message: 'Artist not found on Setlist.fm'
        };
      }

      // Get the best match (first result)
      const setlistArtist = searchResult.artists[0];

      // Find artist in our database
      const dbArtist = await Artist.findOne({ name: artistName });

      if (!dbArtist) {
        return {
          success: false,
          message: 'Artist not found in database'
        };
      }

      // Update artist with Setlist.fm info
      if (!dbArtist.externalIds) {
        dbArtist.externalIds = {};
      }
      dbArtist.externalIds.setlistfm = setlistArtist.mbid;
      await dbArtist.save();

      return {
        success: true,
        message: 'Artist linked with Setlist.fm',
        mbid: setlistArtist.mbid,
        artist: dbArtist
      };

    } catch (error) {
      console.error('Error linking artist:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get tour statistics from setlists
  async getTourStats(mbid, tourName) {
    try {
      const result = await this.searchSetlists({
        artistMbid: mbid,
        tourName: tourName
      });

      if (!result.success) {
        return result;
      }

      const setlists = result.setlists;

      // Calculate statistics
      const stats = {
        totalShows: setlists.length,
        cities: new Set(setlists.map(s => s.venue.city.name)).size,
        countries: new Set(setlists.map(s => s.venue.city.country.code)).size,
        venues: new Set(setlists.map(s => s.venue.name)).size,
        averageSongCount: setlists.reduce((sum, s) => sum + s.songCount, 0) / setlists.length,
        dateRange: {
          first: setlists[setlists.length - 1]?.eventDate,
          last: setlists[0]?.eventDate
        },
        mostPlayedSongs: this.getMostPlayedSongs(setlists)
      };

      return {
        success: true,
        tourName: tourName,
        stats: stats,
        setlists: setlists
      };

    } catch (error) {
      console.error('Error getting tour stats:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Helper: Get most played songs from setlists
  getMostPlayedSongs(setlists, limit = 10) {
    const songCounts = {};

    setlists.forEach(setlist => {
      setlist.songs.forEach(song => {
        const songName = song.name;
        songCounts[songName] = (songCounts[songName] || 0) + 1;
      });
    });

    return Object.entries(songCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({
        name,
        timesPlayed: count,
        percentage: ((count / setlists.length) * 100).toFixed(1)
      }));
  }

  // Get average setlist for an artist (most commonly played songs)
  async getAverageSetlist(mbid, limit = 20) {
    try {
      const result = await this.getRecentSetlists(mbid, 50);
      
      if (!result.success) {
        return result;
      }

      const mostPlayed = this.getMostPlayedSongs(result.setlists, limit);

      return {
        success: true,
        averageSetlist: mostPlayed,
        basedOnShows: result.setlists.length
      };

    } catch (error) {
      console.error('Error getting average setlist:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get venue history for an artist
  async getVenueHistory(mbid, venueName) {
    try {
      const result = await this.searchSetlists({
        artistMbid: mbid,
        venueName: venueName
      });

      if (!result.success) {
        return result;
      }

      return {
        success: true,
        venueName: venueName,
        showCount: result.setlists.length,
        setlists: result.setlists,
        dateRange: {
          first: result.setlists[result.setlists.length - 1]?.eventDate,
          last: result.setlists[0]?.eventDate
        }
      };

    } catch (error) {
      console.error('Error getting venue history:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Export singleton instance
module.exports = new SetlistService();