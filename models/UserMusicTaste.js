const mongoose = require('mongoose');

const artistSchema = new mongoose.Schema({
  name: { type: String, required: true },
  videoCount: { type: Number, default: 1 },
  sources: [{ type: String, enum: ['liked', 'playlist'] }],
  firstSeen: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now }
}, { _id: false });

const userMusicTasteSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    unique: true 
  },
  artists: [artistSchema],
  lastSyncedAt: { type: Date, default: null },
  totalVideosProcessed: { type: Number, default: 0 },
  syncHistory: [{
    syncedAt: Date,
    videosProcessed: Number,
    artistsFound: Number,
    source: { type: String, enum: ['manual', 'background'] }
  }]
}, { timestamps: true });

// Index for quick lookups (userId already has unique: true which creates an index)
userMusicTasteSchema.index({ 'artists.name': 1 });

// Static method to update or create user's music taste
userMusicTasteSchema.statics.addArtists = async function(userId, artistsData) {
  let userTaste = await this.findOne({ userId });
  
  if (!userTaste) {
    userTaste = new this({ userId, artists: [] });
  }
  
  const now = new Date();
  
  for (const artistData of artistsData) {
    const existingArtist = userTaste.artists.find(
      a => a.name.toLowerCase() === artistData.name.toLowerCase()
    );
    
    if (existingArtist) {
      existingArtist.videoCount += artistData.videoCount || 1;
      existingArtist.lastSeen = now;
      // Add new sources
      for (const source of artistData.sources || []) {
        if (!existingArtist.sources.includes(source)) {
          existingArtist.sources.push(source);
        }
      }
    } else {
      userTaste.artists.push({
        name: artistData.name,
        videoCount: artistData.videoCount || 1,
        sources: artistData.sources || [],
        firstSeen: now,
        lastSeen: now
      });
    }
  }
  
  await userTaste.save();
  return userTaste;
};

// Static method to get user's top artists
userMusicTasteSchema.statics.getTopArtists = async function(userId, limit = 20) {
  const userTaste = await this.findOne({ userId });
  if (!userTaste) return [];
  
  return userTaste.artists
    .sort((a, b) => b.videoCount - a.videoCount)
    .slice(0, limit);
};

// Static method to check if user has artist in their taste
userMusicTasteSchema.statics.hasArtist = async function(userId, artistName) {
  const userTaste = await this.findOne({ 
    userId,
    'artists.name': { $regex: new RegExp(`^${artistName}$`, 'i') }
  });
  return !!userTaste;
};

// Static method to find users who like a specific artist
userMusicTasteSchema.statics.findUsersWhoLike = async function(artistName) {
  return this.find({
    'artists.name': { $regex: new RegExp(`^${artistName}$`, 'i') }
  }).select('userId');
};

module.exports = mongoose.model('UserMusicTaste', userMusicTasteSchema);