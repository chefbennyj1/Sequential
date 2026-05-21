const fs = require('fs');
const path = require('path');
const GeminiVisionService = require('../services/gemini/GeminiVisionService');
const GlobalSettings = require('../models/GlobalSettings');
const Volume = require('../models/Volume');
const Series = require('../models/Series');
const Character = require('../models/Character');
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
            const isForce = req.body.force === true;
            const scope = req.body.scope || null;
            
            const results = await this.runVisionScan(req.app.locals.io, isQuick, isForce, scope);
            res.json({ ok: true, message: `Vision scan complete.`, results });
        } catch (err) {
            console.error("[Vision] Scan error:", err);
            res.status(500).json({ ok: false, message: err.message });
        }
    }

    async runVisionScan(io = null, quickScan = false, forceRescan = false, scope = null) {
        if (this.isVisionScanRunning) {
            // If it's a scoped scan and one is already running, just skip it to avoid overhead
            if (scope) {
                console.log("[Vision] Scan already in progress. Skipping scoped auto-scan.");
                return { skipped: 1 };
            }
            throw new Error("A vision scan is already in progress.");
        }

        const scanType = scope ? `Scoped Scan (${scope.pageId})` : (quickScan ? 'Quick Scan (Hash Only)' : (forceRescan ? 'FORCE Rescan (Full AI Overwrite)' : 'Gemini AI Queue Processor'));
        console.log(`[Vision] Starting Vision ${scanType}...`);
        this.isVisionScanRunning = true;
        
        const settings = await GlobalSettings.findOne({ key: "main" });
        if (!settings || !settings.vision.enabled) {
            console.log("[Vision] AI is disabled in settings. Skipping.");
            if (io) io.emit('scanner_progress', { message: "[Vision] AI is disabled. Skipping visual analysis." });
            this.isVisionScanRunning = false;
            return { processed: 0, skipped: 0 };
        }

        console.log(`[Vision] AI is enabled. ${quickScan ? 'Initializing hashes...' : (forceRescan ? 'Re-analyzing all panels...' : 'Searching for pending descriptions...')}`);
        if (io) io.emit('scanner_progress', { message: `> Starting Vision ${scanType}...` });

        // 1. Determine volumes to scan
        let volumes;
        if (scope && (scope.volumeId || scope.seriesId)) {
            const query = {};
            if (scope.volumeId) {
                // Backward compatibility: check if volumeId is actually a series ID
                const isValidId = mongoose.Types.ObjectId.isValid(scope.volumeId);
                if (isValidId) {
                    query.$or = [
                        { _id: scope.volumeId },
                        { series: scope.volumeId }
                    ];
                } else {
                    query._id = null; // Invalid ID
                }
            }
            if (scope.seriesId) query.series = scope.seriesId;
            
            volumes = await Volume.find(query).populate('series').lean();
        } else {
            volumes = await Volume.find({}).populate('series').lean();
        }
        
        let totalProcessed = 0;

        try {
            for (const [vIdx, volume] of volumes.entries()) {
                if (!this.isVisionScanRunning) break;

                let volumeChanged = false; 
                
                if (!volume.series) continue;

                // --- FETCH CHARACTER CONTEXT FOR THIS SERIES ---
                let characterContext = "";
                try {
                    const seriesId = volume.series?._id || volume.series;
                    if (seriesId) {
                        const chars = await Character.find({ series: seriesId }).lean();
                        if (chars.length > 0) {
                            characterContext = "CONTEXT: The following characters may appear in these panels. Identify them if their physical traits match:\n" + 
                                chars.map(c => `- ${c.name}: ${c.description || 'No description available'}`).join('\n');
                        }
                    }
                } catch (e) {
                    console.error("[Vision] Failed to load character context:", e.message);
                }

                const seriesFolderName = volume.series?.folderName || volume.series;
                if (!seriesFolderName) {
                    console.error("[Vision] Volume missing series reference:", volume._id);
                    continue;
                }

                const seriesPath = await resolveSeriesPath(seriesFolderName);
                const ignorePath = path.join(seriesPath, '.gemmaignore');
                if (fs.existsSync(ignorePath)) continue;

                const volumeFolder = path.basename(volume.volumePath);
                const volumeAbsPath = path.join(seriesPath, 'Volumes', volumeFolder);

                const chaptersToScan = scope && scope.chapter ? volume.chapters.filter(c => `chapter-${c.chapterNumber}` === scope.chapter) : volume.chapters;

                for (const chapter of chaptersToScan) {
                    if (!this.isVisionScanRunning) break;
                    const chapterFolder = `chapter-${chapter.chapterNumber}`;
                    const chapterAbsPath = path.join(volumeAbsPath, chapterFolder);

                    if (!fs.existsSync(chapterAbsPath)) continue;

                    const pagesToScan = scope && scope.pageId ? chapter.pages.filter(p => `page${p.index}` === scope.pageId) : chapter.pages;

                    for (const page of pagesToScan) {
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

                            // Scoped Panel Check: Skip if we are targeting a specific panel and this isn't it
                            if (scope && scope.panelId && mediaItem.panel !== scope.panelId) continue;

                            if (mediaItem.type === 'image' && mediaItem.fileName) {
                                const imagePath = path.join(pageAbsPath, 'assets', 'image', mediaItem.fileName);
                                
                                if (fs.existsSync(imagePath)) {
                                    // Small delay to prevent IO slamming
                                    await new Promise(r => setTimeout(r, 100));

                                    const currentHash = await GeminiVisionService.generateImageHash(imagePath);
                                    const hashChanged = currentHash && (mediaItem.imageHash !== currentHash);

                                    if (quickScan) {
                                        // QUICK MODE: Only update hash if missing or changed
                                        if (hashChanged || !mediaItem.imageHash) {
                                            console.log(`[Vision] [Quick] Updating hash for: ${pageFolder}/${mediaItem.panel}`);
                                            mediaItem.imageHash = currentHash;
                                            pageChangedInLoop = true;
                                            totalProcessed++;
                                        }
                                        continue;
                                    }

                                    // FULL MODE: Standard AI Logic
                                    const needsUpdate = forceRescan || mediaItem.DescriptionUpdateRequired || (!mediaItem.description || !mediaItem.alt);
                                    
                                    if (needsUpdate || hashChanged) {
                                        console.log(`[Vision] ${forceRescan ? 'FORCE RE-SCAN' : (hashChanged ? 'Image changed' : 'Pending scan')}: ${pageFolder}/${mediaItem.panel}`);
                                        if (io) io.emit('scanner_progress', { message: `  > Analyzing ${pageFolder} | ${mediaItem.panel}...` });
                                        
                                        try {
                                            const visionData = await GeminiVisionService.analyzeImage(imagePath, null, characterContext);
                                            
                                            // Save structured data
                                            mediaItem.description = visionData.description || "";
                                            mediaItem.alt = visionData.alt || "";
                                            mediaItem.hashtags = visionData.hashtags || [];
                                            
                                            mediaItem.imageHash = currentHash;
                                            mediaItem.DescriptionUpdateRequired = false;
                                            
                                            pageChangedInLoop = true;
                                            totalProcessed++;
                                            
                                            if (io) {
                                                io.emit('scanner_progress', { message: `  > Success: ${mediaItem.panel} updated.` });
                                                // Real-time UI update event
                                                io.emit('panel_ai_updated', {
                                                    series: seriesFolderName,
                                                    volume: volumeFolder,
                                                    chapter: chapterFolder,
                                                    pageId: pageFolder,
                                                    panelId: mediaItem.panel,
                                                    description: mediaItem.description,
                                                    alt: mediaItem.alt,
                                                    hashtags: mediaItem.hashtags
                                                });
                                            }
                                        } catch (err) {
                                            console.error(`[Vision] Failed to analyze ${imagePath}:`, err.message);
                                            if (io) {
                                                io.emit('scanner_progress', { message: `  > Error analyzing ${mediaItem.panel}: ${err.message}` });
                                                io.emit('panel_ai_error', {
                                                    series: seriesFolderName,
                                                    volume: volumeFolder,
                                                    chapter: chapterFolder,
                                                    pageId: pageFolder,
                                                    panelId: mediaItem.panel,
                                                    message: err.message
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        if (pageChangedInLoop) {
                            console.log(`[Vision] Writing updated page.json to: ${pageJsonPath}`);
                            fs.writeFileSync(pageJsonPath, JSON.stringify(pageData, null, 2));
                            
                            // If it's a scoped scan, sync DB for THIS PAGE ONLY
                            if (scope) {
                                console.log(`[Vision] [Scoped] Syncing DB for ${pageFolder}...`);
                                const VolumeService = require('../services/VolumeService');
                                await VolumeService.syncSinglePage(volume._id, chapterFolder, pageFolder, seriesFolderName);
                            } else {
                                volumeChanged = true;
                            }
                        } else if (scope && scope.pageId) {
                            console.log(`[Vision] No changes detected for ${pageFolder} in ${chapterFolder}.`);
                        }
                    }
                }
                
                if (volumeChanged && !scope) {
                    const realVolume = await Volume.findById(volume._id);
                    if (realVolume) {
                        console.log(`[Vision] [Full] Syncing Volume ${volume.index} to DB...`);
                        const VolumeService = require('../services/VolumeService');
                        await VolumeService.updateChaptersFromFS(realVolume, volumeAbsPath);
                    }
                }
            }
        } finally {
            this.isVisionScanRunning = false;
        }

        const msg = `[Vision] ${quickScan ? 'Quick Scan' : (forceRescan ? 'Force Rescan' : 'Analysis')} complete. Processed ${totalProcessed} panels.`;
        console.log(msg);
        if (io) io.emit('scanner_progress', { message: msg });
        
        return { processed: totalProcessed };
    }
}

module.exports = new VisionController();


