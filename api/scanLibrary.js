const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Series = require('../models/Series');
const LibraryRoot = require('../models/LibraryRoot');

// Database Connection
const connectDB = async () => {
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect('mongodb://localhost:27017/VeilSite');
        console.log('MongoDB Connected for Scanner');
    }
};

async function ensureDefaultRoot() {
    const defaultPath = path.resolve(__dirname, '..', 'Library');
    
    let root = await LibraryRoot.findOneAndUpdate(
        { name: "Internal Library" }, // Find by unique name
        { 
            $setOnInsert: { 
                name: "Internal Library",
                path: defaultPath,
                isActive: true
            }
        },
        { upsert: true, new: true }
    );
    
    // Ensure path is updated if it changed (though unlikely for Internal)
    if (root.path !== defaultPath) {
        root.path = defaultPath;
        await root.save();
    }
    
    return root;
}

async function scanLibrary() {
    await connectDB();
    await ensureDefaultRoot();

    const roots = await LibraryRoot.find({ isActive: true });
    console.log(`Scanning ${roots.length} active Library Roots...`);

    const allDetectedSeries = [];

    for (const root of roots) {
        console.log(`--- Scanning Root: ${root.name} (${root.path}) ---`);
        
        if (!fs.existsSync(root.path)) {
            console.warn(`Warning: Path does not exist for root ${root.name}: ${root.path}`);
            continue;
        }

        const entries = fs.readdirSync(root.path, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const seriesPath = path.join(root.path, entry.name);
                const volumesPath = path.join(seriesPath, 'Volumes');
                
                // Validation: Must contain a Volumes folder
                if (fs.existsSync(volumesPath) && fs.lstatSync(volumesPath).isDirectory()) {
                    console.log(`Found valid series structure: ${entry.name}`);
                    
                    const seriesData = {
                        title: entry.name,
                        folderName: entry.name,
                        libraryRoot: root._id
                    };

                    const seriesDoc = await syncSeriesToDB(seriesData);
                    if (seriesDoc) {
                        allDetectedSeries.push(seriesDoc);
                        await scanVolumesInSeries(seriesDoc, volumesPath, entry.name);
                    }
                }
            }
        }
    }

    return allDetectedSeries;
}

const Volume = require('../models/Volume');
const VolumeService = require('../services/VolumeService');

async function scanVolumesInSeries(seriesDoc, volumesPath, seriesFolderName) {
    const volumeFolders = fs.readdirSync(volumesPath).filter(f => {
        return fs.lstatSync(path.join(volumesPath, f)).isDirectory() && f.startsWith('volume-');
    });

    console.log(`Checking ${volumeFolders.length} volume folders in ${seriesFolderName}...`);

    for (const volFolder of volumeFolders) {
        const absolutePath = path.join(volumesPath, volFolder);
        // Construct a virtual path compatible with the engine's /Library route
        const relativeVolumePath = `/Library/${seriesFolderName}/Volumes/${volFolder}`;

        let volume = await Volume.findOne({ volumePath: relativeVolumePath, series: seriesDoc._id });

        if (!volume) {
            console.log(`New Volume detected: ${volFolder} for series ${seriesDoc.title}`);
            const volIndex = parseInt(volFolder.replace('volume-', '')) || 0;
            
            volume = new Volume({
                series: seriesDoc._id,
                index: volIndex,
                title: `${seriesDoc.title} - Volume ${volIndex}`,
                volumePath: relativeVolumePath,
                chapters: []
            });
            await volume.save();

            // Link to series
            if (!seriesDoc.volumes.includes(volume._id)) {
                seriesDoc.volumes.push(volume._id);
                await seriesDoc.save();
            }
        }

        // Sync chapters and pages
        await VolumeService.updateChaptersFromFS(volume, absolutePath);

        // --- Cache audio_map.json ---
        const audioMapPath = path.join(absolutePath, 'audio_map.json');
        if (fs.existsSync(audioMapPath)) {
            try {
                const mapData = JSON.parse(fs.readFileSync(audioMapPath, 'utf8'));
                volume.audioMap = Array.isArray(mapData) ? mapData : [];
            } catch (e) {
                console.error(`Error caching audio_map for ${volFolder}:`, e.message);
            }
        }

        await volume.save();
    }
}

async function syncSeriesToDB(data) {
    try {
        let series = await Series.findOne({ folderName: data.folderName });
        
        if (!series) {
            console.log(`New Series detected! Creating DB entry for: ${data.title}`);
            series = new Series({
                title: data.title,
                folderName: data.folderName,
                libraryRoot: data.libraryRoot,
                description: "Auto-detected by Library Scanner",
                volumes: []
            });
            await series.save();
        } else {
            // Update existing if root was missing or changed
            let changed = false;
            if (!series.libraryRoot || series.libraryRoot.toString() !== data.libraryRoot.toString()) {
                series.libraryRoot = data.libraryRoot;
                changed = true;
            }
            if (changed) {
                await series.save();
                console.log(`Updated existing series metadata: ${data.title}`);
            }
        }
        return series;
    } catch (e) {
        console.error(`Error syncing ${data.title}:`, e);
        return null;
    }
}

if (require.main === module) {
    (async () => {
        try {
            await scanLibrary();
            console.log("Scan complete.");
        } catch (err) {
            console.error("Scan failed:", err);
        } finally {
            mongoose.disconnect();
        }
    })();
}

module.exports = { scanLibrary };