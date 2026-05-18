const { insertPage } = require('../services/VolumeService');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

async function run() {
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/VeilSite';
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB");

        const params = {
            series: 'No_Overflow_Redux',
            volume: 'volume-1',
            chapter: 'chapter-2',
            insertPoint: 13
        };

        console.log(`Starting Global Page Shift at index ${params.insertPoint} in ${params.chapter} of ${params.series}...`);
        const result = await insertPage(params);
        console.log("Result:", result);

    } catch (err) {
        console.error("Shift failed:", err);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

run();
