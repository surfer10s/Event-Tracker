// Artist/Band Schema
// This stores information about musical artists and bands

const mongoose = require('mongoose');

const artistSchema = new mongoose.Schema({
  // Basic Info
  name: {
    type: String,
    required: [true, 'Artist name is required'],
    trim: true,
    unique: true,
    index: true
  },
  
  // External IDs from different platforms
  // These are like foreign keys to external systems
  externalIds: {
    ticketmaster: String,
    spotify: String,
    stubhub: String,
    seatgeek: String,
    setlistfm: String  // MusicBrainz ID for Setlist.fm
  },
  
  // Artist Details
  genre: [{
    type: String,
    trim: true
  }],
  
  description: {
    type: String,
    maxlength: 2000
  },
  
  // Images
  images: {
    thumbnail: String,
    medium: String,
    large: String
  },
  
  // Social Media & Links
  links: {
    website: String,
    spotify: String,
    instagram: String,
    twitter: String,
    facebook: String,
    setlistfm: String
  },
  
  // Tour Status
  tourStatus: {
    type: String,
    enum: ['active', 'inactive', 'upcoming', 'unknown'],
    default: 'unknown'
  },
  
  // Tour History
  lastTourDate: {
    type: Date
  },
  
  nextTourDate: {
    type: Date
  },
  
  // Statistics (useful for showing popularity)
  stats: {
    totalEvents: { type: Number, default: 0 },
    upcomingEvents: { type: Number, default: 0 },
    followers: { type: Number, default: 0 },  // Users who favorited
    averageTicketPrice: { type: Number },
    totalShows: { type: Number, default: 0 },  // From Setlist.fm
    averageSetlistLength: { type: Number }     // From Setlist.fm
  },
  
  // Data freshness tracking
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  
  // Whether this artist should be actively tracked
  // Set to false for inactive/disbanded artists to save API calls
  isActive: {
    type: Boolean,
    default: true
  }
  
}, {
  timestamps: true
});

// Indexes for performance
artistSchema.index({ name: 1 });
artistSchema.index({ 'externalIds.ticketmaster': 1 });
artistSchema.index({ 'externalIds.setlistfm': 1 });
artistSchema.index({ tourStatus: 1 });
artistSchema.index({ nextTourDate: 1 });

// Index for text search (allows searching artist names)
artistSchema.index({ name: 'text', genre: 'text' });

// Static method to find artists by tour status
// Static methods are like stored procedures - called on the model itself
artistSchema.statics.findByTourStatus = function(status) {
  return this.find({ tourStatus: status, isActive: true });
};

// Instance method to check if artist has upcoming events
artistSchema.methods.hasUpcomingEvents = function() {
  return this.stats.upcomingEvents > 0;
};

// Virtual for checking if data is stale (older than 24 hours)
artistSchema.virtual('needsUpdate').get(function() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return this.lastUpdated < oneDayAgo;
});

artistSchema.set('toJSON', { virtuals: true });
artistSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Artist', artistSchema);
