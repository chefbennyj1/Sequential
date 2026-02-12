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

async function shiftAndInsert() {
    const volumePath = 'E:/Comic Series/No_Overflow/Volumes/volume-1';
    const insertAt = 19;
    const shiftBy = 1;
    const targetChapter = 'chapter-2';
    const sourcePagePath = path.join(volumePath, targetChapter, 'page18');

    console.log(`Starting Page Insertion (19) at ${volumePath}`);

    try {
        // 1. Gather all pages across all chapters to shift
        let allPages = [];
        const chapterDirs = await fs.readdir(volumePath);
        
        for (const chap of chapterDirs) {
            const chapPath = path.join(volumePath, chap);
            const stats = await fs.lstat(chapPath);
            if (!stats.isDirectory() || !chap.startsWith('chapter-')) continue;

            const pages = await fs.readdir(chapPath);
            for (const p of pages) {
                if (p.startsWith('page')) {
                    const num = parseInt(p.replace('page', ''), 10);
                    if (!isNaN(num) && num >= insertAt) {
                        allPages.push({ chapter: chap, name: p, num: num, fullPath: path.join(chapPath, p) });
                    }
                }
            }
        }

        // Sort descending by number to avoid collisions
        allPages.sort((a, b) => b.num - a.num);

        // 2. Perform Shifting
        for (const page of allPages) {
            const newNum = page.num + shiftBy;
            const newName = `page${newNum}`;
            const targetPath = path.join(volumePath, page.chapter, newName);

            console.log(`  Shifting ${page.chapter}/${page.name} -> ${newName}`);
            await fs.rename(page.fullPath, targetPath);

            // Update page.json pageId
            const jsonPath = path.join(targetPath, 'page.json');
            try {
                const content = await fs.readFile(jsonPath, 'utf8');
                const data = JSON.parse(content);
                if (data.header) {
                    data.header.pageId = newName;
                    await fs.writeFile(jsonPath, JSON.stringify(data, null, 2));
                }
            } catch (e) {}
        }

        // 3. Create New Page 19 in Chapter 2
        const newPageName = `page${insertAt}`;
        const newPagePath = path.join(volumePath, targetChapter, newPageName);
        
        await fs.mkdir(newPagePath, { recursive: true });
        await fs.mkdir(path.join(newPagePath, 'assets'), { recursive: true });
        
        console.log(`  Created ${newPageName} in ${targetChapter}`);

        // Clone from source (page18)
        const filesToCopy = ['page.json', 'page.js', 'page.css'];
        for (const file of filesToCopy) {
            await copyFile(path.join(sourcePagePath, file), path.join(newPagePath, file));
        }

        // Update pageId in the new page.json
        const newJsonPath = path.join(newPagePath, 'page.json');
        try {
            const content = await fs.readFile(newJsonPath, 'utf8');
            const data = JSON.parse(content);
            if (data.header) {
                data.header.pageId = newPageName;
                data.header.chapter = targetChapter;
                data.media = [];
                data.scene = [];
                await fs.writeFile(newJsonPath, JSON.stringify(data, null, 2));
            }
        } catch (e) {}

        console.log('Operation Complete! Remember to run the Library Scanner.');

    } catch (e) {
        console.error("Insertion Failed:", e);
    }
}

shiftAndInsert();