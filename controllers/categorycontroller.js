const Category = require('../models/category');
const ArtistCategory = require('../models/artistcategory');
const Artist = require('../models/Artist');

// @desc    Create new category
// @route   POST /api/v1/categories
// @access  Private
exports.createCategory = async (req, res) => {
    try {
        const { name, color } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Category name is required'
            });
        }

        // Check if category with same name already exists for user
        const existingCategory = await Category.findOne({
            userId: req.user._id,
            name: name.trim()
        });

        if (existingCategory) {
            return res.status(400).json({
                success: false,
                message: 'A category with this name already exists'
            });
        }

        const category = await Category.create({
            userId: req.user._id,
            name: name.trim(),
            color: color || 'blue'
        });

        res.status(201).json({
            success: true,
            category
        });
    } catch (error) {
        console.error('Create category error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating category',
            error: error.message
        });
    }
};

// @desc    Get all categories for user
// @route   GET /api/v1/categories
// @access  Private
exports.getCategories = async (req, res) => {
    try {
        const categories = await Category.find({ userId: req.user._id })
            .sort({ createdAt: -1 });

        // Get artist count for each category
        const categoriesWithCounts = await Promise.all(
            categories.map(async (category) => {
                const count = await ArtistCategory.countDocuments({
                    categoryId: category._id,
                    userId: req.user._id
                });
                return {
                    ...category.toObject(),
                    artistCount: count
                };
            })
        );

        res.json({
            success: true,
            count: categoriesWithCounts.length,
            categories: categoriesWithCounts
        });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching categories',
            error: error.message
        });
    }
};

// @desc    Update category
// @route   PUT /api/v1/categories/:id
// @access  Private
exports.updateCategory = async (req, res) => {
    try {
        const { name, color } = req.body;

        let category = await Category.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }

        // Check for duplicate name if name is being changed
        if (name && name !== category.name) {
            const duplicate = await Category.findOne({
                userId: req.user._id,
                name: name.trim(),
                _id: { $ne: req.params.id }
            });

            if (duplicate) {
                return res.status(400).json({
                    success: false,
                    message: 'A category with this name already exists'
                });
            }
        }

        category.name = name?.trim() || category.name;
        category.color = color || category.color;

        await category.save();

        res.json({
            success: true,
            category
        });
    } catch (error) {
        console.error('Update category error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating category',
            error: error.message
        });
    }
};

// @desc    Delete category
// @route   DELETE /api/v1/categories/:id
// @access  Private
exports.deleteCategory = async (req, res) => {
    try {
        const category = await Category.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }

        // Delete all artist-category assignments for this category
        await ArtistCategory.deleteMany({
            categoryId: req.params.id,
            userId: req.user._id
        });

        await category.deleteOne();

        res.json({
            success: true,
            message: 'Category deleted successfully'
        });
    } catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting category',
            error: error.message
        });
    }
};

// @desc    Assign artist to category
// @route   POST /api/v1/categories/:id/artists/:artistId
// @access  Private
exports.assignArtistToCategory = async (req, res) => {
    try {
        const { id: categoryId, artistId } = req.params;

        // Verify category belongs to user
        const category = await Category.findOne({
            _id: categoryId,
            userId: req.user._id
        });

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }

        // Verify artist exists in user's favorites
        const artist = await Artist.findById(artistId);
        if (!artist) {
            return res.status(404).json({
                success: false,
                message: 'Artist not found'
            });
        }

        // Check if assignment already exists
        const existingAssignment = await ArtistCategory.findOne({
            userId: req.user._id,
            artistId,
            categoryId
        });

        if (existingAssignment) {
            return res.status(400).json({
                success: false,
                message: 'Artist is already in this category'
            });
        }

        // Create assignment
        const assignment = await ArtistCategory.create({
            userId: req.user._id,
            artistId,
            categoryId
        });

        res.status(201).json({
            success: true,
            assignment
        });
    } catch (error) {
        console.error('Assign artist error:', error);
        res.status(500).json({
            success: false,
            message: 'Error assigning artist to category',
            error: error.message
        });
    }
};

// @desc    Remove artist from category
// @route   DELETE /api/v1/categories/:id/artists/:artistId
// @access  Private
exports.removeArtistFromCategory = async (req, res) => {
    try {
        const { id: categoryId, artistId } = req.params;

        const result = await ArtistCategory.deleteOne({
            userId: req.user._id,
            artistId,
            categoryId
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Assignment not found'
            });
        }

        res.json({
            success: true,
            message: 'Artist removed from category'
        });
    } catch (error) {
        console.error('Remove artist error:', error);
        res.status(500).json({
            success: false,
            message: 'Error removing artist from category',
            error: error.message
        });
    }
};

// @desc    Get all artists in a category
// @route   GET /api/v1/categories/:id/artists
// @access  Private
exports.getArtistsInCategory = async (req, res) => {
    try {
        const { id: categoryId } = req.params;

        // Verify category belongs to user
        const category = await Category.findOne({
            _id: categoryId,
            userId: req.user._id
        });

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }

        // Get all artist assignments for this category
        const assignments = await ArtistCategory.find({
            categoryId,
            userId: req.user._id
        }).populate('artistId');

        const artists = assignments.map(assignment => assignment.artistId);

        res.json({
            success: true,
            category: category.name,
            count: artists.length,
            artists
        });
    } catch (error) {
        console.error('Get category artists error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching category artists',
            error: error.message
        });
    }
};

// @desc    Get categories for a specific artist
// @route   GET /api/v1/artists/:artistId/categories
// @access  Private
exports.getArtistCategories = async (req, res) => {
    try {
        const { artistId } = req.params;

        const assignments = await ArtistCategory.find({
            artistId,
            userId: req.user._id
        }).populate('categoryId');

        const categories = assignments.map(assignment => assignment.categoryId);

        res.json({
            success: true,
            count: categories.length,
            categories
        });
    } catch (error) {
        console.error('Get artist categories error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching artist categories',
            error: error.message
        });
    }
};