const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // Import v4 as uuidv4

async function generateSceneIds() {
    const sceneFiles = await findSceneFiles(path.join(__dirname, '../Library/No_Overflow/Volumes'));

    for (const filePath of sceneFiles) {
        console.log(`Processing ${filePath}`);
        try {
            const fileContent = await fs.promises.readFile(filePath, 'utf8');
            let sceneData = JSON.parse(fileContent);

            // Assuming sceneData is an array of scene items
            if (Array.isArray(sceneData)) {
                let modified = false;
                sceneData = sceneData.map(item => {
                    if (!item.id) {
                        item.id = uuidv4();
                        modified = true;
                    }
                    return item;
                });

                if (modified) {
                    await fs.promises.writeFile(filePath, JSON.stringify(sceneData, null, 2), 'utf8');
                    console.log(`Updated ${filePath} with new IDs.`);
                } else {
                    console.log(`No new IDs needed for ${filePath}.`);
                }
            } else {
                console.warn(`Skipping ${filePath}: Expected JSON array, but found a different structure.`);
            }

        } catch (error) {
            console.error(`Error processing ${filePath}:`, error.message);
        }
    }
    console.log('Finished generating scene IDs.');
}

// Helper to find all scene.json files recursively
async function findSceneFiles(startPath) {
    const results = [];
    const files = await fs.promises.readdir(startPath, { withFileTypes: true });

    for (const file of files) {
        const fullPath = path.join(startPath, file.name);
        if (file.isDirectory()) {
            results.push(...await findSceneFiles(fullPath));
        } else if (file.isFile() && file.name === 'scene.json') {
            results.push(fullPath);
        }
    }
    return results;
}

// Run the script
generateSceneIds();
