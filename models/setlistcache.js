const mongoose = require('mongoose');

const setlistCacheSchema = new mongoose.Schema({
  setlistId: {
    type: String,
    required: true,
    unique: true
  },
  artistMbid: {
    type: String,
    required: true,
    index: true
  },
  eventDate: {
    type: Date,
    required: true
  },
  data: {
    type: Object,
    required: true
  },
  cachedAt: {
    type: Date,
    default: Date.now
  },
  lastAccessedAt: {
    type: Date,
    default: Date.now
  },
  accessCount: {
    type: Number,
    default: 1
  }
});

// Static: get a cached setlist, updating access stats
setlistCacheSchema.statics.getCached = async function(setlistId) {
  const cached = await this.findOneAndUpdate(
    { setlistId },
    {
      $set: { lastAccessedAt: new Date() },
      $inc: { accessCount: 1 }
    },
    { new: true }
  );
  return cached ? cached.data : null;
};

// Static: cache a formatted setlist if event is 3+ days old
setlistCacheSchema.statics.cacheIfEligible = async function(formattedSetlist) {
  if (!formattedSetlist || !formattedSetlist.id || !formattedSetlist.eventDate) return;

  // Parse dd-MM-yyyy date format
  const parts = formattedSetlist.eventDate.split('-');
  if (parts.length !== 3) return;
  const eventDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
  if (isNaN(eventDate.getTime())) return;

  // Only cache if event is 3+ days old
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  if (eventDate > threeDaysAgo) return;

  const artistMbid = formattedSetlist.artist?.mbid || '';

  try {
    await this.findOneAndUpdate(
      { setlistId: formattedSetlist.id },
      {
        $set: {
          artistMbid,
          eventDate,
          data: formattedSetlist,
          lastAccessedAt: new Date()
        },
        $setOnInsert: {
          cachedAt: new Date(),
          accessCount: 1
        }
      },
      { upsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) {
      console.error('SetlistCache write error:', error.message);
    }
  }
};

// Static: cache multiple setlists in parallel
setlistCacheSchema.statics.cacheMany = async function(formattedSetlists) {
  const promises = formattedSetlists.map(s => this.cacheIfEligible(s));
  await Promise.allSettled(promises);
};

// Static: get cached setlists for an artist
setlistCacheSchema.statics.getArtistCache = async function(artistMbid, limit) {
  return this.find({ artistMbid })
    .sort({ eventDate: -1 })
    .limit(limit)
    .lean();
};

// Static: get cache stats
setlistCacheSchema.statics.getStats = async function() {
  const total = await this.countDocuments();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const addedToday = await this.countDocuments({ cachedAt: { $gte: today } });
  const accessedToday = await this.countDocuments({ lastAccessedAt: { $gte: today } });
  const topAccessed = await this.find()
    .sort({ accessCount: -1 })
    .limit(10)
    .select('setlistId artistMbid accessCount')
    .lean();

  return { total, addedToday, accessedToday, topAccessed };
};

module.exports = mongoose.model('SetlistCache', setlistCacheSchema);
