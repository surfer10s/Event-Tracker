// User Schema - Like a CREATE TABLE statement in SQL
// This defines the structure of documents in the 'users' collection

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Basic Info
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false  // Don't return password in queries by default
  },
  
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: 3
  },
  
  // Profile
  firstName: {
    type: String,
    trim: true
  },
  
  lastName: {
    type: String,
    trim: true
  },
  
  // Favorite Artists - Array of Artist IDs (like a foreign key relationship)
  // In SQL this would be a separate User_Artists junction table
  favoriteArtists: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Artist'  // References the Artist model
  }],
  
  // Notification Preferences
  notifications: {
    email: { type: Boolean, default: true },
    newTours: { type: Boolean, default: true },
    priceDrops: { type: Boolean, default: false },
    nearbyEvents: { type: Boolean, default: true }
  },
  
  // Location (for nearby events)
  location: {
    city: String,
    state: String,
    country: { type: String, default: 'US' },
    zipCode: String
  },
  
  // Subscription tier (for future monetization)
  subscriptionTier: {
    type: String,
    enum: ['free', 'premium', 'pro'],
    default: 'free'
  },
  
  // Timestamps - like SQL Server's CreatedDate/ModifiedDate
  lastLogin: {
    type: Date
  }
  
}, {
  // Automatically adds createdAt and updatedAt fields
  timestamps: true
});

// Indexes for query performance (like CREATE INDEX in SQL)
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });

// Pre-save hook - runs before saving to database
// This is like a BEFORE INSERT/UPDATE trigger in SQL
userSchema.pre('save', async function(next) {
  // Only hash password if it's been modified
  if (!this.isModified('password')) {
    return next();
  }
  
  // Hash password with bcrypt (10 salt rounds)
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Instance method - like a method on a class
// Used to compare password during login
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Virtual property - computed field (like a computed column in SQL)
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Ensure virtuals are included when converting to JSON
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

// Export the model
// This is like creating a table - 'User' is the model name, userSchema is the structure
module.exports = mongoose.model('User', userSchema);