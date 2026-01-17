// Notification Service - Checks for matching events and creates notifications
const User = require('../models/User');
const Artist = require('../models/Artist');
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const UserMusicTaste = require('../models/UserMusicTaste');

// Haversine formula to calculate distance between two coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Get venue coordinates from event (GeoJSON format: [longitude, latitude])
function getVenueCoordinates(event) {
    if (event.venue?.location?.coordinates?.length === 2) {
        const [lng, lat] = event.venue.location.coordinates;
        if (lat && lng) {
            return { lat, lon: lng };
        }
    }
    return null;
}

// Legacy fallback - major cities lookup (for venues without coordinates)
const CITY_COORDS = {
    'los angeles-ca': { lat: 34.0522, lon: -118.2437 },
    'san diego-ca': { lat: 32.7157, lon: -117.1611 },
    'san francisco-ca': { lat: 37.7749, lon: -122.4194 },
    'anaheim-ca': { lat: 33.8366, lon: -117.9143 },
    'inglewood-ca': { lat: 33.9617, lon: -118.3531 },
    'oakland-ca': { lat: 37.8044, lon: -122.2712 },
    'phoenix-az': { lat: 33.4484, lon: -112.0740 },
    'las vegas-nv': { lat: 36.1699, lon: -115.1398 },
    'houston-tx': { lat: 29.7604, lon: -95.3698 },
    'dallas-tx': { lat: 32.7767, lon: -96.7970 },
    'austin-tx': { lat: 30.2672, lon: -97.7431 },
    'new york-ny': { lat: 40.7128, lon: -74.0060 },
    'brooklyn-ny': { lat: 40.6782, lon: -73.9442 },
    'miami-fl': { lat: 25.7617, lon: -80.1918 },
    'orlando-fl': { lat: 28.5383, lon: -81.3792 },
    'chicago-il': { lat: 41.8781, lon: -87.6298 },
    'denver-co': { lat: 39.7392, lon: -104.9903 },
    'seattle-wa': { lat: 47.6062, lon: -122.3321 },
    'atlanta-ga': { lat: 33.7490, lon: -84.3880 },
    'boston-ma': { lat: 42.3601, lon: -71.0589 },
    'nashville-tn': { lat: 36.1627, lon: -86.7816 },
    'philadelphia-pa': { lat: 39.9526, lon: -75.1652 },
    'washington-dc': { lat: 38.9072, lon: -77.0369 },
    'detroit-mi': { lat: 42.3314, lon: -83.0458 },
    'minneapolis-mn': { lat: 44.9778, lon: -93.2650 },
    'portland-or': { lat: 45.5152, lon: -122.6784 },
};

function getCoordinates(city, state) {
    if (!city || !state) return null;
    const key = `${city.toLowerCase()}-${state.toLowerCase()}`;
    return CITY_COORDS[key] || null;
}

// Main function to check events for a single user
async function checkEventsForUser(userId, options = {}) {
    const { maxDistance = 50, dryRun = false, debug = true } = options;
    
    const user = await User.findById(userId).populate('favoriteArtists');
    if (!user) {
        console.log(`User ${userId} not found`);
        return { success: false, error: 'User not found' };
    }
    
    // Get user's coordinates - prefer geocoded, fallback to city lookup
    let userCoords = null;
    let coordSource = '';
    
    if (user.coordinates?.lat && user.coordinates?.lng) {
        userCoords = { lat: user.coordinates.lat, lon: user.coordinates.lng };
        coordSource = 'geocoded';
    } else {
        userCoords = getCoordinates(user.city, user.state);
        coordSource = 'city_lookup';
    }
    
    if (!userCoords) {
        console.log(`No coordinates for user ${user.username} (${user.city}, ${user.state})`);
        return { success: false, error: 'User location not found - please update address' };
    }
    
    console.log(`\nChecking events for ${user.username} (${coordSource})`);
    console.log(`Location: ${user.city}, ${user.state} | Coords: ${userCoords.lat}, ${userCoords.lon}`);
    
    const notifications = [];
    const now = new Date();
    let debugStats = {
        eventsChecked: 0,
        eventsNoCoords: 0,
        eventsTooFar: 0,
        eventsMatched: 0,
        venuesMissingCoords: new Set()
    };
    
    // TIER 1: Check favorite artists
    console.log(`\n--- Tier 1: Favorites (${user.favoriteArtists?.length || 0} artists) ---`);
    
    for (const artist of user.favoriteArtists || []) {
        const events = await Event.find({
            artist: artist._id,
            date: { $gte: now }
        }).sort({ date: 1 });
        
        if (debug && events.length > 0) {
            console.log(`  ${artist.name}: ${events.length} upcoming events`);
        }
        
        for (const event of events) {
            debugStats.eventsChecked++;
            
            // Try GeoJSON coordinates first, then city lookup
            let venueCoords = getVenueCoordinates(event);
            if (!venueCoords && event.venue?.city && event.venue?.state) {
                venueCoords = getCoordinates(event.venue.city, event.venue.state);
            }
            
            if (!venueCoords) {
                debugStats.eventsNoCoords++;
                if (event.venue?.city && event.venue?.state) {
                    debugStats.venuesMissingCoords.add(`${event.venue.city}-${event.venue.state}`);
                }
                continue;
            }
            
            const distance = calculateDistance(
                userCoords.lat, userCoords.lon,
                venueCoords.lat, venueCoords.lon
            );
            
            if (distance <= maxDistance) {
                debugStats.eventsMatched++;
                
                // In-app notification
                notifications.push({
                    userId: user._id,
                    eventId: event._id,
                    artistId: artist._id,
                    artistName: artist.name,
                    eventName: event.name,
                    eventDate: event.date,
                    venueName: event.venue?.name,
                    venueCity: event.venue?.city,
                    venueState: event.venue?.state,
                    ticketUrl: event.ticketUrl,
                    distance: Math.round(distance),
                    type: 'new_event',
                    tier: 'favorite',
                    reason: 'One of your favorite artists',
                    channel: 'in_app'
                });
                
                // Email notification
                notifications.push({
                    userId: user._id,
                    eventId: event._id,
                    artistId: artist._id,
                    artistName: artist.name,
                    eventName: event.name,
                    eventDate: event.date,
                    venueName: event.venue?.name,
                    venueCity: event.venue?.city,
                    venueState: event.venue?.state,
                    ticketUrl: event.ticketUrl,
                    distance: Math.round(distance),
                    type: 'new_event',
                    tier: 'favorite',
                    reason: 'One of your favorite artists',
                    channel: 'email'
                });
                
                console.log(`  ✓ ${artist.name} at ${event.venue?.name} (${Math.round(distance)} mi)`);
            } else {
                debugStats.eventsTooFar++;
            }
        }
    }
    
    // TIER 2: Check music taste artists
    const userTaste = await UserMusicTaste.findOne({ userId: user._id });
    
    if (userTaste && userTaste.artists?.length > 0) {
        console.log(`\n--- Tier 2: Music Taste (${userTaste.artists.length} artists) ---`);
        
        const favoriteNames = new Set(
            (user.favoriteArtists || []).map(a => a.name.toLowerCase())
        );
        
        for (const tasteArtist of userTaste.artists) {
            if (favoriteNames.has(tasteArtist.name.toLowerCase())) continue;
            
            const artist = await Artist.findOne({
                name: { $regex: new RegExp(`^${escapeRegex(tasteArtist.name)}$`, 'i') }
            });
            
            if (!artist) continue;
            
            const events = await Event.find({
                artist: artist._id,
                date: { $gte: now }
            }).sort({ date: 1 });
            
            for (const event of events) {
                let venueCoords = getVenueCoordinates(event);
                if (!venueCoords && event.venue?.city && event.venue?.state) {
                    venueCoords = getCoordinates(event.venue.city, event.venue.state);
                }
                
                if (!venueCoords) continue;
                
                const distance = calculateDistance(
                    userCoords.lat, userCoords.lon,
                    venueCoords.lat, venueCoords.lon
                );
                
                if (distance <= maxDistance) {
                    let reason = "From your music library";
                    if (tasteArtist.sources?.includes('liked')) {
                        reason = "You've liked a song by";
                    } else if (tasteArtist.sources?.includes('playlist')) {
                        reason = "On your playlist";
                    }
                    
                    notifications.push({
                        userId: user._id,
                        eventId: event._id,
                        artistId: artist._id,
                        artistName: artist.name,
                        eventName: event.name,
                        eventDate: event.date,
                        venueName: event.venue?.name,
                        venueCity: event.venue?.city,
                        venueState: event.venue?.state,
                        ticketUrl: event.ticketUrl,
                        distance: Math.round(distance),
                        type: 'new_event',
                        tier: 'music_taste',
                        reason: reason,
                        channel: 'in_app'
                    });
                    
                    notifications.push({
                        userId: user._id,
                        eventId: event._id,
                        artistId: artist._id,
                        artistName: artist.name,
                        eventName: event.name,
                        eventDate: event.date,
                        venueName: event.venue?.name,
                        venueCity: event.venue?.city,
                        venueState: event.venue?.state,
                        ticketUrl: event.ticketUrl,
                        distance: Math.round(distance),
                        type: 'new_event',
                        tier: 'music_taste',
                        reason: reason,
                        channel: 'email'
                    });
                    
                    console.log(`  ✓ ${artist.name} at ${event.venue?.name} (${Math.round(distance)} mi)`);
                }
            }
        }
    }
    
    // Save notifications
    let created = 0;
    let skipped = 0;
    
    if (!dryRun) {
        for (const notifData of notifications) {
            const result = await Notification.createIfNew(notifData);
            if (result.isNew) created++;
            else skipped++;
        }
    }
    
    if (debug) {
        console.log(`\n--- Summary ---`);
        console.log(`Events checked: ${debugStats.eventsChecked}`);
        console.log(`Events matched: ${debugStats.eventsMatched}`);
        console.log(`Events too far: ${debugStats.eventsTooFar}`);
        console.log(`Events missing coords: ${debugStats.eventsNoCoords}`);
    }
    
    console.log(`Results: ${created} new, ${skipped} duplicates`);
    
    return {
        success: true,
        userId: user._id,
        username: user.username,
        totalFound: notifications.length / 2,
        created,
        skipped,
        debug: debugStats
    };
}

// Check events for all users
async function checkEventsForAllUsers(options = {}) {
    console.log('=== Notification check for all users ===');
    
    const users = await User.find({
        $or: [
            { 'coordinates.lat': { $exists: true, $ne: null } },
            { city: { $exists: true, $ne: '' }, state: { $exists: true, $ne: '' } }
        ]
    }).select('_id username city state coordinates');
    
    console.log(`Found ${users.length} users with location\n`);
    
    const results = [];
    for (const user of users) {
        try {
            const result = await checkEventsForUser(user._id, options);
            results.push(result);
        } catch (err) {
            console.error(`Error for ${user.username}:`, err.message);
            results.push({ success: false, userId: user._id, error: err.message });
        }
    }
    
    const summary = {
        totalUsers: users.length,
        successful: results.filter(r => r.success).length,
        totalNotifications: results.reduce((sum, r) => sum + (r.created || 0), 0),
        errors: results.filter(r => !r.success).length
    };
    
    console.log('\n=== Summary ===');
    console.log(`Processed: ${summary.successful}/${summary.totalUsers}`);
    console.log(`Notifications: ${summary.totalNotifications}`);
    
    return { results, summary };
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
    checkEventsForUser,
    checkEventsForAllUsers,
    calculateDistance,
    getCoordinates,
    getVenueCoordinates
};