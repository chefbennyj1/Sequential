const path = require('path');
const fs = require('fs');
const Volume = require('../models/Volume');
require('../models/Series'); // Ensure Series schema is registered

exports.getViewer = async (req, res) => {
  // Volume ID is passed as a query param (e.g., /viewer?id=...)
  // OR Series Folder Name (e.g., /viewer?series=No_Overflow)
  let volumeId = req.query.id;
  const seriesName = req.query.series;

  try {
    // If no Volume ID, but Series is provided, find the first volume
    if (!volumeId && seriesName) {
      const Series = require('../models/Series');
      // Find series by folderName or title
      const series = await Series.findOne({ 
          $or: [
              { folderName: seriesName }, 
              { title: { $regex: new RegExp(`^${seriesName}$`, 'i') } }
          ] 
      }).populate('volumes');

      if (series && series.volumes && series.volumes.length > 0) {
        // Sort volumes by index to find the first one
        series.volumes.sort((a, b) => a.index - b.index);
        volumeId = series.volumes[0]._id;
      } else {
         return res.status(404).send(`Series "${seriesName}" found, but it has no volumes.`);
      }
    }

    if (!volumeId) {
      return res.status(400).send("Volume ID or Series Name is required.");
    }

    // Validate ID format to prevent CastError
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(volumeId)) {
        return res.status(400).send("Invalid Volume ID format.");
    }

    // 1. Fetch Volume with populated Series info
    const volume = await Volume.findById(volumeId).populate('series').lean();
    
    if (!volume) {
      return res.status(404).send("Volume not found.");
    }

    // 2. Load Global Media (Legacy Support)
    let globalBackgroundAudio = [];
    let globalPageTransitionAudio = "";
    const globalMediaFilePath = path.join(__dirname, '..', 'global_media.json');
    
    try {
      const globalMediaData = await fs.promises.readFile(globalMediaFilePath, 'utf8');
      const globalMedia = JSON.parse(globalMediaData);
      if (globalMedia.backgroundAudio && Array.isArray(globalMedia.backgroundAudio)) {
        globalBackgroundAudio = globalMedia.backgroundAudio;
      }
      if (globalMedia.pageTransition) {
        globalPageTransitionAudio = globalMedia.pageTransition;
      }
    } catch (error) {
      // Silently fail if global_media.json is missing or invalid
    }

    // 3. Render Viewer
    // We pass the volume data directly to the template to reduce client-side API calls
    res.render('viewer/index', { 
      volume,
      globalBackgroundAudio, 
      globalPageTransitionAudio,
      // Pass query params for initial page/chapter selection
      initialChapter: req.query.chapter || null,
      initialPage: req.query.page || null
    });

  } catch (err) {
    console.error("Viewer Controller Error:", err);
    res.status(500).send("Internal Server Error");
  }
};