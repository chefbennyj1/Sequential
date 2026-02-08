const fs = require('fs').promises;
const path = require('path');
const MediaService = require('./MediaService');

async function getSceneByPageId(volumeFolder, chapterId, pageId, seriesFolderName = "No_Overflow") {
  try {
    const Volume = require('../models/Volume');

    // Construct search path to find the right volume
    const volPathRegex = new RegExp(`${volumeFolder}[\\\\/]?$`, 'i');
    const volume = await Volume.findOne({ volumePath: volPathRegex });

    if (!volume) return { ok: false, status: 404, message: "Volume not found" };

    const chapterNum = parseInt(chapterId.replace('chapter-', ''));
    const chapter = volume.chapters.find(c => c.chapterNumber === chapterNum);
    if (!chapter) return { ok: false, status: 404, message: "Chapter not found" };

    const pageIndex = parseInt(pageId.replace('page', '')) || 0;
    const page = chapter.pages.find(p => p.index === pageIndex);

    if (!page) return { ok: false, status: 404, message: "Page not found" };

    let scene = page.sceneData || [];

    // Dynamic Audio Path Expansion
    const baseAudioPath = `/api/audio/${seriesFolderName}/${volumeFolder}/${chapterId}/${pageId}/assets/`;

    scene = scene.map(cue => {
      if (cue.audioSrc && !cue.audioSrc.includes('/') && !cue.audioSrc.includes(':')) {
        return { ...cue, audioSrc: baseAudioPath + cue.audioSrc };
      }
      return cue;
    });

    console.log(`[SceneService] Serving cached scene for: ${pageId}`);
    return { ok: true, scene: scene };

  } catch (err) {
    console.error(`Error serving scene for ${pageId}:`, err);
    return { ok: false, status: 500, message: 'Internal Server Error' };
  }
}

module.exports = { getSceneByPageId };