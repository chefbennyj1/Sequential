const mongoose = require('mongoose');
const Volume = require('./models/Volume');

async function testQuery() {
    try {
        await mongoose.connect('mongodb://localhost:27017/VeilSite');
        console.log("Connected to DB.");

        // Test the exact query used in VisionController
        const volumes = await Volume.find({
            'chapters.pages.mediaData.media.DescriptionUpdateRequired': true
        });

        console.log(`Query "chapters.pages.mediaData.media.DescriptionUpdateRequired": true returned ${volumes.length} volumes.`);
        
        if (volumes.length > 0) {
            volumes.forEach(v => {
                console.log(`- Volume ID: ${v._id}, Path: ${v.volumePath}`);
            });
        } else {
            // Let's try a broader query to see what's actually there
            const allVolumes = await Volume.find({});
            console.log("Inspecting first volume structure...");
            const firstVol = allVolumes.find(v => v.volumePath.includes('Redux'));
            if (firstVol) {
                const firstPage = firstVol.chapters[0]?.pages[0];
                console.log("Page 0 mediaData:", JSON.stringify(firstPage?.mediaData, null, 2));
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

testQuery();