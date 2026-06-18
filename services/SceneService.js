const fs = require('fs').promises;
const path = require('path');
const mongoose = require('mongoose');
const MediaService = require('./MediaService');

async function getSceneByPageId(volumeFolder, chapterId, pageId, seriesFolderName) {
  const { fetchPageDataField } = require('./SeriesLookupService');
  const result = await fetchPageDataField(volumeFolder, chapterId, pageId, seriesFolderName, 'sceneData', []);
  if (result.ok && result.sceneData) {
      result.scene = result.sceneData;
      delete result.sceneData;
  } else if (result.ok) {
      result.scene = [];
  }
  return result;
}

module.exports = { getSceneByPageId };