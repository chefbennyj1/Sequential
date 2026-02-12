const fs = require('fs').promises;
const path = require('path');

async function copyFile(src, dest) {
    try {
        await fs.copyFile(src, dest);
        console.log(`  Copied ${path.basename(src)} to ${path.dirname(dest)}`);
    } catch (e) {
        console.log(`  Warning: Could not copy ${path.basename(src)} (maybe it doesn't exist?)`);
    }
}

async function insertPage5() {
    const chapterPath = 'E:/Comic Series/No_Overflow/Volumes/volume-1/chapter-1';
    const insertAt = 5; 
    const sourcePage = 'page4';

    console.log(`Starting Insertion Operation in: ${chapterPath}`);

    try {
        const dirs = await fs.readdir(chapterPath, { withFileTypes: true });
        let existingPages = [];

        for (const d of dirs) {
            if (d.isDirectory() && d.name.startsWith('page')) {
                const num = parseInt(d.name.replace('page', ''), 10);
                if (!isNaN(num)) existingPages.push(num);
            }
        }
        
        // Sort descending to avoid collision during rename
        existingPages.sort((a, b) => b - a); 

        for (const num of existingPages) {
            if (num < insertAt) continue; 

            const oldName = `page${num}`;
            const newName = `page${num + 1}`;
            const oldPath = path.join(chapterPath, oldName);
            const newPath = path.join(chapterPath, newName);

            console.log(`  Shifting ${oldName} -> ${newName}`);
            await fs.rename(oldPath, newPath);

            const jsonPath = path.join(newPath, 'page.json');
            try {
                const content = await fs.readFile(jsonPath, 'utf8');
                const data = JSON.parse(content);
                if (data.header) {
                    data.header.pageId = newName;
                    await fs.writeFile(jsonPath, JSON.stringify(data, null, 2));
                }
            } catch (e) {
                // Folder might be empty or JSON missing
            }
        }

        const newPageName = `page${insertAt}`;
        const newPagePath = path.join(chapterPath, newPageName);
        const sourcePath = path.join(chapterPath, sourcePage);

        await fs.mkdir(newPagePath, { recursive: true });
        await fs.mkdir(path.join(newPagePath, 'assets'), { recursive: true });
        
        console.log(`  Created ${newPageName} folder.`);

        // Clone configuration from page4
        const filesToCopy = ['page.json', 'page.js', 'page.css'];
        for (const file of filesToCopy) {
            await copyFile(path.join(sourcePath, file), path.join(newPagePath, file));
        }

        // Update pageId in the cloned page.json
        const newJsonPath = path.join(newPagePath, 'page.json');
        try {
            const content = await fs.readFile(newJsonPath, 'utf8');
            const data = JSON.parse(content);
            if (data.header) {
                data.header.pageId = newPageName;
                // Also clear media and scene if we want a fresh clone, 
                // but usually "cloning the configuration" implies copying the layout/settings.
                // The user said "cloning the configuration from page4", 
                // I'll keep the data but update the pageId.
                await fs.writeFile(newJsonPath, JSON.stringify(data, null, 2));
                console.log(`  Updated pageId in ${newPageName}/page.json`);
            }
        } catch (e) {
            console.error(`  Error updating ${newPageName}/page.json:`, e);
        }

        console.log('Insertion Complete! Please run the Library Scanner to update the database.');

    } catch (e) {
        console.error("Insertion Failed:", e);
    }
}

insertPage5();