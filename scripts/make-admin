// Run this script once to make yourself an admin
// Usage: node scripts/make-admin.js <username>
// Example: node scripts/make-admin.js surfer10s

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const username = process.argv[2];

if (!username) {
    console.error('Usage: node scripts/make-admin.js <username>');
    process.exit(1);
}

async function makeAdmin() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        
        const user = await User.findOne({ username: username });
        
        if (!user) {
            console.error(`User "${username}" not found`);
            process.exit(1);
        }
        
        user.isAdmin = true;
        await user.save();
        
        console.log(`✅ User "${username}" is now an admin!`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Admin: ${user.isAdmin}`);
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

makeAdmin();