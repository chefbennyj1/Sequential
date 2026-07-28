const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const { resolveSeriesPath } = require("../services/MediaService");
const { getSeriesFolderName, findVolumeId } = require('../services/HierarchyLookupService');
const Volume = require("../models/Volume");
const Series = require("../models/Series");
const VolumeService = require("../services/VolumeService");
const NotificationService = require("../services/NotificationService");

/**
 * Shared by insertChapter/insertPage: alerts the acting user when a shift
 * broke print-spread alignment (see checkSpreadIntegrity in VolumeService.js).
 * Links to the FIRST broken page by its post-shift name — compromisedSpreads
 * entries carry both oldIndex/pageId (pre-shift, already stale by the time
 * this runs) and newIndex (the folder's actual current name), so newIndex is
 * what must be used here.
 */
async function notifyCompromisedSpreads(req, { series, volume, compromisedSpreads }) {
  if (!compromisedSpreads || compromisedSpreads.length === 0) return;
  if (!req.session?.userId) return;

  const first = [...compromisedSpreads].sort((a, b) => a.newIndex - b.newIndex)[0];
  const firstPageId = `page${first.newIndex}`;

  const title = compromisedSpreads.length === 1
    ? "1 page spread broken by an insert"
    : `${compromisedSpreads.length} page spreads broken by an insert`;

  const body = `Inserting pages pushed ${compromisedSpreads.length} page(s) out of print-spread alignment, starting at ${firstPageId}. Insert one more page immediately before it to restore alignment for the rest of the book.`;

  try {
    await NotificationService.create({
      user: req.session.userId,
      source: 'System',
      title,
      body,
      link: { series, volume, chapter: first.chapter, pageId: firstPageId }
    }, req.app.locals.io);
  } catch (err) {
    console.error("[PageStructureController] Failed to create spread-break notification:", err);
  }
}

exports.createPage = async (req, res) => {
  const { series, volume, chapter, pageId, layout } = req.body;

  if (!volume || !chapter || !pageId || !layout) {
    return res.status("400").json({ ok: false, message: "Missing required fields" });
  }

  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const volumesDir = path.join(seriesPath, "Volumes");
    const pageDir = path.join(volumesDir, volume, chapter, pageId);

    if (fs.existsSync(pageDir)) {
      return res.status("400").json({ ok: false, message: "Page already exists" });
    }

    fs.mkdirSync(pageDir, { recursive: true });
    fs.mkdirSync(path.join(pageDir, "assets", "image"), { recursive: true });

    const layoutId = layout.replace(".html", "");
    const pageJson = {
      header: {
        version: "2.0",
        layout: { id: layoutId, html: `${layoutId}.html`, css: "" }
      },
      media: [],
      scene: []
    };

    const css = `@import url('/layouts/styles/base-comic-layout.css');\n\n/* Add page-specific styles here */\n.${pageId} {\n\n}`;
    const js = "export async function onPageLoad(container, pageInfo) {\n" +
      "    container.addEventListener('view_visible', async () => {\n" +
      "        console.log(`Page ${pageInfo.pageId} is visible.`);\n" +
      "    });\n\n" +
      "    container.addEventListener('view_hidden', () => {\n" +
      "        console.log(`Page ${pageInfo.pageId} is hidden.`);\n" +
      "    });\n\n" +
      "    container.addEventListener('panel_media_changed', (e) => {\n" +
      "        const { panelSelector, type, fileName, action } = e.detail;\n" +
      "        console.log(`Panel ${panelSelector} changed:`, { type, fileName, action });\n" +
      "    });\n" +
      "}";

    fs.writeFileSync(path.join(pageDir, `page.css`), css);
    fs.writeFileSync(path.join(pageDir, `page.js`), js);
    fs.writeFileSync(path.join(pageDir, `page.json`), JSON.stringify(pageJson, null, 2));

    const volumeId = await findVolumeId(volume, seriesFolderName);
    if (volumeId) {
      const Volume = require('../models/Volume');
      const vol = await Volume.findById(volumeId);
      if (vol) await VolumeService.updateChaptersFromFS(vol);
    }
    res.json({ ok: true, message: `Page ${pageId} created successfully.`, path: pageDir });
  } catch (err) {
    console.error("Scaffolding Error:", err);
    res.status(500).json({ ok: false, message: "Failed to create page structure" });
  }
};

exports.getNextPageId = async (req, res) => {
  const { series, volume, chapter } = req.query;
  if (!series || !volume || !chapter) {
    return res.status(400).json({ ok: false, message: "Missing required parameters" });
  }
  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const chapterPath = path.join(seriesPath, "Volumes", volume, chapter);

    if (!fs.existsSync(chapterPath)) return res.json({ ok: true, nextPageId: "page0" });

    const folders = fs.readdirSync(chapterPath).filter(f => 
      f.startsWith("page") && fs.statSync(path.join(chapterPath, f)).isDirectory()
    );

    let maxNum = -1;
    folders.forEach(f => {
      const num = parseInt(f.replace("page", ""));
      if (!isNaN(num) && num > maxNum) maxNum = num;
    });
    res.json({ ok: true, nextPageId: `page${maxNum + 1}` });
  } catch (err) {
    console.error("Next Page ID Error:", err);
    res.status(500).json({ ok: false, message: "Failed to determine next page ID" });
  }
};

exports.insertPage = async (req, res) => {
  const { series, volume, chapter, insertPoint } = req.body;
  if (!series || !volume || !chapter || insertPoint === undefined) {
    return res.status(400).json({ ok: false, message: "Missing required fields" });
  }
  try {
    const result = await VolumeService.insertPage({ series, volume, chapter, insertPoint });
    await notifyCompromisedSpreads(req, { series, volume, compromisedSpreads: result.compromisedSpreads });
    res.json(result);
  } catch (err) {
    console.error("Insert Page Error:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
};

exports.reorderPages = async (req, res) => {
  const { series, volume, chapter, newOrder } = req.body;
  if (!series || !volume || !chapter || !newOrder) {
    return res.status(400).json({ ok: false, message: "Missing required fields: series, volume, chapter, newOrder" });
  }
  try {
    const result = await VolumeService.reorderPages({ series, volume, chapter, newOrder });
    res.json(result);
  } catch (err) {
    console.error("Reorder Pages Error:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
};

exports.getChapterRange = async (req, res) => {
  const { series, volume, chapter } = req.query;
  if (!series || !volume || !chapter) {
    return res.status(400).json({ ok: false, message: "Missing required parameters" });
  }
  try {
    const range = await VolumeService.getChapterRange({ series, volume, chapter });
    res.json({ ok: true, range });
  } catch (err) {
    console.error("Get Chapter Range Error:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
};

exports.insertChapter = async (req, res) => {
  const { series, volume, chapterIndex, title } = req.body;
  if (!series || !volume || chapterIndex === undefined) {
    return res.status(400).json({ ok: false, message: "Missing required fields" });
  }
  try {
    const result = await VolumeService.insertChapter({ series, volume, chapterIndex, title });
    await notifyCompromisedSpreads(req, { series, volume, compromisedSpreads: result.compromisedSpreads });
    res.json(result);
  } catch (err) {
    console.error("Insert Chapter Error:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
};

exports.createChapter = async (req, res) => {
  const { series, volume, chapterIndex, title } = req.params.series ? req.params : req.body;
  if (!series || !volume || !chapterIndex) {
    return res.status(400).json({ ok: false, message: "Missing required fields" });
  }
  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const result = await VolumeService.createChapter({
      seriesFolderName,
      volumeFolderName: volume,
      chapterIndex,
      title: title || "New Chapter"
    });
    res.json(result);
  } catch (err) {
    console.error("Create Chapter Error:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
};
