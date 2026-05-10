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
            const isQuick = req.body.quick === true;
            const results = await this.runVisionScan(req.app.locals.io, isQuick);
            res.json({ ok: true, message: `Vision ${isQuick ? 'Quick Scan' : 'Full Scan'} complete.`, results });
        } catch (err) {
            console.error("[Vision] Scan error:", err);
            res.status(500).json({ ok: false, message: err.message });
        }
    }

    async runVisionScan(io = null, quickScan = false) {
        if (this.isVisionScanRunning) {
            throw new Error("A vision scan is already in progress.");
        }

        console.log(`[Vision] Starting Vision ${quickScan ? 'Quick Scan (Hash Only)' : 'Queue Processor'}...`);
        this.isVisionScanRunning = true;
        
        const settings = await GlobalSettings.findOne({ key: "main" });
        if (!settings || !settings.vision.enabled) {
            console.log("[Vision] AI is disabled in settings. Skipping.");
            if (io) io.emit('scanner_progress', { message: "[Vision] AI is disabled. Skipping visual analysis." });
            this.isVisionScanRunning = false;
            return { processed: 0, skipped: 0 };
        }

        console.log(`[Vision] AI is enabled. ${quickScan ? 'Initializing hashes...' : 'Searching for pending descriptions...'}`);
        if (io) io.emit('scanner_progress', { message: `> Starting Vision ${quickScan ? 'Quick Scan' : 'AI Analysis'}...` });

        // 1. Find all volumes
        const volumes = await Volume.find({}).populate('series').lean();
        
        let totalProcessed = 0;

        try {
            for (const [vIdx, volume] of volumes.entries()) {
                if (!this.isVisionScanRunning) break;

                let volumeChanged = false; 
                
                if (!volume.series) continue;

                const seriesPath = await resolveSeriesPath(volume.series.folderName);
                const ignorePath = path.join(seriesPath, '.gemmaignore');
                if (fs.existsSync(ignorePath)) continue;

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

                        let pageChangedInLoop = false;
                        for (const mediaItem of (pageData.media || [])) {
                            if (!this.isVisionScanRunning) break;

                            if (mediaItem.type === 'image' && mediaItem.fileName) {
                                const imagePath = path.join(pageAbsPath, 'assets', 'image', mediaItem.fileName);
                                
                                if (fs.existsSync(imagePath)) {
                                    const currentHash = await VisionService.generateImageHash(imagePath);
                                    const hashChanged = currentHash && (mediaItem.imageHash !== currentHash);

                                    if (quickScan) {
                                        // QUICK MODE: Only update hash if missing or changed
                                        if (hashChanged) {
                                            console.log(`[Vision] [Quick] Updating hash for: ${pageFolder}/${mediaItem.panel}`);
                                            mediaItem.imageHash = currentHash;
                                            pageChangedInLoop = true;
                                            totalProcessed++;
                                        }
                                        continue;
                                    }

                                    // FULL MODE: Standard AI Logic
                                    const needsUpdate = mediaItem.DescriptionUpdateRequired || (!mediaItem.description && !mediaItem.alt);
                                    
                                    if (needsUpdate || hashChanged) {
                                        console.log(`[Vision] ${hashChanged ? 'Image changed (hash mismatch)' : 'Pending scan'}: ${pageFolder}/${mediaItem.panel}`);
                                        if (io) io.emit('scanner_progress', { message: `  > Analyzing ${pageFolder} | ${mediaItem.panel}...` });
                                        
                                        try {
                                            const description = await VisionService.analyzeImage(imagePath);
                                            mediaItem.description = description;
                                            mediaItem.alt = description;
                                            mediaItem.imageHash = currentHash;
                                            mediaItem.DescriptionUpdateRequired = false;
                                            
                                            pageChangedInLoop = true;
                                            totalProcessed++;
                                            if (io) io.emit('scanner_progress', { message: `  > Success: ${mediaItem.panel} described and saved.` });
                                        } catch (err) {
                                            console.error(`[Vision] Failed to analyze ${imagePath}:`, err.message);
                                        }
                                    }
                                }
                            }
                        }

                        if (pageChangedInLoop) {
                            fs.writeFileSync(pageJsonPath, JSON.stringify(pageData, null, 2));
                            volumeChanged = true;
                        }
                    }
                }
                
                if (volumeChanged) {
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

        const msg = `[Vision] ${quickScan ? 'Quick Scan' : 'Analysis'} complete. Processed ${totalProcessed} panels.`;
        console.log(msg);
        if (io) io.emit('scanner_progress', { message: msg });
        
        return { processed: totalProcessed };
    }
}

module.exports = new VisionController();
