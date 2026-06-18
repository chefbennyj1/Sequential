/**
 * services/SeriesLookupService.js
 * Shared helpers for resolving series and volume identifiers.
 * Used by multiple editor controllers to normalize incoming route params.
 */
const mongoose = require('mongoose');
const Series = require('../models/Series');
const Volume = require('../models/Volume');

/**
 * Resolves a series identifier (ObjectId or folderName) to a folderName string.
 * Falls back to returning the identifier as-is if no DB match is found.
 */
async function getSeriesFolderName(identifier) {
  if (!identifier) return null;
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    try {
      const series = await Series.findById(identifier);
      if (series) return series.folderName;
    } catch (e) { console.error("Error resolving series ID:", e); }
  }
  try {
    const seriesByFolder = await Series.findOne({ folderName: identifier });
    if (seriesByFolder) return seriesByFolder.folderName;
  } catch (e) { }
  return identifier;
}

/**
 * Resolves a volume folder name + series folder name to a Volume ObjectId.
 */
async function findVolumeId(volumeFolderName, seriesFolderName) {
  if (!seriesFolderName) throw new Error("seriesFolderName is required for findVolumeId");
  const seriesDoc = await Series.findOne({ folderName: seriesFolderName });
  const query = { volumePath: new RegExp(`[\\\\/]${volumeFolderName}$`) };
  if (seriesDoc) query.series = seriesDoc._id;
  
  const vol = await Volume.findOne(query);
  return vol ? vol._id : null;
}

/**
 * Resolves a full page hierarchy (Series -> Volume -> Chapter -> Page)
 */
async function resolvePageHierarchy(volumeFolder, chapterId, pageId, seriesFolderName) {
  if (!seriesFolderName) throw new Error("seriesFolderName is required");

  let query = { folderName: seriesFolderName };
  if (mongoose.Types.ObjectId.isValid(seriesFolderName)) {
      query = { _id: seriesFolderName };
  }
  const seriesDoc = await Series.findOne(query);
  if (!seriesDoc) return { ok: false, status: 404, message: "Series not found" };

  const volPathRegex = new RegExp(`${volumeFolder}[\\\\/]?$`, 'i');
  const volume = await Volume.findOne({ 
      volumePath: volPathRegex,
      series: seriesDoc._id 
  });
  
  if (!volume) return { ok: false, status: 404, message: "Volume not found in this series" };

  const chapterNum = parseInt(chapterId.replace('chapter-', ''));
  const chapter = volume.chapters.find(c => c.chapterNumber === chapterNum);
  if (!chapter) return { ok: false, status: 404, message: "Chapter not found" };

  const pageIndex = parseInt(pageId.replace('page', '')) || 0;
  const page = chapter.pages.find(p => p.index === pageIndex);
  
  if (!page) return { ok: false, status: 404, message: "Page not found" };

  return { ok: true, page };
}

/**
 * Helper to fetch a specific data field from a page's resolved hierarchy.
 */
async function fetchPageDataField(volumeFolder, chapterId, pageId, seriesFolderName, fieldName, defaultValue) {
  try {
    const result = await resolvePageHierarchy(volumeFolder, chapterId, pageId, seriesFolderName);
    if (!result.ok) return result;

    console.log(`[SeriesLookupService] Serving cached ${fieldName} for: ${pageId}`);
    return { ok: true, [fieldName]: result.page[fieldName] || defaultValue };
  } catch (err) {
    console.error(`Error serving ${fieldName} for ${pageId}:`, err);
    return { ok: false, status: 500, message: 'Internal Server Error' };
  }
}

module.exports = { getSeriesFolderName, findVolumeId, resolvePageHierarchy, fetchPageDataField };
