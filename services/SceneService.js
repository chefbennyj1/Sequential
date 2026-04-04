const fs = require('fs').promises;
const path = require('path');
const mongoose = require('mongoose');
const MediaService = require('./MediaService');

async function getSceneByPageId(volumeFolder, chapterId, pageId, seriesFolderName) {
  if (!seriesFolderName) throw new Error("seriesFolderName is required for getSceneByPageId");
  try {
    const Volume = require('../models/Volume');
    const Series = require('../models/Series');

    // 1. Resolve the series folder name and ID
    let query = { folderName: seriesFolderName };
    if (mongoose.Types.ObjectId.isValid(seriesFolderName)) {
        query = { _id: seriesFolderName };
    }
    const seriesDoc = await Series.findOne(query);
    if (!seriesDoc) return { ok: false, status: 404, message: "Series not found" };

    // 2. Construct search path to find the right volume WITHIN that series
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

    const scene = page.sceneData || [];

    console.log(`[SceneService] Serving cached scene for: ${pageId}`);
    return { ok: true, scene: scene };

  } catch (err) {
    console.error(`Error serving scene for ${pageId}:`, err);
    return { ok: false, status: 500, message: 'Internal Server Error' };
  }
}

module.exports = { getSceneByPageId };