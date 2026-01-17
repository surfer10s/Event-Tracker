const express = require('express');
const router = express.Router();
const {
    createCategory,
    getCategories,
    updateCategory,
    deleteCategory,
    assignArtistToCategory,
    removeArtistFromCategory,
    getArtistsInCategory,
    getArtistCategories
} = require('../controllers/categorycontroller');
const { protect } = require('../middleware/auth');

// Category CRUD routes
router.route('/')
    .get(protect, getCategories)
    .post(protect, createCategory);

router.route('/:id')
    .put(protect, updateCategory)
    .delete(protect, deleteCategory);

// Artist-Category assignment routes
router.route('/:id/artists')
    .get(protect, getArtistsInCategory);

router.route('/:id/artists/:artistId')
    .post(protect, assignArtistToCategory)
    .delete(protect, removeArtistFromCategory);

// Get categories for specific artist
router.get('/artists/:artistId/categories', protect, getArtistCategories);

module.exports = router;