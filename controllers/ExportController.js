const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const Series = require('../models/Series');

const INTERNAL_SECRET = 'sequential_internal_export_key_2026';

class ExportController {
    static async exportVolume(req, res) {
        const { series: seriesTitle, volume: volumeFolderName } = req.params;
        
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

            res.json({ ok: true, message: `Started DUAL-PAGE export of ${pagesToRender.length} spreads (Total ${pagesToRender.length * 2} print pages).` });

            const host = req.get('host');
            const baseUrl = `${req.protocol}://${host}`;

            ExportController.runPuppeteerExport(series.folderName, volumeFolderName, pagesToRender, exportDir, baseUrl);

        } catch (error) {
            console.error('Export Error:', error);
            if (!res.headersSent) res.status(500).json({ ok: false, message: error.message });
        }
    }

    static async runPuppeteerExport(series, volume, pagesToRender, exportDir, baseUrl) {
        console.log(`[EXPORT] Starting DUAL-PAGE Headless Browser...`);
        
        try {
            const browser = await puppeteer.launch({ 
                headless: 'new',
                args: ['--disable-web-security', '--no-sandbox']
            });
            const page = await browser.newPage();
            
            // VIEWPORT: 2 * 2480 (Width) x 3508 (Height)
            // This represents a landscape "Spread" composed of two portrait pages side-by-side.
            const PAGE_WIDTH = 2480;
            const PAGE_HEIGHT = 3508;

            await page.setViewport({ 
                width: PAGE_WIDTH * 2, 
                height: PAGE_HEIGHT, 
                deviceScaleFactor: 1 
            });

            for (let i = 0; i < pagesToRender.length; i++) {
                const target = pagesToRender[i];
                const pageNum = target.page.replace('page', '');
                const url = `${baseUrl}/viewer?series=${series}&volume=${volume}&chapter=${target.chapter}&page=${pageNum}&exportSecret=${INTERNAL_SECRET}`;
                
                console.log(`[EXPORT] (${i+1}/${pagesToRender.length}) Processing Spread: ${target.page}...`);
                
                try {
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
                    await page.waitForFunction(() => window.renderComplete === true, { timeout: 30000 });

                    // --- FORCE LANDSCAPE PRINT LAYOUT ---
                    await page.evaluate(() => {
                        // 1. Nuke UI and reset body
                        const hideList = ['.viewer-controls', '.nav-zone', '#loading-overlay', 'header', '.page-nav-buttons', '.debug-info'];
                        hideList.forEach(s => { 
                            document.querySelectorAll(s).forEach(el => el.style.setProperty('display', 'none', 'important')); 
                        });
                        
                        document.body.style.margin = '0';
                        document.body.style.padding = '0';
                        document.body.style.background = '#000';
                        document.documentElement.style.overflow = 'hidden';

                        // 2. Force Container to Fill the entire 2-Page Viewport
                        const container = document.querySelector('.section-container.active') || document.querySelector('.section-container');
                        if (container) {
                            // KILL ASPECT RATIOS AND MAX-DIMENSIONS
                            container.style.setProperty('aspect-ratio', 'unset', 'important');
                            container.style.setProperty('width', '100vw', 'important');
                            container.style.setProperty('height', '100vh', 'important');
                            container.style.setProperty('max-width', 'none', 'important');
                            container.style.setProperty('max-height', 'none', 'important');
                            
                            container.style.margin = '0';
                            container.style.padding = '0';
                            container.style.borderRadius = '0';
                            container.style.boxShadow = 'none';
                            container.style.border = 'none';
                            container.style.opacity = '1';
                            container.style.visibility = 'visible';
                            container.style.transform = 'none'; 
                            
                            // Adjust UI scale for the massive spread
                            document.documentElement.style.fontSize = '40px'; 
                            container.style.setProperty('--speech-bubble-scale', '2.5');
                            container.style.setProperty('--text-block-scale', '2.5');
                        }
                    });

                    await page.evaluateHandle('document.fonts.ready');
                    await new Promise(r => setTimeout(r, 4000)); 

                    // --- CAPTURE LEFT PAGE ---
                    const pageNumPadded = target.page.replace('page', '').padStart(3, '0');
                    const leftPath = path.join(exportDir, `page${pageNumPadded}a.png`);
                    await page.screenshot({ 
                        path: leftPath, 
                        clip: { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT }
                    });

                    // --- CAPTURE RIGHT PAGE ---
                    const rightPath = path.join(exportDir, `page${pageNumPadded}b.png`);
                    await page.screenshot({ 
                        path: rightPath, 
                        clip: { x: PAGE_WIDTH, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT }
                    });

                    console.log(`[EXPORT] SUCCESS: ${target.page}a and ${target.page}b saved.`);

                } catch (e) {
                    console.error(`[EXPORT] ERROR ${target.page}:`, e.message);
                }
            }

            await browser.close();
            console.log(`[EXPORT] Book Generation Complete. Files in: ${exportDir}`);

        } catch (err) {
            console.error('[EXPORT] CRITICAL ERROR:', err);
        }
    }
}

module.exports = ExportController;