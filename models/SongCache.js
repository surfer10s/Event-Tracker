const mongoose = require('mongoose');

const songCacheSchema = new mongoose.Schema({
  // Search key - normalized for consistent lookups
  artistNormalized: {
    type: String,
    required: true,
    index: true
  },
  titleNormalized: {
    type: String,
    required: true,
    index: true
  },
  
  // Original values (for display)
  artist: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  
  // YouTube data
  videoId: {
    type: String,
    required: true
  },
  videoTitle: {
    type: String
  },
  channelTitle: {
    type: String
  },
  thumbnailUrl: {
    type: String
  },
  
  // Metadata
  searchQuery: {
    type: String
  },
  
  // Stats
  useCount: {
    type: Number,
    default: 1
  },
  lastUsedAt: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for fast lookups
songCacheSchema.index({ artistNormalized: 1, titleNormalized: 1 }, { unique: true });

// Static method to normalize strings for consistent matching
songCacheSchema.statics.normalize = function(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ');    // Normalize whitespace
};

// Static method to find cached video
songCacheSchema.statics.findVideo = async function(artist, title) {
  const artistNorm = this.normalize(artist);
  const titleNorm = this.normalize(title);
  
  const cached = await this.findOneAndUpdate(
    { artistNormalized: artistNorm, titleNormalized: titleNorm },
    { 
      $inc: { useCount: 1 },
      $set: { lastUsedAt: new Date() }
    },
    { new: true }
  );
  
  return cached;
};

// Static method to cache a video
songCacheSchema.statics.cacheVideo = async function(artist, title, videoData) {
  const artistNorm = this.normalize(artist);
  const titleNorm = this.normalize(title);
  
  try {
    const cached = await this.findOneAndUpdate(
      { artistNormalized: artistNorm, titleNormalized: titleNorm },
      {
        $set: {
          artist: artist,
          title: title,
          artistNormalized: artistNorm,
          titleNormalized: titleNorm,
          videoId: videoData.videoId,
          videoTitle: videoData.videoTitle,
          channelTitle: videoData.channelTitle,
          thumbnailUrl: videoData.thumbnailUrl,
          searchQuery: videoData.searchQuery,
          lastUsedAt: new Date()
        },
        $inc: { useCount: 1 },
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true, new: true }
    );
    return cached;
  } catch (error) {
    // Handle duplicate key errors gracefully
    if (error.code === 11000) {
      return await this.findOne({ artistNormalized: artistNorm, titleNormalized: titleNorm });
    }
    throw error;
  }
};

// Static method to get cache stats
songCacheSchema.statics.getStats = async function() {
  const total = await this.countDocuments();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const usedToday = await this.countDocuments({ lastUsedAt: { $gte: today } });
  const addedToday = await this.countDocuments({ createdAt: { $gte: today } });
  
  const topSongs = await this.find()
    .sort({ useCount: -1 })
    .limit(10)
    .select('artist title useCount');
  
  return {
    totalCached: total,
    usedToday,
    addedToday,
    topSongs
  };
};

// Static method to invalidate a cache entry (when video is no longer available)
songCacheSchema.statics.invalidate = async function(artist, title) {
  const artistNorm = this.normalize(artist);
  const titleNorm = this.normalize(title);
  
  const result = await this.findOneAndDelete({
    artistNormalized: artistNorm,
    titleNormalized: titleNorm
  });
  
  if (result) {
    console.log(`Cache INVALIDATED: "${artist} - ${title}" (videoId: ${result.videoId})`);
  }
  
  return result;
};

// Static method to invalidate by videoId (useful when YouTube returns video not found)
songCacheSchema.statics.invalidateByVideoId = async function(videoId) {
  const result = await this.findOneAndDelete({ videoId: videoId });
  
  if (result) {
    console.log(`Cache INVALIDATED by videoId: "${result.artist} - ${result.title}" (videoId: ${videoId})`);
  }
  
  return result;
};

module.exports = mongoose.model('SongCache', songCacheSchema);