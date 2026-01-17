// Artist Cache Service
// Caches artists from UserMusicTaste by searching Ticketmaster
// Designed to run as a nightly job

const Artist = require('../models/Artist');
const UserMusicTaste = require('../models/UserMusicTaste');
const ticketmasterService = require('./ticketmasterService');

// Track cache job statistics
let cacheStats = {
    lastRun: null,
    lastDuration: null,
    artistsProcessed: 0,
    artistsFound: 0,
    artistsNotFound: 0,
    artistsAlreadyCached: 0,
    errors: 0,
    isRunning: false
};

// Get all unique artist names from UserMusicTaste that aren't already in Artist collection
async function getUncachedArtists() {
    // Get all unique artist names from music taste
    const musicTasteRecords = await UserMusicTaste.find({});
    const artistNames = new Map(); // name -> { sources, count }
    
    for (const record of musicTasteRecords) {
        for (const artist of record.artists || []) {
            const nameLower = artist.name.toLowerCase().trim();
            if (artistNames.has(nameLower)) {
                const existing = artistNames.get(nameLower);
                existing.count++;
                artist.sources?.forEach(s => existing.sources.add(s));
            } else {
                artistNames.set(nameLower, {
                    name: artist.name, // Keep original casing
                    sources: new Set(artist.sources || []),
                    count: 1
                });
            }
        }
    }
    
    console.log(`Found ${artistNames.size} unique artists in music taste`);
    
    // Check which ones are already cached
    const uncached = [];
    
    for (const [nameLower, data] of artistNames) {
        // Check if artist exists in database (by name, case-insensitive)
        const existing = await Artist.findOne({
            name: { $regex: new RegExp(`^${escapeRegex(data.name)}$`, 'i') }
        });
        
        if (!existing) {
            uncached.push({
                name: data.name,
                sources: Array.from(data.sources),
                userCount: data.count
            });
        }
    }
    
    // Sort by user count (most popular first)
    uncached.sort((a, b) => b.userCount - a.userCount);
    
    console.log(`${uncached.length} artists need to be cached`);
    
    return uncached;
}

// Search Ticketmaster and cache a single artist
async function cacheArtist(artistName, options = {}) {
    const { verbose = false } = options;
    
    try {
        // Search Ticketmaster
        const searchResult = await ticketmasterService.searchArtists(artistName);
        
        if (!searchResult.success || !searchResult.artists?.length) {
            if (verbose) console.log(`  ✗ Not found: ${artistName}`);
            return { success: false, notFound: true };
        }
        
        // Find best match
        const exactMatch = searchResult.artists.find(
            a => a.name.toLowerCase() === artistName.toLowerCase()
        );
        const bestMatch = exactMatch || searchResult.artists[0];
        
        // Check similarity to avoid false matches
        const similarity = getStringSimilarity(artistName.toLowerCase(), bestMatch.name.toLowerCase());
        if (similarity < 0.6) {
            if (verbose) console.log(`  ✗ No good match for "${artistName}" (best: "${bestMatch.name}" at ${Math.round(similarity * 100)}%)`);
            return { success: false, noMatch: true };
        }
        
        // Get Ticketmaster ID
        const ticketmasterId = bestMatch.externalId || bestMatch.id;
        
        // Check if already exists by Ticketmaster ID
        let artist = await Artist.findOne({
            'externalIds.ticketmaster': ticketmasterId
        });
        
        if (artist) {
            if (verbose) console.log(`  ○ Already cached: ${bestMatch.name}`);
            return { success: true, alreadyCached: true, artist };
        }
        
        // Create new artist
        artist = await Artist.create({
            name: bestMatch.name,
            externalIds: { ticketmaster: ticketmasterId },
            images: {
                thumbnail: bestMatch.images?.find(i => i.width < 500)?.url,
                medium: bestMatch.images?.find(i => i.width >= 500 && i.width < 1000)?.url,
                large: bestMatch.images?.[0]?.url
            },
            genre: bestMatch.genre ? [bestMatch.genre] : [],
            tourStatus: 'unknown',
            lastUpdated: new Date()
        });
        
        if (verbose) console.log(`  ✓ Cached: ${bestMatch.name} (${ticketmasterId})`);
        
        return { success: true, artist, isNew: true };
        
    } catch (err) {
        console.error(`  ✗ Error caching ${artistName}:`, err.message);
        return { success: false, error: err.message };
    }
}

// Main cache job - caches all uncached music taste artists
async function runCacheJob(options = {}) {
    const { 
        verbose = true, 
        delayMs = 250,  // Delay between API calls
        maxArtists = 500,  // Max artists per run (to stay within rate limits)
        dryRun = false 
    } = options;
    
    if (cacheStats.isRunning) {
        console.log('Cache job already in progress, skipping...');
        return { success: false, error: 'Job already running' };
    }
    
    cacheStats.isRunning = true;
    const startTime = Date.now();
    
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   ARTIST CACHE JOB STARTED             ║');
    console.log(`║   Time: ${new Date().toLocaleString()}      ║`);
    console.log(`║   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}                          ║`);
    console.log('╚════════════════════════════════════════╝\n');
    
    try {
        // Get uncached artists
        const uncachedArtists = await getUncachedArtists();
        
        if (uncachedArtists.length === 0) {
            console.log('All music taste artists are already cached!');
            cacheStats.isRunning = false;
            return { success: true, message: 'All artists already cached' };
        }
        
        // Limit to maxArtists
        const artistsToProcess = uncachedArtists.slice(0, maxArtists);
        
        if (uncachedArtists.length > maxArtists) {
            console.log(`Processing ${maxArtists} of ${uncachedArtists.length} uncached artists\n`);
        }
        
        let found = 0;
        let notFound = 0;
        let alreadyCached = 0;
        let errors = 0;
        const notFoundList = [];
        
        // Process artists
        for (let i = 0; i < artistsToProcess.length; i++) {
            const artist = artistsToProcess[i];
            
            if (verbose) {
                console.log(`[${i + 1}/${artistsToProcess.length}] ${artist.name}`);
            }
            
            if (!dryRun) {
                const result = await cacheArtist(artist.name, { verbose });
                
                if (result.success) {
                    if (result.alreadyCached) {
                        alreadyCached++;
                    } else {
                        found++;
                    }
                } else if (result.notFound || result.noMatch) {
                    notFound++;
                    notFoundList.push(artist.name);
                } else {
                    errors++;
                }
                
                // Rate limiting delay
                if (i < artistsToProcess.length - 1 && delayMs > 0) {
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
        }
        
        const duration = Date.now() - startTime;
        
        // Update stats
        cacheStats = {
            lastRun: new Date(),
            lastDuration: duration,
            artistsProcessed: artistsToProcess.length,
            artistsFound: found,
            artistsNotFound: notFound,
            artistsAlreadyCached: alreadyCached,
            errors,
            isRunning: false
        };
        
        console.log('\n╔════════════════════════════════════════╗');
        console.log('║   ARTIST CACHE JOB COMPLETE            ║');
        console.log('╠════════════════════════════════════════╣');
        console.log(`║   Processed: ${artistsToProcess.length.toString().padEnd(24)}║`);
        console.log(`║   New cached: ${found.toString().padEnd(23)}║`);
        console.log(`║   Already cached: ${alreadyCached.toString().padEnd(19)}║`);
        console.log(`║   Not found: ${notFound.toString().padEnd(24)}║`);
        console.log(`║   Errors: ${errors.toString().padEnd(27)}║`);
        console.log(`║   Duration: ${(duration / 1000).toFixed(1)}s${' '.repeat(22)}║`);
        console.log('╚════════════════════════════════════════╝\n');
        
        // Log not found artists for review
        if (notFoundList.length > 0 && verbose) {
            console.log('Artists not found on Ticketmaster:');
            notFoundList.slice(0, 20).forEach(name => console.log(`  - ${name}`));
            if (notFoundList.length > 20) {
                console.log(`  ... and ${notFoundList.length - 20} more`);
            }
        }
        
        return {
            success: true,
            processed: artistsToProcess.length,
            found,
            notFound,
            alreadyCached,
            errors,
            duration,
            notFoundList
        };
        
    } catch (err) {
        console.error('Cache job failed:', err);
        cacheStats.isRunning = false;
        cacheStats.errors++;
        return { success: false, error: err.message };
    }
}

// Get current cache stats
function getCacheStats() {
    return { ...cacheStats };
}

// Get cache coverage - how many music taste artists are cached
async function getCacheCoverage() {
    const musicTasteRecords = await UserMusicTaste.find({});
    const artistNames = new Set();
    
    for (const record of musicTasteRecords) {
        for (const artist of record.artists || []) {
            artistNames.add(artist.name.toLowerCase().trim());
        }
    }
    
    let cached = 0;
    let uncached = 0;
    
    for (const name of artistNames) {
        const existing = await Artist.findOne({
            name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') }
        });
        if (existing) {
            cached++;
        } else {
            uncached++;
        }
    }
    
    return {
        total: artistNames.size,
        cached,
        uncached,
        percentage: artistNames.size > 0 ? Math.round((cached / artistNames.size) * 100) : 0
    };
}

// Helper to escape regex special characters
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Simple string similarity (Dice coefficient)
function getStringSimilarity(str1, str2) {
    if (str1 === str2) return 1;
    if (str1.length < 2 || str2.length < 2) return 0;
    
    const bigrams1 = new Set();
    for (let i = 0; i < str1.length - 1; i++) {
        bigrams1.add(str1.substring(i, i + 2));
    }
    
    let matches = 0;
    for (let i = 0; i < str2.length - 1; i++) {
        if (bigrams1.has(str2.substring(i, i + 2))) {
            matches++;
        }
    }
    
    return (2 * matches) / (str1.length + str2.length - 2);
}

module.exports = {
    runCacheJob,
    cacheArtist,
    getUncachedArtists,
    getCacheStats,
    getCacheCoverage
};
