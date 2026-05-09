const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const { resolveSeriesPath } = require("../services/MediaService");
const Volume = require("../models/Volume");
const Series = require("../models/Series");
const VolumeService = require("../services/VolumeService");

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

async function findVolumeId(volumeFolderName, seriesFolderName) {
  if (!seriesFolderName) throw new Error("seriesFolderName is required for findVolumeId");
  const seriesDoc = await Series.findOne({ folderName: seriesFolderName });
  const query = { volumePath: new RegExp(`[\\/]${volumeFolderName}$`) };
  if (seriesDoc) query.series = seriesDoc._id;
  
  const vol = await Volume.findOne(query);
  return vol ? vol._id : null;
}

exports.saveMedia = async (req, res) => {
  const { series, volume, chapter, pageId } = req.params;
  const { media } = req.body;

  if (!Array.isArray(media)) {
    return res.status(400).json({ ok: false, message: "Invalid media format" });
  }

  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const pageDir = path.join(seriesPath, "Volumes", volume, chapter, pageId);
    const pageJsonPath = path.join(pageDir, "page.json");

    if (!fs.existsSync(pageJsonPath)) {
      return res.status(404).json({ ok: false, message: "Page not found" });
    }

    const pageData = JSON.parse(fs.readFileSync(pageJsonPath, "utf8"));
    const oldMedia = pageData.media || [];
    
    // Overwrite media and check for changes
    pageData.media = media.map(newItem => {
        const existing = oldMedia.find(m => m.panel === newItem.panel);
        // If fileName changed or is new, mark for AI update
        if (!existing || existing.fileName !== newItem.fileName) {
            if (newItem.fileName && newItem.type === 'image') {
                newItem.DescriptionUpdateRequired = true;
            }
        }
        return newItem;
    });

    if (!pageData.header) pageData.header = {};
    pageData.header.lastUpdated = new Date();

    fs.writeFileSync(pageJsonPath, JSON.stringify(pageData, null, 2));

    const volumeId = await findVolumeId(volume, seriesFolderName);
    if (volumeId) {
      await VolumeService.syncSinglePage(volumeId, chapter, pageId, seriesFolderName);
    }

    // Trigger Background AI Scan if auto-scan is enabled
    const GlobalSettings = require('../models/GlobalSettings');
    const settings = await GlobalSettings.findOne({ key: "main" });
    if (settings?.vision?.enabled && settings?.vision?.autoScanOnSave) {
        const VisionController = require('./VisionController');
        // Run in background, don't await
        VisionController.runVisionScan().catch(err => console.error("[Vision] Background scan failed:", err));
    }

    res.json({ ok: true, message: "Media merged successfully." });
  } catch (err) {
    console.error("Save Media Error:", err);
    res.status(500).json({ ok: false, message: "Failed to save media" });
  }
};

exports.getMedia = async (req, res) => {
  const { series, volume, chapter, pageId } = req.params;
  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const pageDir = path.join(seriesPath, "Volumes", volume, chapter, pageId);
    const pageJsonPath = path.join(pageDir, "page.json");

    if (fs.existsSync(pageJsonPath)) {
      const pageData = JSON.parse(fs.readFileSync(pageJsonPath, "utf8"));
      res.json({ ok: true, media: pageData.media || [] });
    } else {
      res.json({ ok: true, media: [] });
    }
  } catch (e) {
    res.status(500).json({ ok: false, message: "Failed to parse page data" });
  }
};

exports.getScene = async (req, res) => {
  const { series, volume, chapter, pageId } = req.params;
  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const pageDir = path.join(seriesPath, "Volumes", volume, chapter, pageId);
    const pageJsonPath = path.join(pageDir, "page.json");

    if (fs.existsSync(pageJsonPath)) {
      const pageData = JSON.parse(fs.readFileSync(pageJsonPath, "utf8"));
      res.json({ ok: true, scene: pageData.scene || [] });
    } else {
      res.json({ ok: true, scene: [] });
    }
  } catch (e) {
    res.status(500).json({ ok: false, message: "Failed to parse page data" });
  }
};

exports.saveScene = async (req, res) => {
  const { series, volume, chapter, pageId } = req.params;
  const { v4: uuidv4 } = require("uuid");
  let sceneData = req.body;
  if (!Array.isArray(sceneData)) return res.status(400).json({ ok: false, message: "Invalid data format" });

  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const pageDir = path.join(seriesPath, "Volumes", volume, chapter, pageId);
    const pageJsonPath = path.join(pageDir, "page.json");

    if (!fs.existsSync(pageDir)) return res.status(404).json({ ok: false, message: "Page directory not found" });

    const seenIds = new Set();
    sceneData.forEach((item) => {
      if (!item.id || seenIds.has(item.id)) item.id = uuidv4();
      seenIds.add(item.id);
    });
    sceneData.forEach((item, index) => item.displayOrder = index);
    sceneData.sort((a, b) => a.displayOrder - b.displayOrder);

    let pageData = { header: {}, media: [], scene: [] };
    if (fs.existsSync(pageJsonPath)) pageData = JSON.parse(fs.readFileSync(pageJsonPath, 'utf8'));

    pageData.scene = sceneData;
    if (!pageData.header) pageData.header = {};
    pageData.header.lastUpdated = new Date();
    pageData.header.pageId = pageId;
    pageData.header.chapter = chapter;
    pageData.header.volume = volume;

    fs.writeFileSync(pageJsonPath, JSON.stringify(pageData, null, 2));

    const volumeId = await findVolumeId(volume, seriesFolderName);
    if (volumeId) {
      await VolumeService.syncSinglePage(volumeId, chapter, pageId, seriesFolderName);
    }
    res.json({ ok: true, message: "Scene saved successfully.", scene: pageData.scene });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.syncPage = async (req, res) => {
  const { volumeId, chapter, pageId } = req.params;
  try {
    const result = await VolumeService.syncSinglePage(volumeId, chapter, pageId);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.getPlotBoard = async (req, res) => {
  const { series } = req.params;
  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const plotPath = path.join(seriesPath, 'plot_board.json');

    if (fs.existsSync(plotPath)) {
      const data = JSON.parse(fs.readFileSync(plotPath, 'utf8'));
      res.json({ ok: true, board: data });
    } else {
      res.json({ ok: true, board: [] });
    }
  } catch (e) {
    console.error("getPlotBoard Error:", e);
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.savePlotBoard = async (req, res) => {
  const { series } = req.params;
  const { board } = req.body;
  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const plotPath = path.join(seriesPath, 'plot_board.json');

    fs.writeFileSync(plotPath, JSON.stringify(board, null, 2));
    res.json({ ok: true, message: 'Plot board saved' });
  } catch (e) {
    console.error("savePlotBoard Error:", e);
    res.status(500).json({ ok: false, message: e.message });
  }
};
