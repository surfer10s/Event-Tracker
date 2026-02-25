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
    venueType: { type: String }, // e.g. "Arena", "Club", "Theater", "Outdoor"
    openAir: { type: Boolean }, // true = outdoor/open-air, false = indoor, null = unknown

    images: {
        thumbnail: String,
        medium: String,
        large: String,
        hero: String // wide banner image
    },

    links: {
        website: String,
        googleMaps: String
    },

    url: { type: String }, // Ticketmaster venue page link

    generalInfo: {
        generalRule: String,
        childRule: String
    },

    boxOfficeInfo: {
        phoneNumber: String,
        openHours: String,
        acceptedPayment: String,
        willCall: String
    },

    parkingDetail: { type: String },
    accessibleSeatingDetail: { type: String },

    social: {
        twitter: String,
        facebook: String,
        instagram: String,
        wiki: String
    },

    // Aggregate stats
    stats: {
        totalEvents: { type: Number, default: 0 },
        upcomingEvents: { type: Number, default: 0 },
        followers: { type: Number, default: 0 }
    },

    // Cooldown tracking for live TM API sync
    lastSyncedAt: { type: Date },
    // Cooldown tracking for venue detail enrichment (7-day cooldown)
    lastEnrichedAt: { type: Date }
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
        capacity: venueData.capacity,
        ...(venueData.venueType && { venueType: venueData.venueType }),
        ...(venueData.url && { url: venueData.url }),
        ...(venueData.generalInfo && { generalInfo: venueData.generalInfo }),
        ...(venueData.boxOfficeInfo && { boxOfficeInfo: venueData.boxOfficeInfo }),
        ...(venueData.parkingDetail && { parkingDetail: venueData.parkingDetail }),
        ...(venueData.accessibleSeatingDetail && { accessibleSeatingDetail: venueData.accessibleSeatingDetail }),
        ...(venueData.social && { social: venueData.social })
    });

    return venue;
};

module.exports = mongoose.model('Venue', venueSchema);
