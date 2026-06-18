const fs = require('fs');
const path = require('path');

// The local comic content directory based on user rules
const COMIC_SERIES_DIR = 'E:\\Comic Series';

async function migratePageJson(filePath) {
    let modified = false;
    let data;
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        data = JSON.parse(raw);
    } catch (e) {
        console.error(`[Error] Could not read or parse ${filePath}: ${e.message}`);
        return false;
    }

    if (!data.header) {
        data.header = { version: "2.0" };
        modified = true;
    }

    const h = data.header;
    
    // Find legacy layout ID
    let layoutId = "Standard_Page";
    if (h.layout && h.layout.id) layoutId = h.layout.id;
    else if (h.portraitLayout && h.portraitLayout.id) layoutId = h.portraitLayout.id;
    else if (h.layouts && h.layouts.portrait && h.layouts.portrait.id) layoutId = h.layouts.portrait.id;
    else if (h.layouts && h.layouts.landscape && h.layouts.landscape.id) layoutId = h.layouts.landscape.id;
    else if (data.layout && data.layout.id) layoutId = data.layout.id;

    // Check if it already matches the canonical structure exactly
    if (!h.layout || h.layout.id !== layoutId || h.layout.html !== `${layoutId}.html`) {
        h.layout = { id: layoutId, html: `${layoutId}.html`, css: "" };
        modified = true;
    }

    // Delete legacy keys
    if (h.portraitLayout !== undefined) { delete h.portraitLayout; modified = true; }
    if (h.layouts !== undefined) { delete h.layouts; modified = true; }
    if (data.layout !== undefined) { delete data.layout; modified = true; }

    // Clean up landscapeStyle from media elements since the engine is now portrait/image-only
    if (data.media && Array.isArray(data.media)) {
        data.media.forEach(m => {
            if (m.landscapeStyle !== undefined) { delete m.landscapeStyle; modified = true; }
            if (m.portraitStyle !== undefined) { delete m.portraitStyle; modified = true; }
        });
    }

    if (modified) {
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            console.log(`[Migrated] ${filePath}`);
            return true;
        } catch (e) {
            console.error(`[Error] Could not save ${filePath}: ${e.message}`);
        }
    }
    return false;
}

async function walkDir(dir) {
    let migratedCount = 0;
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            migratedCount += await walkDir(fullPath);
        } else if (entry.name === 'page.json') {
            const migrated = await migratePageJson(fullPath);
            if (migrated) migratedCount++;
        }
    }
    return migratedCount;
}

async function run() {
    console.log(`Starting page.json migration on ${COMIC_SERIES_DIR}...`);
    if (!fs.existsSync(COMIC_SERIES_DIR)) {
        console.error(`Directory not found: ${COMIC_SERIES_DIR}`);
        process.exit(1);
    }
    
    const count = await walkDir(COMIC_SERIES_DIR);
    console.log(`\nMigration complete! Successfully normalized ${count} page.json files.`);
}

run();
