const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const { resolveSeriesPath } = require("../services/MediaService");
const { getSeriesFolderName, findVolumeId } = require('../services/HierarchyLookupService');
const Volume = require("../models/Volume");
const Series = require("../models/Series");
const VolumeService = require("../services/VolumeService");
const LayoutService = require("../services/LayoutService");

async function savePageDataAndSync(pageData, pageJsonPath, volume, chapter, pageId, seriesFolderName) {
    if (!pageData.header) pageData.header = {};
    pageData.header.lastUpdated = new Date();

    fs.writeFileSync(pageJsonPath, JSON.stringify(pageData, null, 2));

    // The user requested to disable auto-sync on every save to reduce DB load
    // The "Sync to DB" button in the visual editor handles this manually now.
    // const volumeId = await findVolumeId(volume, seriesFolderName);
    // if (volumeId) {
    //   await VolumeService.syncSinglePage(volumeId, chapter, pageId, seriesFolderName);
    // }
}

async function getPagePaths(series, volume, chapter, pageId) {
    const seriesFolderName = await getSeriesFolderName(series);
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const pageDir = path.join(seriesPath, "Volumes", volume, chapter, pageId);
    const pageJsonPath = path.join(pageDir, "page.json");
    return { seriesFolderName, seriesPath, pageDir, pageJsonPath };
}

exports.saveMedia = async (req, res) => {
  const { series, volume, chapter, pageId } = req.params;
  const { media } = req.body;

  if (!Array.isArray(media)) {
    return res.status(400).json({ ok: false, message: "Invalid media format" });
  }

  try {
    const { seriesFolderName, pageJsonPath } = await getPagePaths(series, volume, chapter, pageId);

    if (!fs.existsSync(pageJsonPath)) {
      return res.status(404).json({ ok: false, message: "Page not found" });
    }

    const pageData = JSON.parse(fs.readFileSync(pageJsonPath, "utf8"));
    const oldMedia = pageData.media || [];
    
    // Overwrite media and check for changes
    pageData.media = media;

    await savePageDataAndSync(pageData, pageJsonPath, volume, chapter, pageId, seriesFolderName);

    // --- AUTO-SCAN DISABLED ---
    // AI descriptions should only be triggered manually via the 'Analyze' button
    // to prevent server overload during active editing sessions.

    res.json({ ok: true, message: 'Media saved' });
    } catch (e) {
    console.error("saveMedia Error:", e);
    res.status(500).json({ ok: false, message: e.message });
    }
    };

exports.getMedia = async (req, res) => {
  const { series, volume, chapter, pageId } = req.params;
  try {
    const { pageDir, pageJsonPath } = await getPagePaths(series, volume, chapter, pageId);

    if (fs.existsSync(pageJsonPath)) {
      const pageData = JSON.parse(fs.readFileSync(pageJsonPath, "utf8"));
      res.json({
        ok: true,
        media: pageData.media || [],
        header: pageData.header || {},
        isSpread: LayoutService.resolveIsSpread(pageDir, pageId, pageData.header)
      });
    } else {
      res.json({ ok: true, media: [], header: {}, isSpread: false });
    }
  } catch (e) {
    res.status(500).json({ ok: false, message: "Failed to parse page data" });
  }
};

exports.getScene = async (req, res) => {
  const { series, volume, chapter, pageId } = req.params;
  try {
    const { pageJsonPath } = await getPagePaths(series, volume, chapter, pageId);

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
    const { seriesFolderName, pageDir, pageJsonPath } = await getPagePaths(series, volume, chapter, pageId);

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
    await savePageDataAndSync(pageData, pageJsonPath, volume, chapter, pageId, seriesFolderName);
    res.json({ ok: true, message: "Scene saved successfully.", scene: pageData.scene });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.syncPage = async (req, res) => {
  const { series, volumeId, chapter, pageId } = req.params;
  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const volumeDbId = await findVolumeId(volumeId, seriesFolderName);
    if (!volumeDbId) throw new Error("Volume not found");
    const result = await VolumeService.syncSinglePage(volumeDbId, chapter, pageId, seriesFolderName);
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
