const mongoose = require('mongoose');
const path = require('path');
const Volume = require('../models/Volume'); // Adjust path as needed

// Load environment variables (e.g., MongoDB URI)
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoDbURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/VeilSite'; // Use environment variable or fallback

async function updatePageIndexesInDb(volumePathName, chapterPathName, startPageIndex, newPagePath) {
    try {
        await mongoose.connect(mongoDbURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('MongoDB Connected for DB update script.');

        // Find the specific volume
        const volume = await Volume.findOne({ volumePath: `/views/Volumes/${volumePathName}/` });

        if (!volume) {
            console.error(`Volume with path ${volumePathName} not found.`);
            return;
        }

        // Find the specific chapter within the volume
        const chapter = volume.chapters.find(c => c.chapterNumber === parseInt(chapterPathName.replace('chapter-', '')));

        if (!chapter) {
            console.error(`Chapter with path ${chapterPathName} not found in volume ${volumePathName}.`);
            return;
        }

        console.log(`Updating pages for ${volumePathName}/${chapterPathName} from index ${startPageIndex} onwards.`);

        // Shift existing pages
        chapter.pages.forEach(page => {
            if (page.index >= startPageIndex) {
                const oldPageIndex = page.index;
                const newPageIndex = page.index + 1;
                page.index = newPageIndex;

                // Update path string
                // Example: "views/Volumes/volume-1/chapter-1/page8/page8.html"
                // Needs to become: "views/Volumes/volume-1/chapter-1/page9/page9.html"
                page.path = page.path.replace(new RegExp(`page${oldPageIndex}/page${oldPageIndex}.html`), `page${newPageIndex}/page${newPageIndex}.html`);
                console.log(`  Shifted page ${oldPageIndex} to ${newPageIndex}. New path: ${page.path}`);
            }
        });

        // Insert new page entry
        const newPage = {
            index: startPageIndex,
            path: newPagePath // e.g., "views/Volumes/volume-1/chapter-1/page8/page8.html"

        };
        chapter.pages.push(newPage);
        console.log(`  Inserted new page at index ${startPageIndex}. Path: ${newPage.path}`);


        // Re-sort the pages array by index to maintain order
        chapter.pages.sort((a, b) => a.index - b.index);

        // Save the updated volume document
        await volume.save();
        console.log('Database updated successfully!');

    } catch (error) {
        console.error('Error updating page indexes in DB:', error);
    } finally {
        await mongoose.disconnect();
        console.log('MongoDB Disconnected.');
    }
}

// Example usage:
// To insert a new page at index 8 in volume-1, chapter-1
// All existing pages with index >= 8 will be shifted to index + 1
// The path for the new page 8 should be: views/Volumes/volume-1/chapter-1/page8/page8.html
updatePageIndexesInDb(
    'volume-1',
    'chapter-1',
    8,
    'views/Volumes/volume-1/chapter-1/page8/page8.html'

);
