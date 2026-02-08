const fs = require('fs');
const path = require('path');

const LIBRARY_ROOT = 'E:/Comic Series/No_Overflow/Volumes';
const STOCK_MEDIA_ROOT = 'E:/stock_media';

function findPageDir(pageId) {
    // Recursive search for the directory containing a page.json with this pageId
    function search(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                const result = search(fullPath);
                if (result) return result;
            } else if (file === 'page.json') {
                const json = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
                if (json.header && json.header.pageId === pageId) {
                    return path.dirname(fullPath);
                }
            }
        }
        return null;
    }
    return search(LIBRARY_ROOT);
}

function getSubfolder(ext) {
    ext = ext.toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(ext)) return 'image';
    if (['.mp4', '.webm', '.mov', '.avi'].includes(ext)) return 'video';
    if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) return 'audio';
    return '';
}

async function revert() {
    console.log('Starting Revert...');
    const files = fs.readdirSync(STOCK_MEDIA_ROOT);

    for (const file of files) {
        if (file.startsWith('chapter-') || file.startsWith('undefined_')) {
            // Pattern: {chapter}_{pageId}_{originalName}
            // Note: originalName might contain underscores, so we split carefully.
            const parts = file.split('_');
            const chapter = parts[0];
            const pageId = parts[1];
            
            // Reconstruct original name
            // If it was timestamped, it looks like {chapter}_{pageId}_{name}_{timestamp}.{ext}
            // But my script added the timestamp BEFORE the extension.
            // Let's just take everything after the second underscore.
            let originalName = parts.slice(2).join('_');
            
            // Check for timestamp suffix (e.g. _1769799913712.png)
            const ext = path.extname(originalName);
            const nameWithoutExt = path.basename(originalName, ext);
            const timestampRegex = /_\d{13}$/;
            if (timestampRegex.test(nameWithoutExt)) {
                originalName = nameWithoutExt.replace(timestampRegex, '') + ext;
                console.log(`Restoring original name: ${originalName} (removed timestamp)`);
            }

            console.log(`Processing ${file} -> Target Page: ${pageId}`);

            const pageDir = findPageDir(pageId);
            if (!pageDir) {
                console.error(`[ERROR] Could not find directory for pageId: ${pageId}`);
                continue;
            }

            const subfolder = getSubfolder(ext);
            const targetAssetsDir = path.join(pageDir, 'assets', subfolder);
            
            if (!fs.existsSync(targetAssetsDir)) {
                fs.mkdirSync(targetAssetsDir, { recursive: true });
            }

            const sourcePath = path.join(STOCK_MEDIA_ROOT, file);
            const destPath = path.join(targetAssetsDir, originalName);

            try {
                if (fs.existsSync(destPath)) {
                    console.warn(`[WARNING] Destination already exists: ${destPath}. Skipping.`);
                } else {
                    fs.renameSync(sourcePath, destPath);
                    console.log(`Reverted: ${file} -> ${destPath}`);
                }
            } catch (err) {
                console.error(`[ERROR] Failed to move ${file}:`, err.message);
            }
        }
    }
    console.log('Revert Complete.');
}

revert();
