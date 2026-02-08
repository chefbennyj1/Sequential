const fs = require('fs').promises;
const path = require('path');

async function insertPage7() {
    // Using forward slashes to avoid escape character issues
    const chapterPath = 'E:/Comic Series/No_Overflow/Volumes/volume-1/chapter-1';
    const insertAt = 7; 

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
                // Folder might be empty
            }
        }

        const newPagePath = path.join(chapterPath, 'page7');
        await fs.mkdir(newPagePath, { recursive: true });
        await fs.mkdir(path.join(newPagePath, 'assets'), { recursive: true });
        
        console.log(`  Created empty page7 folder.`);
        console.log('Insertion Complete! Run the Library Scanner.');

    } catch (e) {
        console.error("Insertion Failed:", e);
    }
}

insertPage7();