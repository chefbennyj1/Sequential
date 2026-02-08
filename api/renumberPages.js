const fs = require('fs').promises;
const path = require('path');

async function splitPage12() {
    const chapterPath = 'E:\\Comic Series\\No_Overflow\\Volumes\\volume-1\\chapter-2';
    const splitPoint = 13; 

    console.log(`Resuming Split Operation in: ${chapterPath}`);

    try {
        const dirs = await fs.readdir(chapterPath, { withFileTypes: true });
        let existingPages = [];

        for (const d of dirs) {
            if (d.isDirectory() && d.name.startsWith('page')) {
                const num = parseInt(d.name.replace('page', ''), 10);
                if (!isNaN(num)) existingPages.push(num);
            }
        }
        existingPages.sort((a, b) => b - a); // Descending

        // Shift Logic: 
        // We need to move pages >= 13 up by 1.
        // Highest page found was likely 16 (now 17).
        
        // Find pages that need moving: any page N where N >= 13 AND (N+1) is empty.
        // Since we are iterating descending, we move N to N+1.
        
        for (const num of existingPages) {
            if (num < splitPoint) continue; // Don't touch 12 or below

            const oldName = `page${num}`;
            const newName = `page${num + 1}`;
            const oldPath = path.join(chapterPath, oldName);
            const newPath = path.join(chapterPath, newName);

            // If destination exists, we can't move yet (unless we messed up previous run)
            // But since we sort descending, destination should be empty if we haven't processed it yet.
            // Exception: If we have gaps.
            
            // Check if we ALREADY moved this page (e.g. page17 exists, was page16)
            // If page16 is missing but page17 exists, we assume page16 was moved.
            
            if (await fileExists(newPath)) {
                console.log(`  ${newName} already exists. Skipping move of ${oldName} (if it exists).`);
                continue; 
            }

            console.log(`  Moving ${oldName} -> ${newName}`);
            await tryRename(oldPath, newPath);

            // Renumber internal files
            if (await fileExists(newPath)) { // Only if move succeeded
                const files = await fs.readdir(newPath);
                for (const f of files) {
                    if (f.startsWith('page') && (f.endsWith('.js') || f.endsWith('.css') || f.endsWith('.html'))) {
                        const newFileName = f.replace(`page${num}`, `page${num + 1}`);
                        if (newFileName !== f) {
                            await tryRename(path.join(newPath, f), path.join(newPath, newFileName));
                        }
                    }
                }
                
                // Update page.json pageId
                const jsonPath = path.join(newPath, 'page.json');
                if (await fileExists(jsonPath)) {
                    try {
                        const data = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
                        if (data.header) {
                            data.header.pageId = newName;
                            await fs.writeFile(jsonPath, JSON.stringify(data, null, 2));
                        }
                    } catch (e) { console.error(`Error updating JSON for ${newName}`, e); }
                }
            }
        }

        // 2. CLONE PAGE 12 -> PAGE 13
        const p12Path = path.join(chapterPath, 'page12');
        const p13Path = path.join(chapterPath, 'page13');

        if (await fileExists(p13Path)) {
             console.log("  Page 13 already exists (clone done?). Skipping clone.");
        } else {
            console.log(`  Cloning page12 -> page13`);
            // Wait a bit to ensure locks are released
            await new Promise(r => setTimeout(r, 1000));
            await fs.cp(p12Path, p13Path, { recursive: true });

            // 3. CLEANUP PAGE 13
            const p13Files = await fs.readdir(p13Path);
            for (const f of p13Files) {
                if (f.startsWith('page12')) {
                    const newName = f.replace('page12', 'page13');
                    await tryRename(path.join(p13Path, f), path.join(p13Path, newName));
                }
            }

            const p13JsonPath = path.join(p13Path, 'page.json');
            const p13Data = JSON.parse(await fs.readFile(p13JsonPath, 'utf8'));
            p13Data.header.pageId = 'page13';
            p13Data.scene = []; 
            await fs.writeFile(p13JsonPath, JSON.stringify(p13Data, null, 2));
            console.log(`  Page 13 initialized.`);
        }

        console.log('Split Complete! Run the Library Scanner.');

    } catch (e) {
        console.error("Split Failed:", e);
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

splitPage12();