const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    name: {
        type: String,
        required: [true, 'Category name is required'],
        trim: true,
        maxlength: [50, 'Category name cannot exceed 50 characters']
    },
    color: {
        type: String,
        required: true,
        enum: ['blue', 'purple', 'pink', 'green', 'yellow', 'red', 'indigo', 'orange'],
        default: 'blue'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index to ensure unique category names per user
categorySchema.index({ userId: 1, name: 1 }, { unique: true });

// Virtual for artist count (will be populated via aggregation)
categorySchema.virtual('artistCount', {
    ref: 'ArtistCategory',
    localField: '_id',
    foreignField: 'categoryId',
    count: true
});

// Ensure virtuals are included in JSON
categorySchema.set('toJSON', { virtuals: true });
categorySchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Category', categorySchema);