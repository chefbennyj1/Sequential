const VolumeManager = require("../services/VolumeService.js");
const VolumeModel = require('../models/Volume.js');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { validateAudioMap } = require('../utils/jsonValidators');
const { resolveSeriesPath } = require('../services/MediaService');

exports.createVolume = async (req, res) => {
  //TODO: alert the ui that an existing volume is there, and a new one was not made.
  const { index, title, volumePath, pages } = req.body;

  try {
    // Create new volume
    await VolumeManager.createVolume({ index, title, volumePath, pages });
    res.redirect('/dashboard'); // browser navigates back to dashboard
  } catch (err) {
    // Basic error handling - could be more specific
    console.error("Error creating volume:", err);
    res.status(500).redirect('/dashboard'); // Redirect with error status or message
  }
};

exports.getVolumes = async (req, res) => {
  try {
    // Fetch all volumes, returning _id, title, index, volumePath, and series for efficiency
    const volumes = await VolumeModel.find({}).select('_id title index volumePath series').sort({ index: 1 });
    
    res.json({ ok: true, volumes });

  } catch (err) {
    console.error("Error fetching volumes:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.getChapters = async (req, res) => {
  const { volumeId } = req.params;

  try {
    const volume = await VolumeModel.findById(volumeId).select('chapters');
    if (!volume) {
      return res.status(404).json({ ok: false, message: "Volume not found" });
    }

    // Return only _id, title, and chapterNumber for each chapter
    const chapters = volume.chapters.map(c => ({
      _id: c._id,
      title: c.title,
      chapterNumber: c.chapterNumber
    }));
    
    res.json({ ok: true, chapters });

  } catch (err) {
    console.error(`Error fetching chapters for volume ${volumeId}:`, err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.getChapterDetails = async (req, res) => {
  try {
    const { volumeId, chapterId } = req.params;
    console.log(`getChapterDetails called with: volumeId=${volumeId}, chapterId=${chapterId}`);
    let volume;

    // Resolve Volume
    if (volumeId.startsWith('volume-')) {
       // Assuming volumePath ends with the folder name, e.g. ".../volume-1"
       // We use a regex to match the end of the path, allowing for an optional trailing slash
       // Escape special regex characters in volumeId just in case
       const safeId = volumeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
       const regex = new RegExp(`${safeId}[\\\\/]?$`, 'i');
       console.log(`Searching for volume with path matching: ${regex}`);
       volume = await VolumeModel.findOne({ volumePath: regex }).select('chapters');
    } else {
       volume = await VolumeModel.findById(volumeId).select('chapters');
    }

    if (!volume) {
      console.log("Volume not found in DB.");
      return res.status(404).json({ ok: false, message: "Volume not found" });
    }
    console.log(`Volume found: ${volume._id}`);

    let chapter;
    // Resolve Chapter
    if (chapterId.startsWith('chapter-')) {
        const chapNum = parseInt(chapterId.replace('chapter-', ''), 10);
        console.log(`Looking for chapter number: ${chapNum}`);
        chapter = volume.chapters.find(c => c.chapterNumber === chapNum);
    } else {
        chapter = volume.chapters.id(chapterId);
    }

    if (!chapter) {
      console.log("Chapter not found in volume.");
      return res.status(404).json({ ok: false, message: "Chapter not found" });
    }

    res.json({ ok: true, chapter });

  } catch (err) {
    console.error(`Error fetching chapter ${req.params.chapterId} for volume ${req.params.volumeId}:`, err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.updateChapter = async (req, res) => {
  try {
    const { volumeId, chapterId } = req.params;
    const { title, chapterNumber, backgroundAudioSrc, backgroundAudioVolume, backgroundAudioLoop, dualAudio } = req.body;

    const result = await VolumeModel.updateOne(
      { "_id": volumeId, "chapters._id": chapterId },
      {
        "$set": {
          "chapters.$.title": title,
          "chapters.$.chapterNumber": chapterNumber,
          "chapters.$.backgroundAudioSrc": backgroundAudioSrc,
          "chapters.$.backgroundAudioVolume": backgroundAudioVolume,
          "chapters.$.backgroundAudioLoop": backgroundAudioLoop,
          "chapters.$.dualAudio": dualAudio
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ ok: false, message: "Chapter or Volume not found" });
    }

    res.json({ ok: true, message: "Chapter updated successfully." });

  } catch (err) {
    console.error(`Error updating chapter ${req.params.chapterId} for volume ${req.params.volumeId}:`, err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.getVolumeById = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ ok: false, message: "Missing Volume ID" });
  }

  try {
    let volume;
    if (mongoose.Types.ObjectId.isValid(id)) {
        volume = await VolumeModel.findById(id).populate('series').lean();
    } else {
        // Fallback: search by folder name in volumePath
        const safeId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
        const regex = new RegExp(`${safeId}[\\\\/]?$`, 'i');
        volume = await VolumeModel.findOne({ volumePath: regex }).populate('series').lean();
    }

    if (!volume) {
      return res.status(404).json({ ok: false, message: "Volume not found" });
    }

    // Return a new object that looks like the old 'volume' object for client compatibility
    res.json({
      ok: true,
      view: volume 
    });

  } catch (err) {
    console.error(`Error fetching volume data for ID ${id}:`, err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.getChapterPages = async (req, res) => {
  const { id, chapterNumber } = req.params;
  const chapNum = parseInt(chapterNumber, 10);

  if (!id || isNaN(chapNum)) {
    return res.status(400).json({ ok: false, message: "Missing or invalid Volume ID or Chapter Number" });
  }

  try {
    const volume = await VolumeModel.findById(id).populate('series').lean();
    if (!volume) {
      return res.status(404).json({ ok: false, message: "Volume not found" });
    }

    const chapter = volume.chapters.find(c => c.chapterNumber === chapNum);
    if (!chapter) {
      return res.status(404).json({ ok: false, message: "Chapter not found" });
    }

    const seriesFolderName = volume.series ? volume.series.folderName : "No_Overflow";
    const enrichedPages = chapter.pages.map(p => ({ ...p, series: seriesFolderName }));

    // Return a new object that looks like the old 'volume' object for client compatibility
    res.json({
      ok: true,
      view: {
        title: `${volume.title} - Chapter ${chapter.chapterNumber}`,
        pages: enrichedPages, // Includes layoutId, mediaData, sceneData AND series
        backgroundAudioSrc: chapter.backgroundAudioSrc,
        backgroundAudioVolume: chapter.backgroundAudioVolume,
        backgroundAudioLoop: chapter.backgroundAudioLoop,
        dualAudio: chapter.dualAudio
      }
    });

  } catch (err) {
    console.error(`Error fetching chapter data for volume ${id}, chapter ${chapNum}:`, err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.getAudioMap = async (req, res) => {
    const { volumeId } = req.params;
    
    let volumeFolder = volumeId;
    if (!volumeId.startsWith('volume-')) {
        const v = await VolumeModel.findById(volumeId).select('volumePath');
        if (v) volumeFolder = path.basename(v.volumePath);
    }
    
    try {
        const seriesPath = await resolveSeriesPath("No_Overflow");
        const mapPath = path.join(seriesPath, 'Volumes', volumeFolder, 'audio_map.json');
        
        if (fs.existsSync(mapPath)) {
            const data = fs.readFileSync(mapPath, 'utf8');
            res.json({ ok: true, map: JSON.parse(data) });
        } else {
            res.json({ ok: true, map: [] });
        }
    } catch (e) {
        console.error("Error reading audio map:", e);
        res.status(500).json({ ok: false, message: "Failed to read audio map" });
    }
};

exports.updateAudioMap = async (req, res) => {
    const { volumeId } = req.params;
    const { map } = req.body;
    
    let volumeFolder = volumeId;
    if (!volumeId.startsWith('volume-')) {
        const v = await VolumeModel.findById(volumeId).select('volumePath');
        if (v) volumeFolder = path.basename(v.volumePath);
    }

    try {
        const seriesPath = await resolveSeriesPath("No_Overflow");
        const mapPath = path.join(seriesPath, 'Volumes', volumeFolder, 'audio_map.json');
    
        const validatedMap = validateAudioMap(map);
        fs.writeFileSync(mapPath, JSON.stringify(validatedMap, null, 2));
        res.json({ ok: true, message: "Audio map updated." });
    } catch (e) {
        console.error("Error writing audio map:", e);
        if (e.message.startsWith("Invalid audio_map")) {
             res.status(400).json({ ok: false, message: e.message });
        } else {
             res.status(500).json({ ok: false, message: "Failed to write audio map" });
        }
    }
};
