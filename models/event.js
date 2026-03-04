// Event Schema
// Represents a single concert/show
// This is where your affiliate links will be stored

const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  // Event Basics
  name: {
    type: String,
    required: [true, 'Event name is required'],
    trim: true
  },
  
  // Relationships (foreign keys)
  artist: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Artist',
    required: true
  },
  
  tour: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tour'
  },

  // Reference to Venue document (optional - backwards compatible)
  venueRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Venue'
  },

  // Date & Time
  date: {
    type: Date,
    required: true
  },
  
  doors: {
    type: Date  // When doors open
  },
  
  // Venue Information
  venue: {
    name: { type: String, required: true },
    address: String,
    city: { type: String, required: true },
    state: String,
    country: { type: String, default: 'US' },
    zipCode: String,
    
    // Geographic coordinates for mapping - GeoJSON format
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        index: '2dsphere'
      }
    },
    
    capacity: Number
  },
  
  // Ticket Information
  ticketInfo: {
    // Primary ticket prices
    minPrice: Number,
    maxPrice: Number,
    currency: { type: String, default: 'USD' },
    
    // Separate price ranges by type (primary vs resale)
    priceRanges: [{
      type: { type: String, enum: ['standard', 'primary', 'resale', 'vip', 'platinum'] },
      min: Number,
      max: Number,
      currency: String
    }],
    
    // Availability status
    status: {
      type: String,
      enum: ['on_sale', 'sold_out', 'cancelled', 'postponed', 'rescheduled', 'not_yet_on_sale', 'few_tickets_left'],
      default: 'not_yet_on_sale'
    },
    
    // Resale availability (if known from Inventory Status API)
    resaleStatus: {
      type: String,
      enum: ['available', 'not_available', 'unknown'],
      default: 'unknown'
    },
    
    // Sale dates
    onSaleDate: Date,
    offSaleDate: Date,
    
    // Presale info
    presales: [{
      name: String,
      startDateTime: Date,
      endDateTime: Date
    }],
    
    // Ticket limits
    ticketLimit: Number,
    
    // All-inclusive pricing flag (fees included in price)
    allInclusivePricing: { type: Boolean, default: false },
    
    // Last time we checked inventory
    lastInventoryCheck: Date
  },
  
  // AFFILIATE LINKS - This is how you make money!
  // Each link should include your affiliate tracking parameter
  affiliateLinks: {
    ticketmaster: {
      url: String,
      affiliateId: String,  // Your TM affiliate ID
      lastChecked: Date
    },
    stubhub: {
      url: String,
      affiliateId: String,
      lastChecked: Date
    },
    seatgeek: {
      url: String,
      affiliateId: String,
      lastChecked: Date
    }
  },
  
  // External IDs (for syncing with APIs)
  externalIds: {
    ticketmaster: String,
    stubhub: String,
    seatgeek: String
  },
  
  // Event Details
  description: {
    type: String,
    maxlength: 5000
  },
  
  images: {
    thumbnail: String,
    medium: String,
    large: String
  },
  
  // Supporting Acts
  supportingActs: [{
    name: String,
    artist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Artist'
    }
  }],
  
  // Age Restrictions
  ageRestriction: {
    type: String,
    enum: ['all_ages', '18+', '21+', 'unknown'],
    default: 'unknown'
  },
  
  // Tracking
  clickCount: {
    type: Number,
    default: 0
  },
  
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  
  // Flag for data quality
  isVerified: {
    type: Boolean,
    default: false
  }
  
}, {
  timestamps: true
});

// Indexes for performance
eventSchema.index({ artist: 1, date: 1 });
eventSchema.index({ date: 1 });
eventSchema.index({ 'venue.city': 1, date: 1 });
eventSchema.index({ 'ticketInfo.status': 1 });

// Geospatial index for "events near me" queries
eventSchema.index({ 'venue.coordinates': '2dsphere' });

// Compound index for finding upcoming events by artist
eventSchema.index({ artist: 1, date: 1, 'ticketInfo.status': 1 });

// Index for venue reference queries
eventSchema.index({ venueRef: 1, date: 1 });

// Static method to find upcoming events
eventSchema.statics.findUpcoming = function(limit = 50) {
  return this.find({
    date: { $gte: new Date() },
    'ticketInfo.status': { $in: ['on_sale', 'not_yet_on_sale'] }
  })
  .sort({ date: 1 })
  .limit(limit)
  .populate('artist');
};

// Static method to find events near a location
eventSchema.statics.findNearby = function(coordinates, maxDistance = 50) {
  // maxDistance in miles, convert to meters
  const meters = maxDistance * 1609.34;
  
  return this.find({
    'venue.coordinates': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates  // [longitude, latitude]
        },
        $maxDistance: meters
      }
    },
    date: { $gte: new Date() }
  });
};

// Instance method to increment click count (for tracking affiliate performance)
eventSchema.methods.recordClick = async function(platform) {
  this.clickCount += 1;
  if (this.affiliateLinks[platform]) {
    this.affiliateLinks[platform].lastChecked = new Date();
  }
  return await this.save();
};

// Virtual to check if event is happening soon (within 7 days)
eventSchema.virtual('isUpcoming').get(function() {
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return this.date <= sevenDaysFromNow && this.date >= new Date();
});

// Virtual to check if event has passed
eventSchema.virtual('isPast').get(function() {
  return this.date < new Date();
});

eventSchema.set('toJSON', { virtuals: true });
eventSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Event', eventSchema);