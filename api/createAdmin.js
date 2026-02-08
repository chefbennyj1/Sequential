const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const mongoDbURI = 'mongodb://localhost:27017/VeilSite';

async function createAdmin() {
    try {
        await mongoose.connect(mongoDbURI);
        console.log('Connected to MongoDB');

        const adminEmail = 'admin@example.com';
        const existing = await User.findOne({ email: adminEmail });

        if (!existing) {
            const hashedPassword = await bcrypt.hash('admin123', 12);
            const admin = new User({
                username: 'Admin',
                email: adminEmail,
                password: hashedPassword,
                age: 21,
                administrator: true
            });
            await admin.save();
            console.log('Admin user created: admin@example.com / admin123');
        } else {
            console.log('Admin user already exists.');
        }

        process.exit(0);
    } catch (err) {
        console.error('Failed to create admin:', err);
        process.exit(1);
    }
}

createAdmin();
