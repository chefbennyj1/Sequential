const fs = require('fs').promises;
const path = require('path');

async function insertPage14() {
    const chapterPath = 'E:\\Comic Series\\No_Overflow\\Volumes\\volume-1\\chapter-2';
    const insertPoint = 14; 

    console.log(`Starting Insertion at Page ${insertPoint} in: ${chapterPath}`);

    try {
        // 1. Identify Pages to Shift
        const dirs = await fs.readdir(chapterPath, { withFileTypes: true });
        let pagesToShift = [];

        for (const d of dirs) {
            if (d.isDirectory() && d.name.startsWith('page')) {
                const num = parseInt(d.name.replace('page', ''), 10);
                if (!isNaN(num) && num >= insertPoint) {
                    pagesToShift.push(num);
                }
            }
        }
        
        pagesToShift.sort((a, b) => b - a); // Descending: 17, 16, 15, 14

        // 2. Execute Shift
        for (const num of pagesToShift) {
            const oldName = `page${num}`;
            const newName = `page${num + 1}`;
            const oldPath = path.join(chapterPath, oldName);
            const newPath = path.join(chapterPath, newName);

            if (await fileExists(newPath)) {
                console.log(`  Target ${newName} already exists. Skipping move of ${oldName}.`);
                continue; 
            }

            console.log(`  Moving ${oldName} -> ${newName}`);
            // Retry logic for locks
            await tryRename(oldPath, newPath);

            // Renumber internal files in the MOVED page
            if (await fileExists(newPath)) {
                await updateInternalFiles(newPath, `page${num}`, `page${num + 1}`);
            }
        }

        // 3. Clone Page 13 -> Page 14
        const sourcePage = path.join(chapterPath, 'page13');
        const newPage = path.join(chapterPath, 'page14');

        if (await fileExists(newPage)) {
             console.log("  Page 14 already exists (shift failed or clone done?).");
        } else {
            console.log(`  Cloning page13 -> page14`);
            await fs.cp(sourcePage, newPage, { recursive: true });

            // 4. Update New Page Internals
            // Rename internal files (page13.js -> page14.js)
            await updateInternalFiles(newPage, 'page13', 'page14');

            // Reset JSON
            const jsonPath = path.join(newPage, 'page.json');
            const data = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
            data.header.pageId = 'page14';
            data.scene = []; // Clear scene
            // Note: Audio files copied from p13 are now physically in p14 folder.
            // But their paths in page.json (if we kept scene) would point to p13.
            // Since we clear scene, audio refs are gone. 
            // Ambient audio ref in header needs update?
            if (data.header.ambientAudio && data.header.ambientAudio.fileName) {
                // Ambient audio file was copied physically? Yes.
                // Does it have a path? Usually just fileName.
                // So it should just work if the file is there.
            }

            await fs.writeFile(jsonPath, JSON.stringify(data, null, 2));
            console.log(`  Page 14 initialized.`);
        }

        console.log('Insertion Complete! Run the Library Scanner.');

    } catch (e) {
        console.error("Insertion Failed:", e);
    }
}

async function updateInternalFiles(dir, oldName, newName) {
    const files = await fs.readdir(dir);
    for (const f of files) {
        // match page13.js, page13.css
        if (f.startsWith(oldName)) { 
            const newF = f.replace(oldName, newName);
            await tryRename(path.join(dir, f), path.join(dir, newF));
        }
    }
    
    // Update JSON pageId
    const jsonPath = path.join(dir, 'page.json');
    if (await fileExists(jsonPath)) {
        try {
            const data = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
            if (data.header && data.header.pageId === oldName) {
                data.header.pageId = newName;
                await fs.writeFile(jsonPath, JSON.stringify(data, null, 2));
            }
        } catch(e) {}
    }
}

async function fileExists(path) {
    try { await fs.access(path); return true; } catch { return false; }
}

async function tryRename(oldP, newP, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            await fs.rename(oldP, newP);
            return;
        } catch (e) {
            if (e.code === 'EPERM' && i < retries - 1) {
                console.log(`    Locked... retrying ${path.basename(oldP)} (${i+1}/${retries})`);
                await new Promise(r => setTimeout(r, 500));
            } else {
                throw e;
            }
        }
    }
}

insertPage14();
