const fs = require('fs');
const path = require('path');

async function updateTextBlockAudioSrc() {
    // Define the base path for scene files
    const baseScenePath = path.join(__dirname, '../views/Volumes');
    // Define the specific chapter we are targeting
    const targetVolume = 'volume-1';
    const targetChapter = 'chapter-1';
    const startPageNumber = 3; // Starting from page 3, as corrected by the user

    const sceneFiles = await findSceneFilesFiltered(baseScenePath, targetVolume, targetChapter, startPageNumber);

    for (const filePath of sceneFiles) {
        console.log(`Processing ${filePath}`);
        try {
            const fileContent = await fs.promises.readFile(filePath, 'utf8');
            let sceneData = JSON.parse(fileContent);
            let modified = false;

            // Extract volume, chapter, page folder names from the file path
            // Example filePath: .../views/Volumes/volume-1/chapter-1/page4/scene.json
            const urlParts = filePath.split(path.sep);
            const pageFolder = urlParts[urlParts.length - 2];   // e.g., "page4"
            const chapterFolder = urlParts[urlParts.length - 3]; // e.g., "chapter-1"
            const volumeFolder = urlParts[urlParts.length - 4]; // e.g., "volume-1"

            if (Array.isArray(sceneData)) {
                sceneData = sceneData.map(item => {
                    // Check if the item is a TextBlock
                    if (item.displayType && item.displayType.type === 'TextBlock') {
                        // Ensure item has an ID before constructing audioSrc
                        if (!item.id) {
                            console.warn(`  - Skipping audioSrc for TextBlock without ID in ${filePath}. Item:`, item);
                            return item;
                        }
                        // Construct the public URL path (e.g., /api/audio/No_Overflow/volume-1/chapter-1/page4/assets/ID.mp3)
                        const constructedAudioSrc = `/api/audio/No_Overflow/${volumeFolder}/${chapterFolder}/${pageFolder}/assets/${item.id}.mp3`;

                        // Construct the absolute file system path for the audio file
                        const absoluteAudioFilePath = path.join(
                            __dirname,
                            '../views/Volumes', // Start from the views/Volumes directory
                            volumeFolder,
                            chapterFolder,
                            pageFolder,
                            'assets',
                            `${item.id}.mp3` // Add filename explicitly
                        );

                        // Check if the actual audio file exists
                        if (fs.existsSync(absoluteAudioFilePath)) {
                            // Only update if audioSrc is missing or different
                            if (item.audioSrc !== constructedAudioSrc) {
                                item.audioSrc = constructedAudioSrc;
                                modified = true;
                                console.log(`  - Set audioSrc for TextBlock ID: ${item.id} (Audio file exists).`);
                            }
                        } else {
                            // If audio file does not exist, ensure audioSrc is removed or not set
                            if (item.audioSrc !== undefined) { // Check if property exists
                                delete item.audioSrc; // Remove the property if the file doesn't exist
                                modified = true;
                                console.log(`  - Removed audioSrc for TextBlock ID: ${item.id} (Audio file not found).`);
                            }
                        }
                    }
                    return item;
                });

                if (modified) {
                    await fs.promises.writeFile(filePath, JSON.stringify(sceneData, null, 2), 'utf8');
                    console.log(`Updated ${filePath} with TextBlock audioSrc paths.`);
                } else {
                    console.log(`No changes needed for ${filePath}.`);
                }
            } else {
                console.warn(`Skipping ${filePath}: Expected JSON array, but found a different structure.`);
            }

        } catch (error) {
            console.error(`Error processing ${filePath}:`, error.message);
        }
    }
    console.log('Finished updating TextBlock audioSrc paths.');
}

// Helper to find scene.json files with filtering
async function findSceneFilesFiltered(startPath, targetVolume, targetChapter, startPageNumber) {
    const results = [];
    const files = await fs.promises.readdir(startPath, { withFileTypes: true });

    for (const file of files) {
        const fullPath = path.join(startPath, file.name);
        if (file.isDirectory()) {
            // Check if current directory is the target volume
            if (file.name === targetVolume && path.basename(startPath) === 'Volumes') { // Corrected check for volume
                // Recursively search within the target volume
                results.push(...await findSceneFilesFiltered(fullPath, targetVolume, targetChapter, startPageNumber));
            } else if (file.name === targetChapter && path.basename(path.dirname(fullPath)) === targetVolume) { // Check for chapter within target volume
                // Now look for page folders within this chapter
                const pageFiles = await fs.promises.readdir(fullPath, { withFileTypes: true });
                for (const pageFile of pageFiles) {
                    if (pageFile.isDirectory() && pageFile.name.startsWith('page')) {
                        const pageNumber = parseInt(pageFile.name.replace('page', ''), 10);
                        if (!isNaN(pageNumber) && pageNumber >= startPageNumber) {
                            const sceneFilePath = path.join(fullPath, pageFile.name, 'scene.json');
                            if (fs.existsSync(sceneFilePath)) {
                                results.push(sceneFilePath);
                            }
                        }
                    }
                }
            } else {
                // Continue recursive search in other directories if not the target volume/chapter
                results.push(...await findSceneFilesFiltered(fullPath, targetVolume, targetChapter, startPageNumber));
            }
        }
    }
    return results;
}


// Run the script
updateTextBlockAudioSrc();
