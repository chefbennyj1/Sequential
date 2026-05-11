require('dotenv').config();
const mongoose = require('mongoose');
const GeminiVisionService = require('./services/GeminiVisionService');
const path = require('path');
const fs = require('fs');

const mongoDbURI = 'mongodb://localhost:27017/VeilSite';

async function analyzePage(chapter, page) {
    await mongoose.connect(mongoDbURI);
    console.log('Connected to MongoDB');

    const vision = GeminiVisionService;
    const pagePath = `E:\\Comic Series\\No_Overflow_Redux\\Volumes\\volume-1\\${chapter}\\${page}`;
    const pageJsonPath = path.join(pagePath, 'page.json');
    
    if (!fs.existsSync(pageJsonPath)) {
        console.error(`Page JSON not found at ${pageJsonPath}`);
        return;
    }

    const pageData = JSON.parse(fs.readFileSync(pageJsonPath, 'utf8'));
    
    for (const item of pageData.media) {
        if (item.type === 'image' && item.fileName) {
            const imagePath = path.join(pagePath, 'assets', 'image', item.fileName);
            if (fs.existsSync(imagePath)) {
                console.log(`Analyzing ${page} - ${item.panel} (${item.fileName})...`);
                try {
                    const visionData = await vision.analyzeImage(imagePath);
                    
                    item.description = visionData.description || "";
                    item.alt = visionData.alt || "";
                    item.hashtags = visionData.hashtags || [];
                    
                    item.imageHash = await vision.generateImageHash(imagePath);
                    item.DescriptionUpdateRequired = false;
                    
                    console.log(`Result: ${item.description}`);
                    console.log(`Tags: ${item.hashtags.join(' ')}`);
                } catch (err) {
                    console.error(`Failed to analyze ${item.fileName}:`, err.message);
                }
            }
        }
    }

    fs.writeFileSync(pageJsonPath, JSON.stringify(pageData, null, 2));
    console.log(`Saved updates to ${pageJsonPath}`);
    await mongoose.disconnect();
}

const args = process.argv.slice(2);
const chapter = args[0] || 'chapter-2';
const page = args[1] || 'page21';

analyzePage(chapter, page).then(() => {
    console.log('Done.');
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});

