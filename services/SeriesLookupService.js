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

module.exports = { getSeriesFolderName, findVolumeId };
