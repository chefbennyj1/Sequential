const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const Series = require('../models/Series');

const INTERNAL_SECRET = 'sequential_internal_export_key_2026';

class ExportController {
    static async exportVolume(req, res) {
        const { series: seriesTitle, volume: volumeFolderName } = req.params;
        const { portrait, landscape, pdf, preset } = req.query;

        try {
            const series = await Series.findOne({
                $or: [{ folderName: seriesTitle }, { title: seriesTitle }]
            }).populate('libraryRoot');

            if (!series) return res.status(404).json({ ok: false, message: 'Series not found' });

            let rootPath = series.sourcePath || path.join(series.libraryRoot.path, series.folderName);
            const volumePath = path.join(rootPath, 'Volumes', volumeFolderName);

            if (!fs.existsSync(volumePath)) return res.status(404).json({ ok: false, message: 'Volume folder not found' });

            const baseExportDir = path.join(rootPath, 'Print_Exports', volumeFolderName + '_Book_Pages');
            const activePreset = preset || 'uk-table';
            const exportDir = path.join(baseExportDir, activePreset);

            if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

            const pagesToRender = [];
            const chapters = fs.readdirSync(volumePath).filter(d => d.startsWith('chapter-')).sort();
            const targetPage = req.query.targetPage ? req.query.targetPage.trim() : null;

            for (const chapter of chapters) {
                const chapterPath = path.join(volumePath, chapter);
                const pages = fs.readdirSync(chapterPath, { withFileTypes: true })
                    .filter(d => d.isDirectory() && d.name.startsWith('page'))
                    .map(d => d.name)
                    .sort((a, b) => {
                        return parseInt(a.replace('page', '')) - parseInt(b.replace('page', ''));
                    });

                for (const pageId of pages) {
                    // Filter if targetPage is provided
                    if (targetPage) {
                        const numericTarget = targetPage.replace('page', '');
                        const numericCurrent = pageId.replace('page', '');
                        if (numericCurrent !== numericTarget) {
                            continue;
                        }
                    }

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
                landscape: landscape === 'true',
                pdf: pdf === 'true',
                preset: activePreset
            };

            ExportController.runPuppeteerExport(series.folderName, volumeFolderName, pagesToRender, exportDir, baseUrl, options);

        } catch (error) {
            console.error('Export Error:', error);
            if (!res.headersSent) res.status(500).json({ ok: false, message: error.message });
        }
    }

    static async exportScript(req, res) {
        const { series: seriesId, volume: volumeFolderName } = req.params;

        try {
            const series = await Series.findById(seriesId).populate('libraryRoot');
            if (!series) return res.status(404).json({ ok: false, message: 'Series not found' });

            let rootPath = series.sourcePath || path.join(series.libraryRoot.path, series.folderName);
            const volumePath = path.join(rootPath, 'Volumes', volumeFolderName);

            if (!fs.existsSync(volumePath)) return res.status(404).json({ ok: false, message: 'Volume folder not found' });

            let scriptContent = `SCRIPT EXPORT: ${series.title} - ${volumeFolderName}\nGenerated on: ${new Date().toLocaleString()}\n\n`;

            const chapters = fs.readdirSync(volumePath).filter(d => d.startsWith('chapter-')).sort();

            for (const chapter of chapters) {
                const chapterPath = path.join(volumePath, chapter);
                scriptContent += `\n=== CHAPTER: ${chapter.toUpperCase()} ===\n`;

                const pages = fs.readdirSync(chapterPath, { withFileTypes: true })
                    .filter(d => d.isDirectory() && d.name.startsWith('page'))
                    .map(d => d.name)
                    .sort((a, b) => parseInt(a.replace('page', '')) - parseInt(b.replace('page', '')));

                for (const pageId of pages) {
                    const jsonPath = path.join(chapterPath, pageId, 'page.json');
                    if (fs.existsSync(jsonPath)) {
                        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                        scriptContent += `\n--- ${pageId.toUpperCase()} ---\n`;

                        if (data.scene && Array.isArray(data.scene)) {
                            data.scene.forEach(item => {
                                if (item.text) {
                                    const speaker = item.character || 'UNKNOWN';
                                    // Strip HTML-like tags for the text file
                                    const cleanText = item.text.replace(/<br\s*\/?>/gi, '\n').replace(/\[.*?\]/g, '').trim();
                                    scriptContent += `[${speaker}] ${cleanText}\n`;
                                }
                            });
                        }
                    }
                }
            }

            const exportFileName = `${series.folderName}_${volumeFolderName}_Script.txt`;
            const exportFilePath = path.join(rootPath, exportFileName);

            fs.writeFileSync(exportFilePath, scriptContent, 'utf8');

            res.json({ ok: true, message: `Script exported successfully to: ${exportFileName}`, path: exportFileName });

        } catch (error) {
            console.error('Script Export Error:', error);
            res.status(500).json({ ok: false, message: error.message });
        }
    }

    static async runPuppeteerExport(series, volume, pagesToRender, exportDir, baseUrl, options) {
        console.log(`[EXPORT] Starting Bleed-Ready Headless Browser... Preset: ${options.preset}`);

        try {
            const browser = await puppeteer.launch({
                headless: 'new',
                args: ['--disable-web-security', '--no-sandbox']
            });
            const page = await browser.newPage();
            page.on('console', msg => console.log('[BROWSER]', msg.text()));

            // --- DIMENSION PRESETS (300 DPI + 3mm Bleed) ---
            let BLEED_WIDTH = 5031;  // UK Table (A3 Spread) Default
            let BLEED_HEIGHT = 3578;
            let PAGE_WIDTH = 2515;

            if (options.preset === 'us-landscape') {
                BLEED_WIDTH = 3146;
                BLEED_HEIGHT = 2058;
                PAGE_WIDTH = 1573;
            } else if (options.preset === 'cinematic-16-9') {
                BLEED_WIDTH = 3370;
                BLEED_HEIGHT = 1926;
                PAGE_WIDTH = 1685;
            } else if (options.preset === 'a4-landscape-letterbox') {
                // A4 Landscape: 297mm x 210mm
                // At 300 DPI with 3mm bleed: 3578 x 2515
                BLEED_WIDTH = 3578;
                BLEED_HEIGHT = 2515;
                PAGE_WIDTH = 1789; // Not used for splitting, but required by variable
            }

            const PAGE_HEIGHT = BLEED_HEIGHT;

            await page.setViewport({
                width: BLEED_WIDTH,
                height: BLEED_HEIGHT,
                deviceScaleFactor: 1
            });

            for (let i = 0; i < pagesToRender.length; i++) {
                const target = pagesToRender[i];
                const pageNum = target.page.replace('page', '');
                const url = `${baseUrl}/viewer?series=${series}&volume=${volume}&chapter=${target.chapter}&page=${pageNum}&exportSecret=${INTERNAL_SECRET}`;

                console.log(`[EXPORT] (${i + 1}/${pagesToRender.length}) Rendering ${target.page}...`);

                try {
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
                    await page.waitForFunction(() => window.renderComplete === true, { timeout: 30000 });
                    await page.waitForFunction(() => window.isRevealing !== true, { timeout: 30000 });

                    // --- FORCE PRINT LAYOUT (WHITE STAGE STRATEGY) ---
                    await page.evaluate((viewportW, viewportH, currentPreset) => {
                        const bleedPx = 35; // 3mm @ 300DPI
                        const hideList = ['.viewer-controls', '.nav-zone', '#loading-overlay', 'header', '.page-nav-buttons', '.debug-info', '#loading-page'];
                        hideList.forEach(s => { document.querySelectorAll(s).forEach(el => el.style.display = 'none'); });

                        // 1. Identify active content
                        const activeSection = document.querySelector('section.active') || document.querySelector('.page-container');
                        const container = activeSection ? activeSection.querySelector('.section-container') : null;
                        const layout = activeSection ? activeSection.querySelector('.page-layout') : null;

                        if (!container) return;

                        // 2. Clear the Body and Set Black "Bleed" Background
                        Array.from(document.body.children).forEach(child => { child.style.display = 'none'; });
                        document.documentElement.style.background = '#000';
                        document.body.style.background = '#000';
                        document.body.style.margin = '0';
                        document.body.style.padding = '0';
                        document.body.style.display = 'flex';
                        document.body.style.alignItems = 'center';
                        document.body.style.justifyContent = 'center';
                        document.body.style.width = viewportW + 'px';
                        document.body.style.height = viewportH + 'px';
                        document.documentElement.style.overflow = 'hidden';

                        // 3. Create the "Black Stage" (The Actual Page / Trim Area)
                        const stage = document.createElement('div');
                        stage.id = 'print-stage-black';
                        stage.style.background = '#000000'; // PAGE COLOR (Letterbox bars)
                        const trimW = viewportW - (bleedPx * 2);
                        const trimH = viewportH - (bleedPx * 2);
                        stage.style.width = trimW + 'px';
                        stage.style.height = trimH + 'px';
                        stage.style.position = 'relative';
                        stage.style.overflow = 'hidden';
                        stage.style.display = 'flex'; // Use flex to center the letterbox
                        stage.style.flexDirection = 'column';
                        stage.style.alignItems = 'center';
                        stage.style.justifyContent = 'center';
                        stage.style.boxSizing = 'border-box';

                        document.body.appendChild(stage);

                        // 4. Move container into the black stage
                        stage.appendChild(container);

                        // Determine container height based on physical paper size
                        let containerHeight = '100%';
                        // If viewport is A4 Landscape (3578 x 2515)
                        if (viewportW === 3578 && viewportH === 2515) {
                            // Force 16:9 mathematically
                            const letterboxH = Math.round(trimW / (16/9));
                            containerHeight = letterboxH + 'px';
                        }

                        // Position it perfectly inside the stage
                        container.style.setProperty('visibility', 'visible', 'important');
                        container.style.setProperty('opacity', '1', 'important');
                        container.style.setProperty('position', 'relative', 'important');
                        container.style.setProperty('top', '0', 'important');
                        container.style.setProperty('left', '0', 'important');
                        container.style.setProperty('width', '100%', 'important');
                        container.style.setProperty('height', containerHeight, 'important');
                        container.style.setProperty('min-height', containerHeight, 'important');
                        container.style.setProperty('max-height', containerHeight, 'important');
                        container.style.setProperty('margin', '0', 'important');
                        // Use a solid white background on the container to create the outer frame
                        container.style.setProperty('background', '#ffffff', 'important');
                        container.style.setProperty('border', 'none', 'important');
                        container.style.setProperty('box-shadow', 'none', 'important');
                        container.style.setProperty('transform', 'none', 'important');
                        container.style.setProperty('box-sizing', 'border-box', 'important');

                        if (layout) {
                            layout.style.setProperty('height', '100%', 'important');
                            layout.style.setProperty('width', '100%', 'important');
                            layout.style.setProperty('padding', '10px', 'important'); // Match 10px panel gap
                            layout.style.setProperty('margin', '0', 'important');
                            layout.style.setProperty('box-sizing', 'border-box', 'important');
                        }

                        // Apply box-sizing globally for print
                        const style = document.createElement('style');
                        style.textContent = '* { box-sizing: border-box !important; }';
                        document.head.appendChild(style);
                        
                        document.documentElement.style.fontSize = '38px'; 
                        container.style.setProperty('--speech-bubble-scale', '2.4');
                        container.style.setProperty('--text-block-scale', '2.4');

                        // Disable any memory/cloudy effects that use white backgrounds
                        document.querySelectorAll('.panel-effect-memory, .panel-effect-cloudy').forEach(p => {
                            p.style.setProperty('background-color', 'transparent', 'important');
                        });
                    }, BLEED_WIDTH, BLEED_HEIGHT, options.preset);
                    await page.evaluateHandle('document.fonts.ready');
                    await new Promise(r => setTimeout(r, 6000));

                    const pageNumPadded = target.page.replace('page', '').padStart(3, '0');

                    if (options.landscape) {
                        const fullPath = path.join(exportDir, `page${pageNumPadded}_FULL.png`);
                        await page.screenshot({
                            path: fullPath,
                            clip: { x: 0, y: 0, width: BLEED_WIDTH, height: BLEED_HEIGHT }
                        });
                    }

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
            console.log(`[EXPORT] PNG Export Completed.`);
            
            // Generate the final PDF if requested
            if (options.pdf) {
                await ExportController.convertToPDF(exportDir, volume);
            }

        } catch (err) {
            console.error('[EXPORT] CRITICAL ERROR:', err);
        }
    }

    static async convertToPDF(exportDir, volumeFolderName) {
        console.log(`[EXPORT] Converting PNGs to PDF...`);
        try {
            const files = fs.readdirSync(exportDir).filter(f => f.endsWith('.png')).sort();
            if (files.length === 0) {
                console.log(`[EXPORT] No PNG files found in ${exportDir} to convert.`);
                return;
            }

            const pdfDoc = await PDFDocument.create();

            for (const file of files) {
                const imagePath = path.join(exportDir, file);
                const imageBytes = fs.readFileSync(imagePath);
                const image = await pdfDoc.embedPng(imageBytes);
                
                const page = pdfDoc.addPage([image.width, image.height]);
                page.drawImage(image, {
                    x: 0,
                    y: 0,
                    width: image.width,
                    height: image.height,
                });
            }

            const pdfBytes = await pdfDoc.save();
            const pdfPath = path.join(exportDir, `${volumeFolderName}_print_ready.pdf`);
            fs.writeFileSync(pdfPath, pdfBytes);
            console.log(`[EXPORT] PDF successfully created at: ${pdfPath}`);

        } catch (error) {
            console.error('[EXPORT] Error creating PDF:', error);
        }
    }
}

module.exports = ExportController;