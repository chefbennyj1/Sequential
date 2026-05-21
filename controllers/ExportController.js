const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const { convertToPdf } = require('../utils/screenplayToPdf');
const Series = require('../models/Series');
const ScriptService = require('../services/ScriptService');

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

            res.json({ ok: true, message: `Started background export of ${pagesToRender.length} pages.`, totalPages: pagesToRender.length });

            const host = req.get('host');
            const baseUrl = `${req.protocol}://${host}`;

            const options = {
                portrait: portrait === 'true',
                landscape: landscape === 'true',
                pdf: pdf === 'true',
                preset: activePreset,
                io: req.app.locals.io
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
            const result = await ScriptService.generateVolumeScript(seriesId, volumeFolderName);
            const txtPath = result.fileName;
            const pdfPath = txtPath.replace('.txt', '.pdf');

            // Generate PDF in background
            convertToPdf(txtPath, pdfPath).catch(err => console.error('[EXPORT] PDF generation failed:', err));

            res.json({ 
                ok: true, 
                message: `Screenplay exported successfully to TXT and PDF.`, 
                txtPath: txtPath,
                pdfPath: pdfPath
            });
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
            } else if (options.preset === 'us-portrait') {
                // US Comic Portrait: 6.625" x 10.25"
                // 300 DPI: 1988 x 3075
                // + 3mm bleed (35px): 2058 x 3146
                BLEED_WIDTH = 2058;
                BLEED_HEIGHT = 3146;
                PAGE_WIDTH = 2058; // Single page
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

            const totalPages = pagesToRender.length;
            for (let i = 0; i < totalPages; i++) {
                const target = pagesToRender[i];
                const pageNum = target.page.replace('page', '');
                // Add timestamp for cache busting
                let url = `${baseUrl}/viewer?series=${series}&volume=${volume}&chapter=${target.chapter}&page=${pageNum}&exportSecret=${INTERNAL_SECRET}&t=${Date.now()}`;
                
                if (options.preset === 'us-portrait') {
                    url += '&mode=portrait';
                }

                console.log(`[EXPORT] (${i + 1}/${totalPages}) Rendering ${target.page}...`);
                if (options.io) {
                    options.io.emit('export_progress', {
                        current: i + 1,
                        total: totalPages,
                        pageId: target.page,
                        status: `Rendering ${target.page}...`
                    });
                }

                try {
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
                    
                    // Wait for the application's own render flag
                    await page.waitForFunction(() => window.renderComplete === true, { timeout: 60000 });

                    // --- FORCE PRINT LAYOUT (WHITE STAGE STRATEGY) ---
                    const evalResult = await page.evaluate(async (viewportW, viewportH, currentPreset) => {
                        const bleedPx = 35; // 3mm @ 300DPI
                        const hideList = ['.viewer-controls', '.nav-zone', '#loading-overlay', 'header', '.page-nav-buttons', '.debug-info', '#loading-page'];
                        hideList.forEach(s => { document.querySelectorAll(s).forEach(el => el.style.display = 'none'); });

                        // 1. Identify active content
                        const activeSection = document.querySelector('section.active') || document.querySelector('.page-container');
                        if (!activeSection) {
                            console.error('[EXPORT] CRITICAL: No active section or page-container found!');
                            return { error: 'no-active-section' };
                        }

                        // --- ROBUST IMAGE LOADING CHECK ---
                        const waitForImages = async () => {
                            const imgs = Array.from(document.querySelectorAll('img'));
                            console.log(`[EXPORT] Found ${imgs.length} total images for verification.`);
                            
                            const loadPromises = imgs.map(img => {
                                if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
                                return new Promise(resolve => {
                                    img.onload = () => resolve();
                                    img.onerror = () => {
                                        console.error(`[EXPORT] Image failed to load: ${img.src}`);
                                        resolve(); // Resolve anyway to not hang
                                    };
                                    // Safety timeout per image
                                    setTimeout(resolve, 15000);
                                });
                            });
                            await Promise.all(loadPromises);
                        };

                        await waitForImages();

                        const container = activeSection.querySelector('.section-container');
                        const layout = activeSection.querySelector('.page-layout');

                        if (!container) {
                            console.error('[EXPORT] CRITICAL: No .section-container found in active section!');
                            return { error: 'no-container' };
                        }

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
                        
                        // Handle US Portrait specifically
                        if (currentPreset === 'us-portrait') {
                           // Force portrait aspect ratio for the content container
                           const aspect = 10.25 / 6.625; 
                           const contentH = Math.round(trimW * aspect);
                           containerHeight = contentH + 'px';
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
                            layout.style.setProperty('padding', '30px', 'important'); // Scaled from 10px
                            layout.style.setProperty('gap', '30px', 'important'); // Scaled from 10px
                            layout.style.setProperty('margin', '0', 'important');
                            layout.style.setProperty('box-sizing', 'border-box', 'important');
                        }

                        // Apply box-sizing globally for print
                        const style = document.createElement('style');
                        style.textContent = '* { box-sizing: border-box !important; }';
                        document.head.appendChild(style);
                        
                        // Apply dynamic font scaling based on viewport height
                        const baseFontSize = 14; // Target ~0.875rem @ 16px base
                        const baseHeight = 1080;
                        const scaleFactor = viewportH / baseHeight;
                        document.documentElement.style.fontSize = (baseFontSize * scaleFactor) + 'px'; 
                        
                        container.style.setProperty('--speech-bubble-scale', scaleFactor.toFixed(2));
                        container.style.setProperty('--text-block-scale', scaleFactor.toFixed(2));
                        container.style.setProperty('--panel-gap', (10 * scaleFactor) + 'px');
                        container.style.setProperty('--panel-padding', (10 * scaleFactor) + 'px');

                        // Brute Force CSS Injection for Speech Bubbles & Text Blocks
                        const overrideStyle = document.createElement('style');
                        overrideStyle.textContent = `
                            .speech-bubble-container {
                                width: auto !important;
                                min-width: 100px !important;
                            }
                            .super-bubble { 
                                font-size: ${(baseFontSize * scaleFactor).toFixed(2)}px !important;
                                padding: ${(10 * scaleFactor).toFixed(2)}px ${(15 * scaleFactor).toFixed(2)}px !important;
                                border-width: ${(3 * scaleFactor).toFixed(2)}px !important;
                                line-height: 1.1 !important;
                            }
                            .speech-text {
                                font-size: ${(baseFontSize * scaleFactor).toFixed(2)}px !important;
                                line-height: 1.1 !important;
                                -webkit-text-stroke: 0px transparent !important;
                            }
                            .text-block {
                                font-size: ${(16 * scaleFactor).toFixed(2)}px !important;
                                padding: ${(15 * scaleFactor).toFixed(2)}px !important;
                            }
                            .tail-container::before, .tail-container::after {
                                border-width: ${(15 * scaleFactor).toFixed(2)}px !important;
                            }
                            /* Fix for portrait mode scale inheritance */
                            .portrait-page .super-bubble, .portrait-page .speech-text {
                                font-size: ${(baseFontSize * scaleFactor).toFixed(2)}px !important;
                            }
                            /* Fix for missing images in Puppeteer: Force a compositing layer */
                            .panel img {
                                transform: translateZ(0);
                                backface-visibility: hidden;
                            }
                        `;
                        document.head.appendChild(overrideStyle);

                        // Disable any memory/cloudy effects that use white backgrounds
                        document.querySelectorAll('.panel-effect-memory, .panel-effect-cloudy').forEach(p => {
                            p.style.setProperty('background-color', 'transparent', 'important');
                        });

                        return { ok: true };
                    }, BLEED_WIDTH, BLEED_HEIGHT, options.preset);

                    if (evalResult.error) {
                        console.error(`[EXPORT] Evaluation failed for ${target.page}: ${evalResult.error}`);
                        continue; 
                    }

                    await page.evaluateHandle('document.fonts.ready');
                    await new Promise(r => setTimeout(r, 4000)); // Increased to 4s to ensure complex layouts/masks are fully stable

                    const pageNumPadded = target.page.replace('page', '').padStart(3, '0');

                    if (options.landscape && options.preset !== 'us-portrait') {
                        const fullPath = path.join(exportDir, `page${pageNumPadded}_FULL.png`);
                        await page.screenshot({
                            path: fullPath,
                            fullPage: false // Viewport is already set to BLEED_WIDTH/HEIGHT
                        });
                    }

                    if (options.portrait || options.preset === 'us-portrait') {
                        const fileName = options.preset === 'us-portrait' ? `page${pageNumPadded}_PORTRAIT.png` : `page${pageNumPadded}a.png`;
                        const leftPath = path.join(exportDir, fileName);
                        
                        // For portrait, we capture the left half of the spread (or full page if us-portrait)
                        await page.screenshot({
                            path: leftPath,
                            clip: { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT }
                        });

                        if (options.preset !== 'us-portrait') {
                            const rightPath = path.join(exportDir, `page${pageNumPadded}b.png`);
                            await page.screenshot({
                                path: rightPath,
                                clip: { x: PAGE_WIDTH, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT }
                            });
                        }
                    }

                    console.log(`[EXPORT] SUCCESS: ${target.page}`);

                } catch (e) {
                    console.error(`[EXPORT] ERROR ${target.page}:`, e.message);
                }
            }

            await browser.close();
            console.log(`[EXPORT] PNG Export Completed.`);
            
            if (options.io) {
                options.io.emit('export_progress', {
                    current: totalPages,
                    total: totalPages,
                    pageId: 'Finalizing',
                    status: options.pdf ? "PNGs complete. Generating PDF..." : "Export Complete!"
                });
            }

            // Generate the final PDF if requested
            if (options.pdf) {
                await ExportController.convertToPDF(exportDir, volume, options.io, totalPages);
                if (options.io) {
                    options.io.emit('export_progress', {
                        current: totalPages,
                        total: totalPages,
                        pageId: 'Complete',
                        status: "Export & PDF Complete!"
                    });
                }
            }

        } catch (err) {
            console.error('[EXPORT] CRITICAL ERROR:', err);
            if (options.io) {
                options.io.emit('export_progress', {
                    current: 0,
                    total: 1,
                    pageId: 'ERROR',
                    status: "Critical Export Error: " + err.message
                });
            }
        }
    }

    static async convertToPDF(exportDir, volumeFolderName, io = null, totalPages = 1) {
        console.log(`[EXPORT] Converting PNGs to PDF...`);
        try {
            const files = fs.readdirSync(exportDir).filter(f => f.endsWith('.png')).sort();
            if (files.length === 0) {
                console.log(`[EXPORT] No PNG files found in ${exportDir} to convert.`);
                return;
            }

            const pdfDoc = await PDFDocument.create();

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const imagePath = path.join(exportDir, file);
                
                if (io) {
                    io.emit('export_progress', {
                        current: totalPages,
                        total: totalPages,
                        pageId: `PDF: ${file}`,
                        status: `Embedding ${file} into PDF (${i + 1}/${files.length})...`
                    });
                }

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
            if (io) {
                io.emit('export_progress', {
                    current: totalPages,
                    total: totalPages,
                    pageId: 'PDF Error',
                    status: "PDF Generation failed: " + error.message
                });
            }
        }
    }
}

module.exports = ExportController;