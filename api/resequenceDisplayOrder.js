const fs = require('fs');
const path = require('path');

async function resequenceDisplayOrder() {
    const startPath = path.join(__dirname, '../views/Volumes');
    console.log(`Scanning for scene.json files in: ${startPath}`);
    const sceneFiles = await findSceneFiles(startPath);

    if (sceneFiles.length === 0) {
        console.log("No scene.json files found.");
        return;
    }

    console.log(`Found ${sceneFiles.length} scene.json files.`);

    for (const filePath of sceneFiles) {
        try {
            const fileContent = await fs.promises.readFile(filePath, 'utf8');
            let sceneData;
            try {
                sceneData = JSON.parse(fileContent);
            } catch (e) {
                console.error(`Error parsing JSON in ${filePath}:`, e.message);
                continue;
            }

            if (Array.isArray(sceneData)) {
                let modified = false;
                
                // Check if reordering is needed
                for (let i = 0; i < sceneData.length; i++) {
                    if (sceneData[i].displayOrder !== i) {
                        modified = true;
                        break;
                    }
                }

                if (modified) {
                    console.log(`Resequencing ${filePath}...`);
                    sceneData.forEach((item, index) => {
                        item.displayOrder = index;
                    });

                    await fs.promises.writeFile(filePath, JSON.stringify(sceneData, null, 2), 'utf8');
                    console.log(`  -> Updated.`);
                } else {
                    // console.log(`  -> Already sequential: ${filePath}`);
                }
            } else {
                console.warn(`Skipping ${filePath}: Expected JSON array.`);
            }

        } catch (error) {
            console.error(`Error processing ${filePath}:`, error.message);
        }
    }
    console.log('Finished resequencing displayOrder.');
}

// Helper to find all scene.json files recursively
async function findSceneFiles(startPath) {
    const results = [];
    let files = [];
    try {
         files = await fs.promises.readdir(startPath, { withFileTypes: true });
    } catch (e) {
        console.error(`Error reading directory ${startPath}:`, e.message);
        return [];
    }

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
resequenceDisplayOrder();
