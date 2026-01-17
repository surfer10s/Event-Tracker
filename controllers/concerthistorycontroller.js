const ConcertHistory = require('../models/concerthistory');

// @desc    Add concert to history
// @route   POST /api/v1/users/concert-history
// @access  Private
exports.addConcertToHistory = async (req, res) => {
    try {
        const {
            setlistId,
            artistName,
            artistMbid,
            eventDate,
            venueName,
            venueCity,
            venueState,
            venueCountry,
            rating,
            notes,
            setlistUrl
        } = req.body;

        // Check if already exists
        const existing = await ConcertHistory.findOne({
            userId: req.user._id,
            setlistId: setlistId
        });

        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'This concert is already in your history'
            });
        }

        const concert = await ConcertHistory.create({
            userId: req.user._id,
            setlistId,
            artistName,
            artistMbid,
            eventDate,
            venueName,
            venueCity,
            venueState,
            venueCountry,
            rating,
            notes,
            setlistUrl
        });

        res.status(201).json({
            success: true,
            concert
        });
    } catch (error) {
        console.error('Add concert to history error:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding concert to history'
        });
    }
};

// @desc    Get user's concert history
// @route   GET /api/v1/users/concert-history
// @access  Private
exports.getConcertHistory = async (req, res) => {
    try {
        const { sort = 'date-desc' } = req.query;

        let sortOption = {};
        switch (sort) {
            case 'date-asc':
                sortOption = { eventDate: 1 };
                break;
            case 'date-desc':
                sortOption = { eventDate: -1 };
                break;
            case 'rating-desc':
                sortOption = { rating: -1, eventDate: -1 };
                break;
            case 'artist':
                sortOption = { artistName: 1, eventDate: -1 };
                break;
            default:
                sortOption = { eventDate: -1 };
        }

        const concerts = await ConcertHistory.find({ userId: req.user._id })
            .sort(sortOption);

        res.json({
            success: true,
            count: concerts.length,
            concerts
        });
    } catch (error) {
        console.error('Get concert history error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching concert history'
        });
    }
};

// @desc    Update concert in history
// @route   PUT /api/v1/users/concert-history/:id
// @access  Private
exports.updateConcertHistory = async (req, res) => {
    try {
        const { rating, notes } = req.body;

        const concert = await ConcertHistory.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { rating, notes },
            { new: true }
        );

        if (!concert) {
            return res.status(404).json({
                success: false,
                message: 'Concert not found in your history'
            });
        }

        res.json({
            success: true,
            concert
        });
    } catch (error) {
        console.error('Update concert history error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating concert'
        });
    }
};

// @desc    Delete concert from history
// @route   DELETE /api/v1/users/concert-history/:id
// @access  Private
exports.deleteConcertFromHistory = async (req, res) => {
    try {
        const concert = await ConcertHistory.findOneAndDelete({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!concert) {
            return res.status(404).json({
                success: false,
                message: 'Concert not found in your history'
            });
        }

        res.json({
            success: true,
            message: 'Concert removed from history'
        });
    } catch (error) {
        console.error('Delete concert from history error:', error);
        res.status(500).json({
            success: false,
            message: 'Error removing concert'
        });
    }
};