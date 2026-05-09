const fs = require('fs');
const path = require('path');
const VisionService = require('../services/VisionService');
const GlobalSettings = require('../models/GlobalSettings');
const Volume = require('../models/Volume');
const Series = require('../models/Series');
const { resolveSeriesPath } = require('../services/MediaService');

class VisionController {
    async processPendingDescriptions(req, res) {
        try {
            const results = await this.runVisionScan();
            res.json({ ok: true, message: "Vision scan complete.", results });
        } catch (err) {
            console.error("[Vision] Scan error:", err);
            res.status(500).json({ ok: false, message: err.message });
        }
    }

    async runVisionScan(io = null) {
        console.log("[Vision] Starting Vision Queue Processor...");
        
        const settings = await GlobalSettings.findOne({ key: "main" });
        if (!settings || !settings.vision.enabled) {
            console.log("[Vision] AI is disabled. Skipping.");
            return { processed: 0, skipped: 0 };
        }

        // 1. Find all volumes that have pages needing updates
        // We look for 'mediaData.media.DescriptionUpdateRequired': true in the chapters.pages array
        const volumes = await Volume.find({
            'chapters.pages.mediaData.media.DescriptionUpdateRequired': true
        }).populate('series');

        let totalProcessed = 0;

        for (const volume of volumes) {
            if (!volume.series) continue;

            const seriesPath = await resolveSeriesPath(volume.series.folderName);
            const volumeFolder = path.basename(volume.volumePath);
            const volumeAbsPath = path.join(seriesPath, 'Volumes', volumeFolder);

            for (const chapter of volume.chapters) {
                const chapterFolder = `chapter-${chapter.chapterNumber}`;
                const chapterAbsPath = path.join(volumeAbsPath, chapterFolder);

                for (const page of chapter.pages) {
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
                        if (mediaItem.DescriptionUpdateRequired && mediaItem.type === 'image' && mediaItem.fileName) {
                            const imagePath = path.join(pageAbsPath, 'assets', mediaItem.fileName);
                            if (fs.existsSync(imagePath)) {
                                if (io) io.emit('scanner_progress', { message: `> Analyzing ${pageFolder} | ${mediaItem.panel}...` });
                                
                                try {
                                    const description = await VisionService.analyzeImage(imagePath);
                                    mediaItem.description = description;
                                    mediaItem.alt = description; // Sync alt and description for now
                                    mediaItem.DescriptionUpdateRequired = false;
                                    pageChanged = true;
                                    totalProcessed++;
                                } catch (err) {
                                    console.error(`[Vision] Failed to analyze ${imagePath}:`, err.message);
                                }
                            } else {
                                console.warn(`[Vision] Image not found: ${imagePath}`);
                                mediaItem.DescriptionUpdateRequired = false;
                                pageChanged = true;
                            }
                        }
                    }

                    if (pageChanged) {
                        fs.writeFileSync(pageJsonPath, JSON.stringify(pageData, null, 2));
                        // We'll need to re-sync this page to the DB volume object too
                        // But for now, the next full scan will pick it up, or we can update the in-memory volume.
                    }
                }
            }
            
            // Re-sync the entire volume once done with it
            const VolumeService = require('../services/VolumeService');
            await VolumeService.updateChaptersFromFS(volume, volumeAbsPath);
        }

        console.log(`[Vision] Queue complete. Processed ${totalProcessed} images.`);
        return { processed: totalProcessed };
    }
}

module.exports = new VisionController();
