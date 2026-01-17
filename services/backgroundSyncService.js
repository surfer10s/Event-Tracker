// Background Sync Service
// Periodically syncs Ticketmaster events for all users' favorite artists and music taste artists

const User = require('../models/User');
const Artist = require('../models/Artist');
const Event = require('../models/Event');
const UserMusicTaste = require('../models/UserMusicTaste');
const ticketmasterService = require('./ticketmasterService');
const EventEmitter = require('events');

// Event emitter for progress updates
const syncEmitter = new EventEmitter();

// Track sync statistics
let syncStats = {
    lastRun: null,
    lastDuration: null,
    artistsChecked: 0,
    eventsFound: 0,
    eventsSaved: 0,
    errors: 0,
    isRunning: false,
    musicTasteArtistsSearched: 0,
    musicTasteArtistsFound: 0
};

// Current progress (for SSE)
let currentProgress = {
    isRunning: false,
    phase: 'idle', // 'idle', 'sync', 'notifications', 'complete'
    currentArtist: '',
    currentIndex: 0,
    totalArtists: 0,
    eventsFound: 0,
    eventsSaved: 0,
    errors: 0,
    startTime: null
};

// Emit progress update
function emitProgress(data) {
    currentProgress = { ...currentProgress, ...data };
    syncEmitter.emit('progress', currentProgress);
}

// Get progress emitter for SSE
function getProgressEmitter() {
    return syncEmitter;
}

// Get current progress
function getCurrentProgress() {
    return { ...currentProgress };
}

// Get all unique artists that need syncing (from favorites + music taste)
async function getArtistsToSync(options = {}) {
    const { includeMusicTaste = true, searchTicketmaster = false } = options;
    
    const artistIds = new Set();
    const artistNames = new Set();
    const artistsToSync = [];
    
    // Get all favorite artists from all users
    const users = await User.find({ 
        favoriteArtists: { $exists: true, $ne: [] } 
    }).populate('favoriteArtists', 'name externalIds');
    
    for (const user of users) {
        for (const artist of user.favoriteArtists || []) {
            if (artist && artist.externalIds?.ticketmaster && !artistIds.has(artist._id.toString())) {
                artistIds.add(artist._id.toString());
                artistNames.add(artist.name.toLowerCase());
                artistsToSync.push({
                    _id: artist._id,
                    name: artist.name,
                    ticketmasterId: artist.externalIds.ticketmaster,
                    source: 'favorite'
                });
            }
        }
    }
    
    if (!includeMusicTaste) {
        return artistsToSync;
    }
    
    // Get unique artists from music taste that aren't already in favorites
    const musicTasteRecords = await UserMusicTaste.find({});
    const musicTasteArtistNames = new Set();
    
    for (const record of musicTasteRecords) {
        for (const tasteArtist of record.artists || []) {
            const nameLower = tasteArtist.name.toLowerCase();
            // Skip if already a favorite or already processed
            if (artistNames.has(nameLower) || musicTasteArtistNames.has(nameLower)) continue;
            musicTasteArtistNames.add(nameLower);
            
            // Try to find this artist in our database first
            const dbArtist = await Artist.findOne({
                name: { $regex: new RegExp(`^${escapeRegex(tasteArtist.name)}$`, 'i') }
            });
            
            if (dbArtist && dbArtist.externalIds?.ticketmaster && !artistIds.has(dbArtist._id.toString())) {
                artistIds.add(dbArtist._id.toString());
                artistsToSync.push({
                    _id: dbArtist._id,
                    name: dbArtist.name,
                    ticketmasterId: dbArtist.externalIds.ticketmaster,
                    source: 'music_taste'
                });
            } else if (!dbArtist) {
                // Artist not in database - mark for Ticketmaster search
                artistsToSync.push({
                    _id: null,
                    name: tasteArtist.name,
                    ticketmasterId: null,
                    source: 'music_taste',
                    needsSearch: true
                });
            }
        }
    }
    
    return artistsToSync;
}

// Sync events for a single artist
async function syncArtistEvents(artist, options = {}) {
    const { verbose = false } = options;
    
    try {
        // If artist needs Ticketmaster search (music taste artist not in DB)
        if (artist.needsSearch && !artist.ticketmasterId) {
            if (verbose) console.log(`  Searching Ticketmaster for: ${artist.name}`);
            
            // Search for artist on Ticketmaster
            const searchResult = await ticketmasterService.searchArtists(artist.name);
            
            if (!searchResult.success || !searchResult.artists?.length) {
                if (verbose) console.log(`    ⚠ Not found on Ticketmaster`);
                return { success: true, found: 0, saved: 0, notFound: true };
            }
            
            // Find best match (exact or close match)
            const exactMatch = searchResult.artists.find(
                a => a.name.toLowerCase() === artist.name.toLowerCase()
            );
            const bestMatch = exactMatch || searchResult.artists[0];
            
            // Check if name is close enough (to avoid false matches)
            const similarity = getStringSimilarity(artist.name.toLowerCase(), bestMatch.name.toLowerCase());
            if (similarity < 0.7) {
                if (verbose) console.log(`    ⚠ No good match (best: "${bestMatch.name}" at ${Math.round(similarity * 100)}%)`);
                return { success: true, found: 0, saved: 0, noMatch: true };
            }
            
            // Use externalId from your existing service
            const ticketmasterId = bestMatch.externalId || bestMatch.id;
            
            if (verbose) console.log(`    ✓ Found: ${bestMatch.name} (${ticketmasterId})`);
            
            // Create or update artist in database
            let dbArtist = await Artist.findOne({
                'externalIds.ticketmaster': ticketmasterId
            });
            
            if (!dbArtist) {
                dbArtist = await Artist.create({
                    name: bestMatch.name,
                    externalIds: { ticketmaster: ticketmasterId },
                    images: {
                        large: bestMatch.images?.[0]?.url
                    },
                    genre: bestMatch.genre ? [bestMatch.genre] : [],
                    tourStatus: 'unknown'
                });
                if (verbose) console.log(`    ✓ Created artist: ${dbArtist.name}`);
            }
            
            // Update artist object with found data
            artist._id = dbArtist._id;
            artist.ticketmasterId = ticketmasterId;
        }
        
        if (!artist.ticketmasterId) {
            if (verbose) console.log(`    ⚠ No Ticketmaster ID for ${artist.name}`);
            return { success: true, found: 0, saved: 0 };
        }
        
        if (verbose) console.log(`  Syncing: ${artist.name} (${artist.ticketmasterId})`);
        
        // Fetch events from Ticketmaster
        const result = await ticketmasterService.getArtistUpcomingEvents(artist.ticketmasterId);
        
        if (!result.success || !result.events?.length) {
            if (verbose) console.log(`    ⚠ No events found for ${artist.name}`);
            return { success: true, found: 0, saved: 0 };
        }
        
        const events = result.events || [];
        let savedCount = 0;
        let updatedCount = 0;
        
        for (const eventData of events) {
            try {
                // Save or update event using your existing service
                // saveEventToDatabase handles both create and update
                const saveResult = await ticketmasterService.saveEventToDatabase(eventData);
                if (saveResult?.success) {
                    if (saveResult.created) {
                        savedCount++;
                    } else {
                        updatedCount++;
                    }
                }
            } catch (err) {
                // Skip individual event errors
                if (verbose) console.log(`    Error saving event: ${err.message}`);
            }
        }
        
        if (verbose) console.log(`    ✓ ${artist.name}: ${events.length} found, ${savedCount} new, ${updatedCount} updated`);
        
        return { success: true, found: events.length, saved: savedCount, updated: updatedCount };
        
    } catch (err) {
        console.error(`  ✗ Error syncing ${artist.name}:`, err.message);
        return { success: false, error: err.message };
    }
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

// Main sync function - syncs all artists
async function runFullSync(options = {}) {
    const { verbose = true, delayMs = 250, maxMusicTasteArtists = 100 } = options;
    
    if (syncStats.isRunning) {
        console.log('Sync already in progress, skipping...');
        return { success: false, error: 'Sync already running' };
    }
    
    syncStats.isRunning = true;
    const startTime = Date.now();
    
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   BACKGROUND SYNC STARTED              ║');
    console.log(`║   Time: ${new Date().toLocaleString()}      ║`);
    console.log('╚════════════════════════════════════════╝\n');
    
    try {
        // Get all artists to sync
        const allArtists = await getArtistsToSync();
        
        // Separate favorites from music taste artists that need search
        const favorites = allArtists.filter(a => a.source === 'favorite');
        const musicTasteKnown = allArtists.filter(a => a.source === 'music_taste' && !a.needsSearch);
        const musicTasteUnknown = allArtists.filter(a => a.source === 'music_taste' && a.needsSearch);
        
        console.log(`Artists to sync:`);
        console.log(`  - Favorites: ${favorites.length}`);
        console.log(`  - Music Taste (known): ${musicTasteKnown.length}`);
        console.log(`  - Music Taste (need search): ${musicTasteUnknown.length}`);
        
        // Limit music taste searches to avoid burning API quota
        const musicTasteToSearch = musicTasteUnknown.slice(0, maxMusicTasteArtists);
        if (musicTasteUnknown.length > maxMusicTasteArtists) {
            console.log(`  ⚠ Limiting music taste search to ${maxMusicTasteArtists} artists (${musicTasteUnknown.length - maxMusicTasteArtists} skipped)`);
        }
        
        const artists = [...favorites, ...musicTasteKnown, ...musicTasteToSearch];
        console.log(`\nTotal to process: ${artists.length}\n`);
        
        if (artists.length === 0) {
            syncStats.isRunning = false;
            emitProgress({ isRunning: false });
            return { success: true, message: 'No artists to sync' };
        }
        
        let totalFound = 0;
        let totalSaved = 0;
        let errors = 0;
        let musicTasteSearched = 0;
        let musicTasteFoundOnTM = 0;
        
        // Initialize progress tracking
        emitProgress({
            isRunning: true,
            phase: 'sync',
            currentArtist: '',
            currentIndex: 0,
            totalArtists: artists.length,
            eventsFound: 0,
            eventsSaved: 0,
            errors: 0,
            startTime: Date.now()
        });
        
        // Process artists with delay to respect rate limits
        for (let i = 0; i < artists.length; i++) {
            const artist = artists[i];
            
            // Emit progress update
            emitProgress({
                currentArtist: artist.name,
                currentIndex: i + 1,
                eventsFound: totalFound,
                eventsSaved: totalSaved,
                errors
            });
            
            if (verbose) {
                const sourceTag = artist.source === 'favorite' ? '⭐' : '🎧';
                const searchTag = artist.needsSearch ? ' (searching...)' : '';
                console.log(`[${i + 1}/${artists.length}] ${sourceTag} ${artist.name}${searchTag}`);
            }
            
            // Track music taste searches
            if (artist.needsSearch) {
                musicTasteSearched++;
            }
            
            const result = await syncArtistEvents(artist, { verbose });
            
            if (result.success) {
                totalFound += result.found || 0;
                totalSaved += result.saved || 0;
                
                // Track if we found a music taste artist on Ticketmaster
                if (artist.needsSearch && !result.notFound && !result.noMatch) {
                    musicTasteFoundOnTM++;
                }
            } else {
                errors++;
            }
            
            // Longer delay for searches (use more quota), shorter for known artists
            const delay = artist.needsSearch ? delayMs * 2 : delayMs;
            if (i < artists.length - 1 && delay > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        const duration = Date.now() - startTime;
        
        // Emit final progress for sync phase
        // Note: isRunning stays true if called from pipeline (will be set false by pipeline completion)
        emitProgress({
            isRunning: false,
            phase: 'sync_complete',
            currentIndex: artists.length,
            eventsFound: totalFound,
            eventsSaved: totalSaved,
            errors
        });
        
        // Update stats
        syncStats = {
            lastRun: new Date(),
            lastDuration: duration,
            artistsChecked: artists.length,
            eventsFound: totalFound,
            eventsSaved: totalSaved,
            errors,
            isRunning: false,
            musicTasteArtistsSearched: musicTasteSearched,
            musicTasteArtistsFound: musicTasteFoundOnTM
        };
        
        console.log('\n╔════════════════════════════════════════╗');
        console.log('║   BACKGROUND SYNC COMPLETE             ║');
        console.log('╠════════════════════════════════════════╣');
        console.log(`║   Artists checked: ${artists.length.toString().padEnd(18)}║`);
        console.log(`║   Events found: ${totalFound.toString().padEnd(21)}║`);
        console.log(`║   New events saved: ${totalSaved.toString().padEnd(17)}║`);
        console.log(`║   Music taste searched: ${musicTasteSearched.toString().padEnd(13)}║`);
        console.log(`║   Music taste found: ${musicTasteFoundOnTM.toString().padEnd(16)}║`);
        console.log(`║   Errors: ${errors.toString().padEnd(27)}║`);
        console.log(`║   Duration: ${(duration / 1000).toFixed(1)}s${' '.repeat(22)}║`);
        console.log('╚════════════════════════════════════════╝\n');
        
        return {
            success: true,
            artistsChecked: artists.length,
            eventsFound: totalFound,
            eventsSaved: totalSaved,
            musicTasteSearched,
            musicTasteFoundOnTM,
            errors,
            duration
        };
        
    } catch (err) {
        console.error('Sync failed:', err);
        syncStats.isRunning = false;
        syncStats.errors++;
        return { success: false, error: err.message };
    }
}

// Sync events for a specific user's artists only
async function syncUserArtists(userId, options = {}) {
    const { verbose = true } = options;
    
    console.log(`\nSyncing artists for user: ${userId}`);
    
    const user = await User.findById(userId).populate('favoriteArtists', 'name externalIds');
    
    if (!user) {
        return { success: false, error: 'User not found' };
    }
    
    const artists = [];
    
    // Add favorite artists
    for (const artist of user.favoriteArtists || []) {
        if (artist?.externalIds?.ticketmaster) {
            artists.push({
                _id: artist._id,
                name: artist.name,
                ticketmasterId: artist.externalIds.ticketmaster
            });
        }
    }
    
    // Add music taste artists
    const musicTaste = await UserMusicTaste.findOne({ userId });
    if (musicTaste) {
        for (const tasteArtist of musicTaste.artists || []) {
            const dbArtist = await Artist.findOne({
                name: { $regex: new RegExp(`^${escapeRegex(tasteArtist.name)}$`, 'i') }
            });
            
            if (dbArtist?.externalIds?.ticketmaster) {
                const alreadyAdded = artists.some(a => a._id.toString() === dbArtist._id.toString());
                if (!alreadyAdded) {
                    artists.push({
                        _id: dbArtist._id,
                        name: dbArtist.name,
                        ticketmasterId: dbArtist.externalIds.ticketmaster
                    });
                }
            }
        }
    }
    
    console.log(`Found ${artists.length} artists for user ${user.username}`);
    
    if (artists.length === 0) {
        emitProgress({ isRunning: false });
        return { success: true, artistsChecked: 0, eventsFound: 0, eventsSaved: 0 };
    }
    
    let totalFound = 0;
    let totalSaved = 0;
    let errors = 0;
    
    // Initialize progress tracking
    emitProgress({
        isRunning: true,
        phase: 'sync',
        currentArtist: '',
        currentIndex: 0,
        totalArtists: artists.length,
        eventsFound: 0,
        eventsSaved: 0,
        errors: 0,
        startTime: Date.now()
    });
    
    for (let i = 0; i < artists.length; i++) {
        const artist = artists[i];
        
        // Emit progress update
        emitProgress({
            currentArtist: artist.name,
            currentIndex: i + 1,
            eventsFound: totalFound,
            eventsSaved: totalSaved,
            errors
        });
        
        const result = await syncArtistEvents(artist, { verbose });
        if (result.success) {
            totalFound += result.found || 0;
            totalSaved += result.saved || 0;
        } else {
            errors++;
        }
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Emit final progress
    emitProgress({
        isRunning: false,
        phase: 'sync_complete',
        currentIndex: artists.length,
        eventsFound: totalFound,
        eventsSaved: totalSaved,
        errors
    });
    
    return {
        success: true,
        artistsChecked: artists.length,
        eventsFound: totalFound,
        eventsSaved: totalSaved
    };
}

// Get current sync stats
function getSyncStats() {
    return { ...syncStats };
}

// Helper to escape regex special characters
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Clean up old events (optional maintenance task)
async function cleanupOldEvents(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const result = await Event.deleteMany({
        date: { $lt: cutoffDate }
    });
    
    console.log(`Cleaned up ${result.deletedCount} events older than ${daysOld} days`);
    
    return { deletedCount: result.deletedCount };
}

module.exports = {
    runFullSync,
    syncUserArtists,
    syncArtistEvents,
    getArtistsToSync,
    getSyncStats,
    cleanupOldEvents,
    getProgressEmitter,
    getCurrentProgress
};