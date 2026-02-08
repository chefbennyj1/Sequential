const fs = require('fs');
const path = require('path');

const LIBRARY_ROOT = 'E:/Comic Series/No_Overflow/Volumes';
const STOCK_MEDIA_ROOT = 'E:/stock_media';

if (!fs.existsSync(STOCK_MEDIA_ROOT)) {
    fs.mkdirSync(STOCK_MEDIA_ROOT, { recursive: true });
}

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------

function getAllFiles(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            getAllFiles(filePath, fileList);
        } else {
            fileList.push(filePath);
        }
    });
    return fileList;
}

function cleanupEmptyDirs(folder) {
    if (!fs.existsSync(folder)) return;
    const files = fs.readdirSync(folder);
    if (files.length > 0) {
        files.forEach(file => {
            const fullPath = path.join(folder, file);
            if (fs.statSync(fullPath).isDirectory()) {
                cleanupEmptyDirs(fullPath);
            }
        });
    }
    const remaining = fs.readdirSync(folder);
    if (remaining.length === 0) {
        fs.rmdirSync(folder);
    }
}

// Recursively walk an object/array and collect all strings
function extractStringsFromObject(obj, collectionSet) {
    if (!obj) return;
    if (typeof obj === 'string') {
        collectionSet.add(obj.toLowerCase());
        collectionSet.add(path.basename(obj).toLowerCase());
        return;
    }
    if (Array.isArray(obj)) {
        obj.forEach(item => extractStringsFromObject(item, collectionSet));
        return;
    }
    if (typeof obj === 'object') {
        Object.values(obj).forEach(val => extractStringsFromObject(val, collectionSet));
    }
}

// ---------------------------------------------------------
// Main Logic
// ---------------------------------------------------------

async function consolidateAssets() {
    console.log('Starting Robust Asset Consolidation (Final Attempt)...');

    const allFiles = getAllFiles(LIBRARY_ROOT);
    const pageJsonPaths = allFiles.filter(f => path.basename(f) === 'page.json');

    for (const pageFile of pageJsonPaths) {
        const pageDir = path.dirname(pageFile);
        const assetsDir = path.join(pageDir, 'assets');
        
        if (!fs.existsSync(assetsDir)) continue;

        let pageJson;
        try {
            pageJson = JSON.parse(fs.readFileSync(pageFile, 'utf-8'));
        } catch (e) {
            console.error(`Error parsing ${pageFile}:`, e);
            continue;
        }

        const pageId = (pageJson.header && pageJson.header.pageId) || path.basename(pageDir);
        let chapter = pageJson.header && pageJson.header.chapter;
        if (!chapter) {
            chapter = pageDir.split(path.sep).find(p => p.startsWith('chapter-')) || 'unknown';
        }

        // 1. Build Whitelist
        const references = new Set();
        extractStringsFromObject(pageJson, references);

        const pageJsPath = path.join(pageDir, 'page.js');
        let pageJsContent = "";
        if (fs.existsSync(pageJsPath)) {
            pageJsContent = fs.readFileSync(pageJsPath, 'utf-8').toLowerCase();
        }

        const pageCssPath = path.join(pageDir, 'page.css');
        let pageCssContent = "";
        if (fs.existsSync(pageCssPath)) {
            pageCssContent = fs.readFileSync(pageCssPath, 'utf-8').toLowerCase();
        }

        // 2. Scan Assets on Disk
        const diskAssets = getAllFiles(assetsDir);
        console.log(`[${pageId}] Checking ${diskAssets.length} assets...`);

        for (const absoluteFilePath of diskAssets) {
            const fileName = path.basename(absoluteFilePath);
            if (fileName.startsWith('.') || fileName === 'Thumbs.db') continue;

            const lowerName = fileName.toLowerCase();
            
            // Check if fileName is in JSON strings OR in JS/CSS text
            const isUsed = references.has(lowerName) || 
                           pageJsContent.includes(lowerName) || 
                           pageCssContent.includes(lowerName);

            if (!isUsed) {
                // MOVE
                const ext = path.extname(fileName);
                const nameNoExt = path.basename(fileName, ext);
                const newFileName = `${chapter}_${pageId}_${fileName}`;
                const destPath = path.join(STOCK_MEDIA_ROOT, newFileName);

                try {
                    if (fs.existsSync(destPath)) {
                        const tsName = `${chapter}_${pageId}_${nameNoExt}_${Date.now()}${ext}`;
                        fs.renameSync(absoluteFilePath, path.join(STOCK_MEDIA_ROOT, tsName));
                        console.log(`Moved (Dup): ${fileName} -> ${tsName}`);
                    } else {
                        fs.renameSync(absoluteFilePath, destPath);
                        console.log(`Moved: ${fileName} -> ${newFileName}`);
                    }
                } catch (err) {
                    console.error(`[ERROR] Failed to move ${fileName}:`, err.message);
                }
            }
        }

        cleanupEmptyDirs(assetsDir);
    }

    console.log('Consolidation Complete.');
}

consolidateAssets();