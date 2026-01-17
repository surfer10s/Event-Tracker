// Geocoding Service - Google Maps Geocoding API
// Converts addresses to latitude/longitude coordinates

const GOOGLE_GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

/**
 * Geocode an address using Google Maps API
 * @param {Object} address - Address components
 * @param {string} address.street - Street address (optional)
 * @param {string} address.city - City name
 * @param {string} address.state - State code (e.g., 'CA')
 * @param {string} address.zipcode - ZIP code (optional but recommended)
 * @returns {Object} - { success, lat, lng, formattedAddress, geocodedFrom }
 */
async function geocodeAddress({ street, city, state, zipcode }) {
    if (!process.env.GOOGLE_GEOCODING_API_KEY) {
        console.error('GOOGLE_GEOCODING_API_KEY not set in environment');
        return { success: false, error: 'Geocoding API key not configured' };
    }

    // Build address string - prioritize more specific addresses
    let addressString = '';
    let geocodedFrom = '';

    if (street && city && state) {
        // Full address - most accurate
        addressString = `${street}, ${city}, ${state}`;
        if (zipcode) addressString += ` ${zipcode}`;
        geocodedFrom = 'address';
    } else if (zipcode) {
        // ZIP code only - still pretty accurate for US
        addressString = zipcode;
        geocodedFrom = 'zipcode';
    } else if (city && state) {
        // City/state - least accurate, will return city center
        addressString = `${city}, ${state}`;
        geocodedFrom = 'city';
    } else {
        return { success: false, error: 'Insufficient address information' };
    }

    try {
        const url = `${GOOGLE_GEOCODING_URL}?address=${encodeURIComponent(addressString)}&key=${process.env.GOOGLE_GEOCODING_API_KEY}`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'OK' && data.results && data.results.length > 0) {
            const result = data.results[0];
            const location = result.geometry.location;

            return {
                success: true,
                lat: location.lat,
                lng: location.lng,
                formattedAddress: result.formatted_address,
                geocodedFrom,
                placeId: result.place_id
            };
        } else if (data.status === 'ZERO_RESULTS') {
            return { success: false, error: 'Address not found' };
        } else if (data.status === 'REQUEST_DENIED') {
            console.error('Google Geocoding API request denied:', data.error_message);
            return { success: false, error: 'API request denied - check API key' };
        } else if (data.status === 'OVER_QUERY_LIMIT') {
            console.error('Google Geocoding API quota exceeded');
            return { success: false, error: 'API quota exceeded' };
        } else {
            console.error('Google Geocoding API error:', data.status, data.error_message);
            return { success: false, error: data.error_message || data.status };
        }
    } catch (error) {
        console.error('Geocoding request failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Geocode and update a user's coordinates
 * @param {Object} user - Mongoose User document
 * @returns {Object} - { success, coordinates }
 */
async function geocodeUser(user) {
    const result = await geocodeAddress({
        street: user.streetAddress,
        city: user.city,
        state: user.state,
        zipcode: user.zipcode
    });

    if (result.success) {
        user.coordinates = {
            lat: result.lat,
            lng: result.lng,
            geocodedAt: new Date(),
            geocodedFrom: result.geocodedFrom
        };
        
        await user.save();
        
        console.log(`Geocoded user ${user.username}: ${result.lat}, ${result.lng} (from ${result.geocodedFrom})`);
        
        return {
            success: true,
            coordinates: user.coordinates,
            formattedAddress: result.formattedAddress
        };
    }

    return result;
}

/**
 * Batch geocode multiple users (for nightly jobs or migration)
 * @param {Array} users - Array of User documents
 * @param {Object} options - { delayMs: delay between requests to avoid rate limits }
 * @returns {Object} - { processed, success, failed, errors }
 */
async function batchGeocodeUsers(users, options = {}) {
    const { delayMs = 100 } = options; // 100ms delay = 10 requests/second (well under Google's limit)
    
    const results = {
        processed: 0,
        success: 0,
        failed: 0,
        skipped: 0,
        errors: []
    };

    for (const user of users) {
        // Skip users who already have coordinates
        if (user.coordinates?.lat && user.coordinates?.lng) {
            results.skipped++;
            continue;
        }

        // Skip users without any location info
        if (!user.city && !user.state && !user.zipcode) {
            results.skipped++;
            continue;
        }

        try {
            const result = await geocodeUser(user);
            results.processed++;

            if (result.success) {
                results.success++;
            } else {
                results.failed++;
                results.errors.push({
                    userId: user._id,
                    username: user.username,
                    error: result.error
                });
            }

            // Delay to respect rate limits
            if (delayMs > 0) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        } catch (error) {
            results.failed++;
            results.errors.push({
                userId: user._id,
                username: user.username,
                error: error.message
            });
        }
    }

    return results;
}

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} - Distance in miles
 */
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

module.exports = {
    geocodeAddress,
    geocodeUser,
    batchGeocodeUsers,
    calculateDistance
};