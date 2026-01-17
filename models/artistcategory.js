const mongoose = require('mongoose');

const artistCategorySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    artistId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Artist',
        required: true,
        index: true
    },
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: true,
        index: true
    },
    assignedAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index to ensure artist can only be in same category once
artistCategorySchema.index({ userId: 1, artistId: 1, categoryId: 1 }, { unique: true });

// Index for efficient queries
artistCategorySchema.index({ categoryId: 1, userId: 1 });

module.exports = mongoose.model('ArtistCategory', artistCategorySchema);