const fs = require('fs');
const path = require('path');

const chapter2Dir = path.join('E:', 'Comic Series', 'No_Overflow', 'Volumes', 'volume-1', 'chapter-2');
const startPage = 12;

// 1. Get all page directories
const pages = fs.readdirSync(chapter2Dir)
    .filter(f => f.startsWith('page'))
    .map(f => ({
        name: f,
        index: parseInt(f.replace('page', ''))
    }))
    .sort((a, b) => a.index - b.index);

console.log("Current pages found in chapter-2:", pages.map(p => p.name).join(', '));

// 2. Renumber loop
pages.forEach((page, i) => {
    const oldName = page.name;
    const newIndex = startPage + i;
    const newName = `page${newIndex}`;
    
    const oldPath = path.join(chapter2Dir, oldName);
    const tempPath = path.join(chapter2Dir, `temp_${newName}`); // Use temp to avoid collisions
    const newPath = path.join(chapter2Dir, newName);

    console.log(`Renaming ${oldName} to ${newName}...`);

    // Rename folder to temp
    if (fs.existsSync(oldPath)) {
        fs.renameSync(oldPath, tempPath);
    }

    // Update page.json inside temp folder
    const jsonPath = path.join(tempPath, 'page.json');
    if (fs.existsSync(jsonPath)) {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (data.header) {
            data.header.pageId = newName;
        }
        fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
    }
});

// 3. Move from temp to final names
const tempFolders = fs.readdirSync(chapter2Dir).filter(f => f.startsWith('temp_page'));
tempFolders.forEach(tempName => {
    const tempPath = path.join(chapter2Dir, tempName);
    const finalPath = path.join(chapter2Dir, tempName.replace('temp_', ''));
    fs.renameSync(tempPath, finalPath);
});

console.log("Renumbering complete.");
