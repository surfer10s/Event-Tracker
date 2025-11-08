// Tour Schema
// Represents a complete tour by an artist (collection of events)
// Think of this as a parent table with Events as child records

const mongoose = require('mongoose');

const tourSchema = new mongoose.Schema({
  // Tour Info
  name: {
    type: String,
    required: [true, 'Tour name is required'],
    trim: true
  },
  
  // Reference to Artist (foreign key relationship)
  artist: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Artist',
    required: true
  },
  
  // Tour Dates
  startDate: {
    type: Date,
    required: true
  },
  
  endDate: {
    type: Date
  },
  
  // Status
  status: {
    type: String,
    enum: ['announced', 'on_sale', 'in_progress', 'completed', 'cancelled'],
    default: 'announced'
  },
  
  // Tour Details
  description: {
    type: String,
    maxlength: 5000
  },
  
  promoter: {
    type: String
  },
  
  // Images/Artwork
  posterImage: {
    type: String
  },
  
  // Geographic Coverage
  // This helps with the visual tour map feature
  regions: [{
    type: String,
    enum: ['North America', 'South America', 'Europe', 'Asia', 'Africa', 'Oceania']
  }],
  
  countries: [{
    type: String
  }],
  
  // Statistics
  totalShows: {
    type: Number,
    default: 0
  },
  
  soldOutShows: {
    type: Number,
    default: 0
  },
  
  // External Links
  officialUrl: {
    type: String
  },
  
  // Data tracking
  lastUpdated: {
    type: Date,
    default: Date.now
  }
  
}, {
  timestamps: true
});

// Indexes
tourSchema.index({ artist: 1 });
tourSchema.index({ startDate: 1 });
tourSchema.index({ status: 1 });

// Compound index for finding active tours by artist
tourSchema.index({ artist: 1, status: 1, startDate: 1 });

// Static method to find active tours
tourSchema.statics.findActiveTours = function() {
  return this.find({
    status: { $in: ['on_sale', 'in_progress'] },
    startDate: { $lte: new Date() },
    $or: [
      { endDate: { $gte: new Date() } },
      { endDate: null }
    ]
  }).populate('artist');
};

// Instance method to check if tour is currently happening
tourSchema.methods.isActive = function() {
  const now = new Date();
  return this.startDate <= now && (!this.endDate || this.endDate >= now);
};

// Virtual to calculate tour duration in days
tourSchema.virtual('durationDays').get(function() {
  if (!this.endDate) return null;
  const diff = this.endDate - this.startDate;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

tourSchema.set('toJSON', { virtuals: true });
tourSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Tour', tourSchema);