const fs = require('fs').promises;
const path = require('path');
const mongoose = require('mongoose');
const sharp = require('sharp');
const mime = require('mime-types');
const Series = require('../models/Series');
const LibraryRoot = require('../models/LibraryRoot');

// Helper to resolve series path dynamically
async function resolveSeriesPath(seriesIdentifier) {
    let query = { folderName: seriesIdentifier };
    if (mongoose.Types.ObjectId.isValid(seriesIdentifier)) {
        query = { _id: seriesIdentifier };
    }

    const series = await Series.findOne(query).populate('libraryRoot');
    if (series && series.libraryRoot && series.libraryRoot.path) {
        return path.join(series.libraryRoot.path, series.folderName);
    }
    // Fallback to internal (using folderName if series exists, else identifier)
    const folderName = series ? series.folderName : seriesIdentifier;
    return path.join(__dirname, '..', 'Library', folderName);
}

async function serveImage(imagePath, resizeWidth, seriesFolderName) {
    if (!seriesFolderName) throw new Error("seriesFolderName is required for serveImage");
    try {
        const seriesPath = await resolveSeriesPath(seriesFolderName);
        
        // Remove 'volumes/' or 'Volumes/' prefix from imagePath if it exists to avoid duplication
        const cleanPath = imagePath.replace(/^[Vv]olumes[\/\\]/, '');
        const filePath = path.join(seriesPath, 'Volumes', cleanPath);

        await fs.access(filePath);

        const type = mime.lookup(filePath) || 'image/png';

        if (resizeWidth && !isNaN(resizeWidth)) {
            const cacheDir = path.join(__dirname, '..', 'cache');
            
            try {
                await fs.access(cacheDir);
            } catch {
                await fs.mkdir(cacheDir);
            }

            const cacheFile = path.join(cacheDir, `${resizeWidth}_${path.basename(filePath)}`);

            try {
                await fs.access(cacheFile);
                return { ok: true, path: cacheFile, type: type };
            } catch {
                await sharp(filePath)
                    .concurrency(1)
                    .resize({ width: resizeWidth })
                    .toFile(cacheFile);

                return { ok: true, path: cacheFile, type: type };
            }
        }

        return { ok: true, path: filePath, type: type };

    } catch (err) {
        console.error('Error serving image:', err);
        if (err.code === 'ENOENT') {
            return { ok: false, status: 404, message: 'Image not found' };
        }
        return { ok: false, status: 500, message: 'Internal Server Error' };
    }
}

async function getAssetPath(volume, chapter, page, file, seriesFolderName) {
    if (!seriesFolderName) throw new Error("seriesFolderName is required for getAssetPath");
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    return path.join(seriesPath, "Volumes", volume, chapter, page, "assets", file);
}

async function getMediaItemsByPageId(volumeFolder, chapterId, pageId, seriesFolderName) {
  const { fetchPageDataField } = require('./SeriesLookupService');
  const result = await fetchPageDataField(volumeFolder, chapterId, pageId, seriesFolderName, 'mediaData', { media: [] });
  if (result.ok && result.mediaData) {
      result.media = result.mediaData;
      delete result.mediaData;
  }
  return result;
}

async function findCoverImage(dirPath, baseName) {
    const extensions = ['png', 'jpg', 'jpeg', 'webp'];
    for (const ext of extensions) {
        const fileName = `${baseName}.${ext}`;
        const filePath = path.join(dirPath, fileName);
        try {
            await fs.access(filePath);
            return fileName; // Return just the filename if found
        } catch (e) {
            // File doesn't exist, continue
        }
    }
    return null;
}


module.exports = { serveImage, getAssetPath, getMediaItemsByPageId, findCoverImage, resolveSeriesPath };