// Venue Model
// Represents a concert/event venue with geospatial data
const mongoose = require('mongoose');

const venueSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Venue name is required'],
        trim: true,
        index: true
    },
    address: { type: String },
    city: {
        type: String,
        required: [true, 'City is required'],
        trim: true
    },
    state: { type: String, trim: true },
    country: { type: String, default: 'US' },
    zipCode: { type: String },

    // GeoJSON Point for geospatial queries
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number] // [longitude, latitude]
        }
    },

    // Dedup key: lowercase(name)|lowercase(city)|uppercase(state)
    normalizedKey: {
        type: String,
        unique: true,
        index: true
    },

    // External API IDs
    externalIds: {
        ticketmaster: String
    },

    capacity: { type: Number },

    images: {
        thumbnail: String,
        medium: String,
        large: String
    },

    links: {
        website: String,
        googleMaps: String
    },

    // Aggregate stats
    stats: {
        totalEvents: { type: Number, default: 0 },
        upcomingEvents: { type: Number, default: 0 },
        followers: { type: Number, default: 0 }
    },

    // Cooldown tracking for live TM API sync
    lastSyncedAt: { type: Date }
}, { timestamps: true });

// Geospatial index
venueSchema.index({ location: '2dsphere' });
venueSchema.index({ city: 1, state: 1 });

// Auto-generate normalizedKey and sanitize location before save
venueSchema.pre('save', function (next) {
    if (this.isModified('name') || this.isModified('city') || this.isModified('state') || !this.normalizedKey) {
        this.normalizedKey = `${(this.name || '').toLowerCase()}|${(this.city || '').toLowerCase()}|${(this.state || '').toUpperCase()}`;
    }
    // Clear invalid GeoJSON (Point with no coordinates causes 2dsphere errors)
    if (this.location && (!this.location.coordinates || this.location.coordinates.length !== 2)) {
        this.location = undefined;
    }
    next();
});

// Static: find or create a venue from event venue data
venueSchema.statics.findOrCreateFromEventVenue = async function (venueData) {
    const key = `${(venueData.name || '').toLowerCase()}|${(venueData.city || '').toLowerCase()}|${(venueData.state || '').toUpperCase()}`;

    let venue = await this.findOne({ normalizedKey: key });
    if (venue) return venue;

    // Build location if coordinates exist
    let location;
    if (venueData.location?.coordinates?.length === 2) {
        location = {
            type: 'Point',
            coordinates: venueData.location.coordinates
        };
    }

    venue = await this.create({
        name: venueData.name,
        address: venueData.address,
        city: venueData.city,
        state: venueData.state,
        country: venueData.country || 'US',
        zipCode: venueData.zipCode,
        location,
        capacity: venueData.capacity
    });

    return venue;
};

module.exports = mongoose.model('Venue', venueSchema);
