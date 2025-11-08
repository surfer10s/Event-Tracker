// Main Server File
// This is the entry point of your application

// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');

// Initialize Express app
const app = express();

// Connect to MongoDB
connectDB();

// Middleware
// CORS - allows your frontend to communicate with backend
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, or opening HTML files locally)
    // Also allow localhost and claude.ai
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5500',
      'https://claude.ai',
      process.env.FRONTEND_URL
    ];
    
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all origins in development
    }
  },
  credentials: true
}));

// Body parser - allows reading JSON from request body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware (helpful for debugging)
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// API Routes
// We'll create these route files next
// Think of routes as your API endpoints (like web service methods)

// Health check endpoint (useful for deployment)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV 
  });
});

// API version 1 routes
const API_PREFIX = '/api/v1';

// Test routes - for testing Ticketmaster integration
app.use(`${API_PREFIX}/test`, require('./routes/test'));

// Authentication routes - /api/v1/auth/...
app.use(`${API_PREFIX}/auth`, require('./routes/auth'));

// User routes - /api/v1/users/...
app.use(`${API_PREFIX}/users`, require('./routes/users'));

// Ticketmaster live API routes - /api/v1/ticketmaster/...
app.use(`${API_PREFIX}/ticketmaster`, require('./routes/ticketmaster'));

// Event routes - /api/v1/events/...
app.use(`${API_PREFIX}/events`, require('./routes/events'));

// SetListFM live API routes :
app.use(`${API_PREFIX}/setlist`, require('./routes/setlist'));

// Authentication routes - /api/v1/auth/...
// app.use(`${API_PREFIX}/auth`, require('./routes/auth'));

// Artist routes - /api/v1/artists/...
// app.use(`${API_PREFIX}/artists`, require('./routes/artists'));

// User routes - /api/v1/users/...
// app.use(`${API_PREFIX}/users`, require('./routes/users'));

// Tour routes - /api/v1/tours/...
// app.use(`${API_PREFIX}/tours`, require('./routes/tours'));

// 404 handler - catches all unmatched routes
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    message: 'Route not found' 
  });
});

// Global error handler
// This catches any errors thrown in your routes
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  console.error(err.stack);
  
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   Event Tracker API Server Running    ║
║   Port: ${PORT}                        ║
║   Environment: ${process.env.NODE_ENV || 'development'}           ║
║   Time: ${new Date().toLocaleString()}  ║
╚════════════════════════════════════════╝
  `);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! Shutting down...');
  console.error(err.name, err.message);
  process.exit(1);
});

module.exports = app;