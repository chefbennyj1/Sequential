const fs = require('fs').promises;
const path = require('path');

/**
 * api/standardizePageJs.js
 * Injects the panel_media_changed listener into all onPageLoad functions.
 */

const NEW_LISTENER = `
    container.addEventListener('panel_media_changed', (e) => {
        const { panelSelector, type, fileName, action } = e.detail;
        console.log('Panel ' + panelSelector + ' changed:', { type, fileName, action });
    });
`;

async function run() {
    const seriesPath = 'E:\\Comic Series\\No_Overflow';
    const volumesDir = path.join(seriesPath, 'Volumes');

    try {
        const volumeFolders = await fs.readdir(volumesDir);
        for (const vol of volumeFolders) {
            const volPath = path.join(volumesDir, vol);
            if (!(await fs.lstat(volPath)).isDirectory()) continue;

            const chapters = await fs.readdir(volPath);
            for (const chap of chapters) {
                const chapPath = path.join(volPath, chap);
                if (!(await fs.lstat(chapPath)).isDirectory() || !chap.startsWith('chapter-')) continue;

                const pages = await fs.readdir(chapPath);
                for (const page of pages) {
                    const pagePath = path.join(chapPath, page);
                    if (!(await fs.lstat(pagePath)).isDirectory() || !page.startsWith('page')) continue;

                    const jsPath = path.join(pagePath, 'page.js');
                    try {
                        await fs.access(jsPath);
                        let content = await fs.readFile(jsPath, 'utf8');

                        // Check if already exists
                        if (content.includes('panel_media_changed')) continue;

                        const lastBraceIndex = content.lastIndexOf('}');
                        if (lastBraceIndex !== -1) {
                            const updated = content.slice(0, lastBraceIndex) + NEW_LISTENER + content.slice(lastBraceIndex);
                            await fs.writeFile(jsPath, updated);
                            console.log(`  Updated: ${vol}/${chap}/${page}/page.js`);
                        }
                    } catch (e) { /* skip */ }
                }
            }
        }
        console.log("Consistency Update Complete.");
    } catch (err) {
        console.error("Update failed:", err);
    }
}

run();
