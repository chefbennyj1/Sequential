const path = require('path');
const fs = require('fs');
const Volume = require('../models/Volume');
require('../models/Series'); // Ensure Series schema is registered

exports.getViewer = async (req, res) => {
  let volumeId = req.query.id;
  const seriesName = req.query.series;

  try {
    if (!volumeId && seriesName) {
      volumeId = await resolveVolumeFromSeries(seriesName, res);
      if (!volumeId) return; // resolveVolumeFromSeries handles the response
    }

    if (!volumeId) {
      return res.status(400).send("Volume ID or Series Name is required.");
    }

    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(volumeId)) {
      return res.status(400).send("Invalid Volume ID format.");
    }

    const volume = await Volume.findById(volumeId).populate('series').lean();
    if (!volume) {
      return res.status(404).send("Volume not found.");
    }

    const globalMedia = await loadGlobalMedia();

    res.render('viewer/index', { 
      volume,
      globalBackgroundAudio: globalMedia.backgroundAudio, 
      globalPageTransitionAudio: globalMedia.pageTransitionAudio,
      initialChapter: req.query.chapter || null,
      initialPage: req.query.page || null
    });

  } catch (err) {
    console.error("Viewer Controller Error:", err);
    res.status(500).send("Internal Server Error");
  }
};

async function resolveVolumeFromSeries(seriesName, res) {
  const Series = require('../models/Series');
  const series = await Series.findOne({ 
    $or: [
      { folderName: seriesName }, 
      { title: { $regex: new RegExp(`^${seriesName}$`, 'i') } }
    ] 
  }).populate('volumes');

  if (!series || !series.volumes || series.volumes.length === 0) {
    res.status(404).send(`Series "${seriesName}" found, but it has no volumes.`);
    return null;
  }

  series.volumes.sort((a, b) => a.index - b.index);
  return series.volumes[0]._id;
}

async function loadGlobalMedia() {
  const globalMediaFilePath = path.join(__dirname, '..', 'global_media.json');
  try {
    const data = await fs.promises.readFile(globalMediaFilePath, 'utf8');
    const parsed = JSON.parse(data);
    return {
      backgroundAudio: Array.isArray(parsed.backgroundAudio) ? parsed.backgroundAudio : [],
      pageTransitionAudio: parsed.pageTransition || ""
    };
  } catch {
    return { backgroundAudio: [], pageTransitionAudio: "" };
  }
}