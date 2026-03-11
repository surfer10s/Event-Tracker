// Geocoding Service - Google Geocoding API wrapper for user addresses

const GOOGLE_GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

/**
 * Geocode a user address to lat/lng coordinates.
 * @param {Object} address - { street, city, state, zipcode }
 * @returns {Object} { success, lat, lng, geocodedFrom, error }
 */
async function geocodeAddress({ street, city, state, zipcode }) {
  const apiKey = process.env.GOOGLE_GEOCODING_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'GOOGLE_GEOCODING_API_KEY not set' };
  }

  // Build address string, preferring most specific info available
  const parts = [];
  if (street) parts.push(street);
  if (city) parts.push(city);
  if (state) parts.push(state);
  if (zipcode) parts.push(zipcode);

  if (parts.length === 0) {
    return { success: false, error: 'No address components provided' };
  }

  const query = parts.join(', ');
  const geocodedFrom = street ? 'full_address' : zipcode ? 'zipcode' : 'city_state';

  try {
    const url = `${GOOGLE_GEOCODING_URL}?address=${encodeURIComponent(query)}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === 'OK' && data.results?.length > 0) {
      const loc = data.results[0].geometry.location;
      return {
        success: true,
        lat: loc.lat,
        lng: loc.lng,
        geocodedFrom
      };
    }

    return { success: false, error: `Geocoding failed: ${data.status}` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { geocodeAddress };
