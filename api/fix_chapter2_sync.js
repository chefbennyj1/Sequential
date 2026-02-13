const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Volume = require('../models/Volume.js');
const VolumeManager = require("../services/VolumeService.js");
const { resolveSeriesPath } = require("../services/MediaService.js");

const mongoDbURI = 'mongodb://localhost:27017/VeilSite';

async function run() {
    await mongoose.connect(mongoDbURI);
    console.log("Connected to MongoDB.");

    const volume = await Volume.findOne({ title: /Volume 1/i }).populate('series');
    if (!volume) {
        console.error("Volume 1 not found in DB.");
        process.exit(1);
    }

    const seriesFolderName = volume.series ? volume.series.folderName : "No_Overflow";
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const volumeBaseDir = path.join(seriesPath, 'Volumes', 'volume-1');
    const chapter2Dir = path.join(volumeBaseDir, 'chapter-2');

    console.log(`Working in: ${chapter2Dir}`);

    if (!fs.existsSync(chapter2Dir)) {
        console.error("Chapter 2 directory not found:", chapter2Dir);
        process.exit(1);
    }

    // 1. Get all page directories
    const pages = fs.readdirSync(chapter2Dir)
        .filter(f => f.startsWith('page') || f.startsWith('final_page'))
        .map(f => ({
            name: f,
            index: parseInt(f.replace('page', '').replace('final_', ''))
        }))
        .sort((a, b) => a.index - b.index);

    console.log("Current pages found in chapter-2:", pages.map(p => p.name).join(', '));

    const startPage = 12;

    // 2. Renumber loop
    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const oldName = page.name;
        const newIndex = startPage + i;
        const newName = `page${newIndex}`;
        
        const oldPath = path.join(chapter2Dir, oldName);
        const tempPath = path.join(chapter2Dir, `final_${newName}`); 
        const finalPath = path.join(chapter2Dir, newName);

        if (oldPath === finalPath && !oldName.startsWith('final_')) {
             console.log(`Page ${oldName} already correctly named.`);
             // Update JSON anyway to be sure
             const jsonPath = path.join(oldPath, 'page.json');
             if (fs.existsSync(jsonPath)) {
                const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                if (!data.header) data.header = {};
                data.header.pageId = newName;
                fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
             }
             continue;
        }

        console.log(`Processing ${oldName} -> ${newName}...`);

        if (fs.existsSync(oldPath)) {
            fs.renameSync(oldPath, tempPath);
        }

        const jsonPath = path.join(tempPath, 'page.json');
        if (fs.existsSync(jsonPath)) {
            const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            if (!data.header) data.header = {};
            data.header.pageId = newName;
            fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
        }
    }

    // 3. Move from temp to final names
    const finalFolders = fs.readdirSync(chapter2Dir).filter(f => f.startsWith('final_page'));
    for (const tempName of finalFolders) {
        const tempPath = path.join(chapter2Dir, tempName);
        const finalPath = path.join(chapter2Dir, tempName.replace('final_', ''));
        fs.renameSync(tempPath, finalPath);
    }

    console.log("File system renumbering complete. Triggering DB sync with explicit path...");
    
    // 4. Trigger Sync with the actual disk path
    await VolumeManager.updateChaptersFromFS(volume, volumeBaseDir);
    
    console.log("DB Sync complete. Chapter 2 is now fixed.");
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
