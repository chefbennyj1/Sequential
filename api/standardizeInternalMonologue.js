const fs = require('fs');
const path = require('path');

async function standardizeInternalMonologue() {
    const sceneFiles = await findSceneFiles(path.join(__dirname, '../views/Volumes'));

    for (const filePath of sceneFiles) {
        console.log(`Processing ${filePath}`);
        try {
            const fileContent = await fs.promises.readFile(filePath, 'utf8');
            let sceneData = JSON.parse(fileContent);
            let modified = false;

            if (Array.isArray(sceneData)) {
                sceneData = sceneData.map(item => {
                    // Check if the item is a TextBlock with style "InternalMonologue"
                    if (item.displayType && item.displayType.type === 'TextBlock' && item.displayType.style === 'InternalMonologue') {
                        // If character is not already "Lee", set it to "Lee"
                        if (item.character !== "Lee") {
                            item.character = "Lee";
                            modified = true;
                            console.log(`  - Set character to "Lee" for item ID: ${item.id || 'N/A'}`);
                        }
                    }
                    return item;
                });

                if (modified) {
                    await fs.promises.writeFile(filePath, JSON.stringify(sceneData, null, 2), 'utf8');
                    console.log(`Updated ${filePath} with standardized characters.`);
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
    console.log('Finished standardizing internal monologues.');
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
standardizeInternalMonologue();