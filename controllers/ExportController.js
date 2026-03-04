const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const Series = require('../models/Series');

const INTERNAL_SECRET = 'sequential_internal_export_key_2026';

class ExportController {
    static async exportVolume(req, res) {
        const { series: seriesTitle, volume: volumeFolderName } = req.params;
        const { portrait, landscape } = req.query;
        
        try {
            const series = await Series.findOne({
                $or: [{ folderName: seriesTitle }, { title: seriesTitle }]
            }).populate('libraryRoot');

            if (!series) return res.status(404).json({ ok: false, message: 'Series not found' });

            let rootPath = series.sourcePath || path.join(series.libraryRoot.path, series.folderName);
            const volumePath = path.join(rootPath, 'Volumes', volumeFolderName);
            
            if (!fs.existsSync(volumePath)) return res.status(404).json({ ok: false, message: 'Volume folder not found' });

            const exportDir = path.join(rootPath, 'Print_Exports', volumeFolderName + '_Book_Pages');
            if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

            const pagesToRender = [];
            const chapters = fs.readdirSync(volumePath).filter(d => d.startsWith('chapter-')).sort();
            for (const chapter of chapters) {
                const chapterPath = path.join(volumePath, chapter);
                const pages = fs.readdirSync(chapterPath, { withFileTypes: true })
                    .filter(d => d.isDirectory() && d.name.startsWith('page'))
                    .map(d => d.name)
                    .sort((a, b) => {
                        return parseInt(a.replace('page', '')) - parseInt(b.replace('page', ''));
                    });
                
                for (const pageId of pages) {
                    const jsonPath = path.join(chapterPath, pageId, 'page.json');
                    if (fs.existsSync(jsonPath)) {
                        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                        if ((!data.media || data.media.length === 0) && (!data.scene || data.scene.length === 0)) continue;
                    }
                    pagesToRender.push({ chapter, page: pageId });
                }
            }

            res.json({ ok: true, message: `Started background export of ${pagesToRender.length} pages.` });

            const host = req.get('host');
            const baseUrl = `${req.protocol}://${host}`;

            const options = {
                portrait: portrait === 'true',
                landscape: landscape === 'true'
            };

            ExportController.runPuppeteerExport(series.folderName, volumeFolderName, pagesToRender, exportDir, baseUrl, options);

        } catch (error) {
            console.error('Export Error:', error);
            if (!res.headersSent) res.status(500).json({ ok: false, message: error.message });
        }
    }

    static async runPuppeteerExport(series, volume, pagesToRender, exportDir, baseUrl, options) {
        console.log(`[EXPORT] Starting Bleed-Ready Headless Browser...`);
        
        try {
            const browser = await puppeteer.launch({ 
                headless: 'new',
                args: ['--disable-web-security', '--no-sandbox']
            });
            const page = await browser.newPage();
            page.on('console', msg => console.log('[BROWSER]', msg.text()));
            
            // --- DIMENSIONS FOR FULL BLEED (A3 Spread + 3mm bleed) ---
            // Trim Size (A3): 420mm x 297mm (4960 x 3508 px @ 300dpi)
            // Bleed Size: 426mm x 303mm (approx 5031 x 3578 px @ 300dpi)
            const BLEED_WIDTH = 5031;
            const BLEED_HEIGHT = 3578;
            const PAGE_WIDTH = 2515; // Half of total bleed width

            await page.setViewport({ 
                width: BLEED_WIDTH, 
                height: BLEED_HEIGHT, 
                deviceScaleFactor: 1 
            });

            for (let i = 0; i < pagesToRender.length; i++) {
                const target = pagesToRender[i];
                const pageNum = target.page.replace('page', '');
                const url = `${baseUrl}/viewer?series=${series}&volume=${volume}&chapter=${target.chapter}&page=${pageNum}&exportSecret=${INTERNAL_SECRET}`;
                
                console.log(`[EXPORT] (${i+1}/${pagesToRender.length}) Rendering ${target.page} (Bleed Included)...`);
                
                try {
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
                    await page.waitForFunction(() => window.renderComplete === true, { timeout: 30000 });

                    // --- FORCE PRINT LAYOUT WITH SAFE ZONES ---
                    await page.evaluate(() => {
                        const hideList = ['.viewer-controls', '.nav-zone', '#loading-overlay', 'header', '.page-nav-buttons', '.debug-info'];
                        hideList.forEach(s => { document.querySelectorAll(s).forEach(el => el.style.setProperty('display', 'none', 'important')); });
                        
                        document.body.style.margin = '0';
                        document.body.style.padding = '0';
                        document.body.style.background = '#000';
                        document.documentElement.style.overflow = 'hidden';

                        const container = document.querySelector('.section-container.active') || document.querySelector('.section-container');
                        if (container) {
                            container.style.setProperty('aspect-ratio', 'unset', 'important');
                            container.style.setProperty('width', '100vw', 'important');
                            container.style.setProperty('height', '100vh', 'important');
                            container.style.setProperty('max-width', 'none', 'important');
                            container.style.setProperty('max-height', 'none', 'important');
                            
                            // PRINT SAFE ZONE: 
                            // We add 0.25 inch (approx 38px) of padding inside the bleed area 
                            // to ensure text stays away from the cut line.
                            container.style.padding = '40px'; 
                            container.style.boxSizing = 'border-box';

                            container.style.margin = '0';
                            container.style.borderRadius = '0';
                            container.style.boxShadow = 'none';
                            container.style.border = 'none';
                            container.style.opacity = '1';
                            container.style.visibility = 'visible';
                            container.style.transform = 'none'; 
                            
                            document.documentElement.style.fontSize = '42px'; // Adjusted for bleed viewport
                            container.style.setProperty('--speech-bubble-scale', '2.6');
                            container.style.setProperty('--text-block-scale', '2.6');
                        }
                    });

                    await page.evaluateHandle('document.fonts.ready');
                    await new Promise(r => setTimeout(r, 3000)); 

                    const pageNumPadded = target.page.replace('page', '').padStart(3, '0');

                    // 1. CAPTURE FULL SPREAD (Landscape)
                    if (options.landscape) {
                        const fullPath = path.join(exportDir, `page${pageNumPadded}_FULL.png`);
                        await page.screenshot({ path: fullPath });
                    }

                    // 2. CAPTURE SPLIT PAGES (Portrait)
                    if (options.portrait) {
                        const leftPath = path.join(exportDir, `page${pageNumPadded}a.png`);
                        await page.screenshot({ 
                            path: leftPath, 
                            clip: { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT }
                        });

                        const rightPath = path.join(exportDir, `page${pageNumPadded}b.png`);
                        await page.screenshot({ 
                            path: rightPath, 
                            clip: { x: PAGE_WIDTH, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT }
                        });
                    }

                    console.log(`[EXPORT] SUCCESS: ${target.page}`);

                } catch (e) {
                    console.error(`[EXPORT] ERROR ${target.page}:`, e.message);
                }
            }

            await browser.close();
            console.log(`[EXPORT] Completed.`);

        } catch (err) {
            console.error('[EXPORT] CRITICAL ERROR:', err);
        }
    }
}

module.exports = ExportController;