const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const GeminiVisionService = require('../services/gemini/GeminiVisionService');
const GlobalSettings = require('../models/GlobalSettings');
const Volume = require('../models/Volume');
const Series = require('../models/Series');
const Character = require('../models/Character');
const { resolveSeriesPath } = require('../services/MediaService');

class VisionController {
    constructor() {
        this.isVisionScanRunning = false;
        this.processPendingDescriptions = this.processPendingDescriptions.bind(this);
        this.stopVisionScan = this.stopVisionScan.bind(this);
        this.runVisionScan = this.runVisionScan.bind(this);
    }

    async stopVisionScan(req, res) {
        this.isVisionScanRunning = false;
        console.log('[Vision] Kill switch triggered. Stopping scan...');
        res.json({ ok: true, message: 'Vision scan stop requested.' });
    }

    async processPendingDescriptions(req, res) {
        try {
            const isQuick = req.body.quick === true;
            const isForce = req.body.force === true;
            const scope = req.body.scope || null;
            const results = await this.runVisionScan(req.app.locals.io, isQuick, isForce, scope);
            res.json({ ok: true, message: 'Vision scan complete.', results });
        } catch (err) {
            console.error('[Vision] Scan error:', err);
            res.status(500).json({ ok: false, message: err.message });
        }
    }

    // --- Orchestrator ---

    async runVisionScan(io = null, quickScan = false, forceRescan = false, scope = null) {
        if (this.isVisionScanRunning && scope) {
            console.log('[Vision] Scan already in progress. Skipping scoped auto-scan.');
            return { skipped: 1 };
        }
        if (this.isVisionScanRunning) throw new Error('A vision scan is already in progress.');

        const scanType = this._scanLabel(scope, quickScan, forceRescan);
        console.log(`[Vision] Starting Vision ${scanType}...`);
        if (io) io.emit('scanner_progress', { message: `> Starting Vision ${scanType}...` });

        this.isVisionScanRunning = true;

        const settings = await GlobalSettings.findOne({ key: 'main' });
        if (!settings?.vision?.enabled) {
            console.log('[Vision] AI is disabled in settings. Skipping.');
            if (io) io.emit('scanner_progress', { message: '[Vision] AI is disabled. Skipping visual analysis.' });
            this.isVisionScanRunning = false;
            return { processed: 0, skipped: 0 };
        }

        const volumes = await this._resolveVolumes(scope);
        let totalProcessed = 0;

        try {
            for (const volume of volumes) {
                if (!this.isVisionScanRunning) break;
                totalProcessed += await this._processVolume(volume, scope, quickScan, forceRescan, io);
            }
        } finally {
            this.isVisionScanRunning = false;
        }

        const msg = `[Vision] ${quickScan ? 'Quick Scan' : (forceRescan ? 'Force Rescan' : 'Analysis')} complete. Processed ${totalProcessed} panels.`;
        console.log(msg);
        if (io) io.emit('scanner_progress', { message: msg });

        return { processed: totalProcessed };
    }

    // --- Private Helpers ---

    _scanLabel(scope, quickScan, forceRescan) {
        if (scope) return `Scoped Scan (${scope.pageId})`;
        if (quickScan) return 'Quick Scan (Hash Only)';
        if (forceRescan) return 'FORCE Rescan (Full AI Overwrite)';
        return 'Gemini AI Queue Processor';
    }

    async _resolveVolumes(scope) {
        if (!scope?.volumeId && !scope?.seriesId) return Volume.find({}).populate('series').lean();

        const query = {};
        if (scope.seriesId) query.series = scope.seriesId;

        if (scope.volumeId) {
            if (!mongoose.Types.ObjectId.isValid(scope.volumeId)) {
                query._id = null;
            } else {
                query.$or = [{ _id: scope.volumeId }, { series: scope.volumeId }];
            }
        }

        return Volume.find(query).populate('series').lean();
    }

    async _buildCharacterContext(seriesId) {
        if (!seriesId) return '';
        try {
            const chars = await Character.find({ series: seriesId }).lean();
            if (chars.length === 0) return '';
            const lines = chars.map(c => `- ${c.name}: ${c.description || 'No description available'}`).join('\n');
            return `CONTEXT: The following characters may appear in these panels. Identify them if their physical traits match:\n${lines}`;
        } catch (e) {
            console.error('[Vision] Failed to load character context:', e.message);
            return '';
        }
    }

    async _processVolume(volume, scope, quickScan, forceRescan, io) {
        if (!volume.series) return 0;

        const seriesFolderName = volume.series?.folderName || volume.series;
        if (!seriesFolderName) {
            console.error('[Vision] Volume missing series reference:', volume._id);
            return 0;
        }

        const seriesPath = await resolveSeriesPath(seriesFolderName);
        if (fs.existsSync(path.join(seriesPath, '.gemmaignore'))) return 0;

        const characterContext = await this._buildCharacterContext(volume.series?._id || volume.series);
        const volumeFolder = path.basename(volume.volumePath);
        const volumeAbsPath = path.join(seriesPath, 'Volumes', volumeFolder);

        const chaptersToScan = scope?.chapter
            ? volume.chapters.filter(c => `chapter-${c.chapterNumber}` === scope.chapter)
            : volume.chapters;

        let totalProcessed = 0;
        let volumeChanged = false;

        for (const chapter of chaptersToScan) {
            if (!this.isVisionScanRunning) break;
            const { processed, changed } = await this._processChapter(
                chapter, scope, quickScan, forceRescan, io,
                { seriesFolderName, volumeFolder, volumeAbsPath, volumeId: volume._id, characterContext }
            );
            totalProcessed += processed;
            if (changed) volumeChanged = true;
        }

        if (volumeChanged && !scope) {
            const realVolume = await Volume.findById(volume._id);
            if (realVolume) {
                console.log(`[Vision] [Full] Syncing Volume ${volume.index} to DB...`);
                const VolumeService = require('../services/VolumeService');
                await VolumeService.updateChaptersFromFS(realVolume, volumeAbsPath);
            }
        }

        return totalProcessed;
    }

    async _processChapter(chapter, scope, quickScan, forceRescan, io, context) {
        const chapterFolder = `chapter-${chapter.chapterNumber}`;
        const chapterAbsPath = path.join(context.volumeAbsPath, chapterFolder);

        if (!fs.existsSync(chapterAbsPath)) return { processed: 0, changed: false };

        const pagesToScan = scope?.pageId
            ? chapter.pages.filter(p => `page${p.index}` === scope.pageId)
            : chapter.pages;

        let totalProcessed = 0;
        let anyChanged = false;

        for (const page of pagesToScan) {
            if (!this.isVisionScanRunning) break;
            const { processed, changed } = await this._processPage(
                page, scope, quickScan, forceRescan, io,
                { ...context, chapterFolder, chapterAbsPath }
            );
            totalProcessed += processed;
            if (changed) anyChanged = true;
        }

        return { processed: totalProcessed, changed: anyChanged };
    }

    async _processPage(page, scope, quickScan, forceRescan, io, context) {
        const pageFolder = `page${page.index}`;
        const pageAbsPath = path.join(context.chapterAbsPath, pageFolder);
        const pageJsonPath = path.join(pageAbsPath, 'page.json');

        if (!fs.existsSync(pageJsonPath)) return { processed: 0, changed: false };

        let pageData;
        try {
            pageData = JSON.parse(await fs.promises.readFile(pageJsonPath, 'utf8'));
        } catch (e) {
            return { processed: 0, changed: false };
        }

        let pageChanged = false;
        let totalProcessed = 0;

        for (const mediaItem of (pageData.media || [])) {
            if (!this.isVisionScanRunning) break;
            if (scope?.panelId && mediaItem.panel !== scope.panelId) continue;

            const processed = await this._processMediaItem(
                mediaItem, pageAbsPath, quickScan, forceRescan, io,
                { ...context, pageFolder }
            );
            if (processed) {
                pageChanged = true;
                totalProcessed++;
            }
        }

        if (!pageChanged) {
            if (scope?.pageId) console.log(`[Vision] No changes detected for ${pageFolder} in ${context.chapterFolder}.`);
            return { processed: 0, changed: false };
        }

        console.log(`[Vision] Writing updated page.json to: ${pageJsonPath}`);
        await fs.promises.writeFile(pageJsonPath, JSON.stringify(pageData, null, 2));

        if (scope) {
            console.log(`[Vision] [Scoped] Syncing DB for ${pageFolder}...`);
            const VolumeService = require('../services/VolumeService');
            await VolumeService.syncSinglePage(context.volumeId, context.chapterFolder, pageFolder, context.seriesFolderName);
        }

        return { processed: totalProcessed, changed: !scope };
    }

    async _processMediaItem(mediaItem, pageAbsPath, quickScan, forceRescan, io, context) {
        if (mediaItem.type !== 'image' || !mediaItem.fileName) return false;

        const imagePath = path.join(pageAbsPath, 'assets', 'image', mediaItem.fileName);
        if (!fs.existsSync(imagePath)) return false;

        await new Promise(r => setTimeout(r, 100));

        const currentHash = await GeminiVisionService.generateImageHash(imagePath);
        const hashChanged = currentHash && (mediaItem.imageHash !== currentHash);

        if (quickScan) {
            if (!hashChanged && mediaItem.imageHash) return false;
            console.log(`[Vision] [Quick] Updating hash for: ${context.pageFolder}/${mediaItem.panel}`);
            mediaItem.imageHash = currentHash;
            return true;
        }

        const needsUpdate = forceRescan || mediaItem.DescriptionUpdateRequired || !mediaItem.description || !mediaItem.alt;
        if (!needsUpdate && !hashChanged) return false;

        console.log(`[Vision] ${forceRescan ? 'FORCE RE-SCAN' : (hashChanged ? 'Image changed' : 'Pending scan')}: ${context.pageFolder}/${mediaItem.panel}`);
        if (io) io.emit('scanner_progress', { message: `  > Analyzing ${context.pageFolder} | ${mediaItem.panel}...` });

        try {
            const visionData = await GeminiVisionService.analyzeImage(imagePath, null, context.characterContext);

            mediaItem.description = visionData.description || '';
            mediaItem.alt = visionData.alt || '';
            mediaItem.hashtags = visionData.hashtags || [];
            mediaItem.imageHash = currentHash;
            mediaItem.DescriptionUpdateRequired = false;

            if (io) {
                io.emit('scanner_progress', { message: `  > Success: ${mediaItem.panel} updated.` });
                io.emit('panel_ai_updated', {
                    series: context.seriesFolderName,
                    volume: context.volumeFolder,
                    chapter: context.chapterFolder,
                    pageId: context.pageFolder,
                    panelId: mediaItem.panel,
                    description: mediaItem.description,
                    alt: mediaItem.alt,
                    hashtags: mediaItem.hashtags
                });
            }
            return true;
        } catch (err) {
            console.error(`[Vision] Failed to analyze ${imagePath}:`, err.message);
            if (io) {
                io.emit('scanner_progress', { message: `  > Error analyzing ${mediaItem.panel}: ${err.message}` });
                io.emit('panel_ai_error', {
                    series: context.seriesFolderName,
                    volume: context.volumeFolder,
                    chapter: context.chapterFolder,
                    pageId: context.pageFolder,
                    panelId: mediaItem.panel,
                    message: err.message
                });
            }
            return false;
        }
    }
}

module.exports = new VisionController();
