// Venue Photo Service
// Fetches real venue photos from Wikipedia, Wikimedia Commons, and Google Places
const axios = require('axios');
const apiTracker = require('./apiusagetracker');

const wikiAxios = apiTracker.createTrackedAxios('wikipedia', axios);
const googleAxios = apiTracker.createTrackedAxios('google_places', axios);

// Wikipedia/Wikimedia APIs require a User-Agent header or they return 403
const WIKI_HEADERS = {
  'User-Agent': 'EventTrackerBot/1.0 (venue photo enrichment)'
};

/**
 * Fetch a real venue photo using a 3-step fallback chain:
 * 1. Wikipedia pageimages API (free, curated article images)
 * 2. Wikimedia Commons search (free, broader coverage)
 * 3. Google Places Photos API (paid, excellent coverage)
 *
 * @param {string} name - Venue name
 * @param {string} city - City
 * @param {string} state - State abbreviation
 * @returns {Object|null} { url, width, height, source, attribution } or null
 */
async function fetchVenuePhoto(name, city, state) {
  // Step 1: Wikipedia pageimages
  try {
    const result = await tryWikipediaPageImage(name, city);
    if (result) return result;
  } catch (err) {
    console.error('[VenuePhoto] Wikipedia pageimages error:', err.message);
  }

  // Step 2: Wikimedia Commons search
  try {
    const result = await tryWikimediaCommons(name, city);
    if (result) return result;
  } catch (err) {
    console.error('[VenuePhoto] Wikimedia Commons error:', err.message);
  }

  // Step 3: Google Places Photos API
  try {
    const result = await tryGooglePlacesPhoto(name, city, state);
    if (result) return result;
  } catch (err) {
    console.error('[VenuePhoto] Google Places error:', err.message);
  }

  return null;
}

/**
 * Step 1: Wikipedia pageimages API
 * Tries exact venue name first, then "{name} ({city})" for disambiguation
 */
async function tryWikipediaPageImage(name, city) {
  const titles = [name, `${name} (${city})`];

  for (const title of titles) {
    const url = 'https://en.wikipedia.org/w/api.php';
    const res = await wikiAxios.get(url, {
      params: {
        action: 'query',
        titles: title,
        prop: 'pageimages',
        piprop: 'original',
        redirects: 1,
        format: 'json'
      },
      headers: WIKI_HEADERS,
      timeout: 8000
    });

    const pages = res.data?.query?.pages;
    if (!pages) continue;

    for (const pageId of Object.keys(pages)) {
      if (pageId === '-1') continue;
      const page = pages[pageId];
      const img = page.original;
      if (!img || !img.source) continue;

      // Filter: width >= 800, prefer JPEG
      if (img.width < 800) continue;
      const srcLower = img.source.toLowerCase();
      if (srcLower.endsWith('.svg') || srcLower.endsWith('.gif')) continue;

      return {
        url: img.source,
        width: img.width,
        height: img.height,
        source: 'wikimedia',
        attribution: {
          license: 'CC BY-SA 4.0',
          sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`
        }
      };
    }
  }

  return null;
}

/**
 * Step 2: Wikimedia Commons search
 * Searches for venue photos, filters by size/format
 */
async function tryWikimediaCommons(name, city) {
  const searchUrl = 'https://commons.wikimedia.org/w/api.php';
  const searchRes = await wikiAxios.get(searchUrl, {
    params: {
      action: 'query',
      list: 'search',
      srsearch: `${name} ${city}`,
      srnamespace: 6, // File namespace
      srlimit: 5,
      format: 'json'
    },
    headers: WIKI_HEADERS,
    timeout: 8000
  });

  const results = searchRes.data?.query?.search;
  if (!results || results.length === 0) return null;

  // Get image info for each result
  const fileTitles = results.map(r => r.title).join('|');
  const infoRes = await wikiAxios.get(searchUrl, {
    params: {
      action: 'query',
      titles: fileTitles,
      prop: 'imageinfo',
      iiprop: 'url|size|mime',
      format: 'json'
    },
    headers: WIKI_HEADERS,
    timeout: 8000
  });

  const pages = infoRes.data?.query?.pages;
  if (!pages) return null;

  for (const pageId of Object.keys(pages)) {
    if (pageId === '-1') continue;
    const page = pages[pageId];
    const info = page.imageinfo?.[0];
    if (!info) continue;

    // Filter: width >= 800, JPEG preferred, skip SVG/small PNGs
    if (info.width < 800) continue;
    const mime = info.mime || '';
    if (mime === 'image/svg+xml' || mime === 'image/gif') continue;

    return {
      url: info.url,
      width: info.width,
      height: info.height,
      source: 'wikimedia',
      attribution: {
        license: 'CC BY-SA 4.0',
        sourceUrl: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`
      }
    };
  }

  return null;
}

/**
 * Step 3: Google Places Photos API (New)
 * Uses Place Search + Photo Media to get a high-quality venue photo
 */
async function tryGooglePlacesPhoto(name, city, state) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_GEOCODING_API_KEY;
  if (!apiKey) return null;

  // Search for the place
  const searchRes = await googleAxios.post(
    'https://places.googleapis.com/v1/places:searchText',
    { textQuery: `${name}, ${city}, ${state}` },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.photos,places.displayName'
      },
      timeout: 8000
    }
  );

  const place = searchRes.data?.places?.[0];
  if (!place?.photos?.length) return null;

  const photo = place.photos[0];
  const photoName = photo.name; // e.g. "places/xxx/photos/yyy"

  // Get the actual photo URL
  const mediaRes = await googleAxios.get(
    `https://places.googleapis.com/v1/${photoName}/media`,
    {
      params: {
        maxWidthPx: 1200,
        skipHttpRedirect: true
      },
      headers: {
        'X-Goog-Api-Key': apiKey
      },
      timeout: 8000
    }
  );

  const photoUri = mediaRes.data?.photoUri;
  if (!photoUri) return null;

  // Build attribution from photo authors
  const author = photo.authorAttributions?.[0];

  return {
    url: photoUri,
    width: 1200,
    height: null,
    source: 'google_places',
    attribution: {
      authorName: author?.displayName || null,
      authorUri: author?.uri || null,
      sourceUrl: author?.uri || null
    }
  };
}

module.exports = { fetchVenuePhoto };
