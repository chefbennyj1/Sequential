const fs = require('fs');
const path = require('path');
const VisionService = require('../services/VisionService');
const GlobalSettings = require('../models/GlobalSettings');
const Volume = require('../models/Volume');
const Series = require('../models/Series');
const { resolveSeriesPath } = require('../services/MediaService');

class VisionController {
    constructor() {
        this.isVisionScanRunning = false;
    }

    async stopVisionScan(req, res) {
        this.isVisionScanRunning = false;
        console.log("[Vision] Kill switch triggered. Stopping scan...");
        res.json({ ok: true, message: "Vision scan stop requested." });
    }

    async processPendingDescriptions(req, res) {
        try {
            const results = await this.runVisionScan(req.app.locals.io);
            res.json({ ok: true, message: "Vision scan complete.", results });
        } catch (err) {
            console.error("[Vision] Scan error:", err);
            res.status(500).json({ ok: false, message: err.message });
        }
    }

    async runVisionScan(io = null) {
        if (this.isVisionScanRunning) {
            throw new Error("A vision scan is already in progress.");
        }

        console.log("[Vision] Starting Vision Queue Processor...");
        this.isVisionScanRunning = true;
        
        const settings = await GlobalSettings.findOne({ key: "main" });
        if (!settings || !settings.vision.enabled) {
            console.log("[Vision] AI is disabled in settings. Skipping.");
            if (io) io.emit('scanner_progress', { message: "[Vision] AI is disabled. Skipping visual analysis." });
            this.isVisionScanRunning = false;
            return { processed: 0, skipped: 0 };
        }

        console.log("[Vision] AI is enabled. Searching for pending descriptions...");
        if (io) io.emit('scanner_progress', { message: "> Starting Vision AI Analysis..." });

        // 1. Find all volumes
        const volumes = await Volume.find({}).populate('series').lean();
        console.log(`[Vision] DB Query returned ${volumes.length} total volumes.`);

        let totalProcessed = 0;

        try {
            for (const [vIdx, volume] of volumes.entries()) {
                if (!this.isVisionScanRunning) break;

                console.log(`[Vision] [${vIdx}] Examining: ${volume.volumePath}`);
                
                if (!volume.series) {
                    console.log(`[Vision] [${vIdx}] SKIP: No series linked to this volume document.`);
                    continue;
                }

                const seriesPath = await resolveSeriesPath(volume.series.folderName);
                
                // Check for .gemmaignore file
                const ignorePath = path.join(seriesPath, '.gemmaignore');
                if (fs.existsSync(ignorePath)) {
                    continue;
                }

                const volumeFolder = path.basename(volume.volumePath);
                const volumeAbsPath = path.join(seriesPath, 'Volumes', volumeFolder);

                for (const chapter of volume.chapters) {
                    if (!this.isVisionScanRunning) break;
                    const chapterFolder = `chapter-${chapter.chapterNumber}`;
                    const chapterAbsPath = path.join(volumeAbsPath, chapterFolder);

                    if (!fs.existsSync(chapterAbsPath)) continue;

                    for (const page of chapter.pages) {
                        if (!this.isVisionScanRunning) break;
                        const pageFolder = `page${page.index}`;
                        const pageAbsPath = path.join(chapterAbsPath, pageFolder);
                        const pageJsonPath = path.join(pageAbsPath, 'page.json');

                        if (!fs.existsSync(pageJsonPath)) continue;

                        let pageData;
                        try {
                            pageData = JSON.parse(fs.readFileSync(pageJsonPath, 'utf8'));
                        } catch (e) { continue; }

                        let pageChanged = false;
                        for (const mediaItem of (pageData.media || [])) {
                            if (!this.isVisionScanRunning) break;

                            // AGGREGATION LOGIC:
                            // 1. Must be an image with a filename.
                            // 2. Either 'DescriptionUpdateRequired' is true OR BOTH 'description' and 'alt' are missing/empty.
                            const needsUpdate = mediaItem.DescriptionUpdateRequired || (!mediaItem.description && !mediaItem.alt);
                            
                            if (needsUpdate && mediaItem.type === 'image' && mediaItem.fileName) {
                                const imagePath = path.join(pageAbsPath, 'assets', 'image', mediaItem.fileName);
                                
                                if (fs.existsSync(imagePath)) {
                                    console.log(`[Vision] Found image needing analysis: ${pageFolder}/${mediaItem.panel}`);
                                    if (io) io.emit('scanner_progress', { message: `  > Analyzing ${pageFolder} | ${mediaItem.panel}...` });
                                    
                                    try {
                                        const description = await VisionService.analyzeImage(imagePath);
                                        console.log(`[Vision] AI Result for ${mediaItem.panel}: "${description}"`);
                                        
                                        mediaItem.description = description;
                                        mediaItem.alt = description;
                                        mediaItem.DescriptionUpdateRequired = false;
                                        
                                        // CRITICAL: Write to disk immediately after each success!
                                        fs.writeFileSync(pageJsonPath, JSON.stringify(pageData, null, 2));
                                        
                                        pageChanged = true;
                                        totalProcessed++;

                                        if (io) io.emit('scanner_progress', { message: `  > Success: ${mediaItem.panel} described and saved.` });
                                    } catch (err) {
                                        console.error(`[Vision] Failed to analyze ${imagePath}:`, err.message);
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Re-sync the entire volume if we made changes
                if (pageChanged) {
                    const realVolume = await Volume.findById(volume._id);
                    if (realVolume) {
                        const VolumeService = require('../services/VolumeService');
                        await VolumeService.updateChaptersFromFS(realVolume, volumeAbsPath);
                    }
                }
            }
        } finally {
            this.isVisionScanRunning = false;
        }

        const msg = totalProcessed > 0 ? `[Vision] Analysis complete. Processed ${totalProcessed} images.` : "[Vision] No pending images found.";
        console.log(msg);
        if (io) io.emit('scanner_progress', { message: msg });
        
        return { processed: totalProcessed };
    }
}

module.exports = new VisionController();
