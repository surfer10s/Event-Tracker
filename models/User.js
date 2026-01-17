// User Model with email verification, password reset, address, and concert preferences
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Please provide a username'],
        unique: true,
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Please provide an email'],
        unique: true,
        lowercase: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
    },
    password: {
        type: String,
        required: [true, 'Please provide a password'],
        minlength: 6,
        select: false
    },
    firstName: { type: String },
    lastName: { type: String },
    mobileNumber: { type: String },
    smsOptIn: { type: Boolean, default: false },
    
    // Email verification
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    
    // Password reset
    passwordResetCode: String,
    passwordResetExpires: Date,
    
    // Address
    streetAddress: { type: String },
    city: { type: String },
    state: { type: String },
    zipcode: { type: String },
    county: { type: String },
    
    // Geocoded coordinates (from Google Geocoding API)
    coordinates: {
        lat: { type: Number },
        lng: { type: Number },
        geocodedAt: { type: Date },
        geocodedFrom: { type: String } // 'address' or 'zipcode' - what was used to geocode
    },
    
    // Legacy home location (keep for backward compatibility)
    homeCity: { type: String },
    homeState: { type: String },
    
    // Concert preferences
    concertPreferences: {
        budget: { 
            type: String, 
            enum: ['spare_no_expense', 'good_views', 'just_get_me_there', ''] 
        },
        seatSection: { 
            type: String, 
            enum: ['ga_floor', 'lower_section', 'upper_section', ''] 
        },
        view: { 
            type: String, 
            enum: ['straight_on', 'side_view', 'limited_obstructed', ''] 
        },
        seatFeatures: {
            firstRow: { type: Boolean, default: false },
            secondRow: { type: Boolean, default: false },
            thirdRow: { type: Boolean, default: false },
            aisleSeat: { type: Boolean, default: false }
        }
    },
    
    // Favorites
    favoriteArtists: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Artist'
    }],
    
    // YouTube Music integration
    youtubeMusic: {
        connected: { type: Boolean, default: false },
        accessToken: String,
        refreshToken: String,
        tokenExpiry: Date,
        channelId: String,
        channelTitle: String,
        connectedAt: Date
    },
    
    // Admin role
    isAdmin: {
        type: Boolean,
        default: false
    }
    
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Match password method
userSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);