// Database connection configuration
// This is like setting up your connection string in SQL Server

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Connect to MongoDB
    // mongoose.connect is like opening a connection in ADO.NET
    const conn = await mongoose.connect(process.env.MONGODB_URI);

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Log database name (helpful for debugging)
    console.log(`Database: ${conn.connection.name}`);
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    // Exit process with failure
    process.exit(1);
  }
};

// Handle connection events (like SQL Server connection pool events)
mongoose.connection.on('error', (err) => {
  console.error(`MongoDB connection error: ${err}`);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed through app termination');
  process.exit(0);
});

module.exports = connectDB;