const path = require("path");
const fs = require("fs");
const multer = require("multer");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const { validateMediaJson, validateSceneJson } = require("../utils/jsonValidators");
const { resolveSeriesPath } = require("../services/MediaService");
const VolumeService = require("../services/VolumeService");
const Volume = require("../models/Volume");
const Series = require("../models/Series");

// Configure Multer for temporary storage
const upload = multer({ dest: path.join(__dirname, "..", ".gemini", "tmp") });

const layoutsDir = path.resolve(__dirname, "..", "Library", "layouts");

async function findVolumeId(volumeFolderName) {
  const vol = await Volume.findOne({ volumePath: new RegExp(`[\\/]${volumeFolderName}$`) });
  return vol ? vol._id : null;
}

// Helper: Resolve Series Folder Name (ID or String)
async function getSeriesFolderName(identifier) {
  if (!identifier) return "No_Overflow";

  if (mongoose.Types.ObjectId.isValid(identifier)) {
    try {
      const series = await Series.findById(identifier);
      if (series) return series.folderName;
    } catch (e) {
      console.error("Error resolving series ID:", e);
    }
  }

  // If it's not a valid ObjectId, assume it's already a folder name
  // or check if a series with this folderName exists
  try {
    const seriesByFolder = await Series.findOne({ folderName: identifier });
    if (seriesByFolder) return seriesByFolder.folderName;
  } catch (e) { }

  return identifier;
}

exports.getLayouts = (req, res) => {
  try {
    const mode = req.query.mode === 'portrait' ? 'portrait' : 'landscape';  
    const modeDir = path.join(layoutsDir, mode);

    let layoutMap = {};
    const mapPath = path.join(layoutsDir, 'layout_map.json');
    if (fs.existsSync(mapPath)) {
      layoutMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    }

    if (!fs.existsSync(modeDir)) {
      return res.json({ ok: true, layouts: [], layoutMap });
    }

    const files = fs.readdirSync(modeDir);
    const layouts = files.filter(
      (f) => f.endsWith(".html")
    );
    res.json({ ok: true, layouts, layoutMap });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Failed to list layouts" }); 
  }
};
exports.createPage = async (req, res) => {
  const { series, volume, chapter, pageId, layout } = req.body;

  if (!volume || !chapter || !pageId || !layout) {
    return res
      .status("400")
      .json({ ok: false, message: "Missing required fields" });
  }

  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const volumesDir = path.join(seriesPath, "Volumes");
    const pageDir = path.join(volumesDir, volume, chapter, pageId);

    if (fs.existsSync(pageDir)) {
      return res.status("400").json({ ok: false, message: "Page already exists" });
    }

    // 1. Create Folder Structure
    fs.mkdirSync(pageDir, { recursive: true });
    fs.mkdirSync(path.join(pageDir, "assets", "image"), { recursive: true });

    // 2. Generate Atomic page.json
    const layoutId = layout.replace(".html", "");
    const pageJson = {
      header: {
        version: "2.0",
        pageId: pageId,
        chapter: chapter,
        volume: volume,
        layouts: {
          landscape: { id: layoutId, html: `${layoutId}.html`, css: "" },
          portrait: { id: layoutId, html: `${layoutId}.html`, css: "" }
        },
        ambientAudio: {}
      },
      media: [],
      scene: []
    };

    // CSS Boilerplate
    const css = `@import url('/layouts/styles/base-comic-layout.css');

/* Add page-specific styles here */
.${pageId} {

}`;

    // JS Boilerplate
    const js =
      "export async function onPageLoad(container, pageInfo) {\n" +
      "    container.addEventListener('view_visible', async () => {\n" +
      "        console.log(`Page ${pageInfo.pageId} is visible.`);\n" +
      "    });\n\n" +
      "    container.addEventListener('view_hidden', () => {\n" +
      "        console.log(`Page ${pageInfo.pageId} is hidden.`);\n" +
      "    });\n\n" +
      "    container.addEventListener('panel_media_changed', (e) => {\n" +
      "        const { panelSelector, type, fileName, action } = e.detail;\n" +
      "        console.log(`Panel ${panelSelector} changed:`, { type, fileName, action });\n" +
      "    });\n";

    // 3. Write Files
    fs.writeFileSync(path.join(pageDir, `page.css`), css);
    fs.writeFileSync(path.join(pageDir, `page.js`), js);
    fs.writeFileSync(path.join(pageDir, `page.json`), JSON.stringify(pageJson, null, 2));

    // 4. Sync with DB
    const volumeId = await findVolumeId(volume);
    if (volumeId) {
      // We use the full scanner sync to ensure the chapter/page arrays in DB are updated
      const Volume = require('../models/Volume');
      const vol = await Volume.findById(volumeId);
      if (vol) {
        await VolumeService.updateChaptersFromFS(vol);
      }
    }

    res.json({
      ok: true,
      message: `Page ${pageId} created successfully.`,
      path: pageDir,
    });
  } catch (err) {
    console.error("Scaffolding Error:", err);
    res
      .status(500)
      .json({ ok: false, message: "Failed to create page structure" });
  }
};

exports.uploadAsset = async (req, res) => {
  const { series, volume, chapter, pageId, panel, scope } = req.body;
  const file = req.file;

  if (!volume || !chapter || !pageId || !panel || !file) {
    return res
      .status(400)
      .json({ ok: false, message: "Missing required fields or file" });
  }

  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const volumesDir = path.join(seriesPath, "Volumes");

    let assetsDir;
    let pageJsonPath;
    let updatePageJson = true;

    if (scope === 'volume') {
      assetsDir = path.join(volumesDir, volume, 'assets');
      updatePageJson = false;
    } else {
      const pageDir = path.join(volumesDir, volume, chapter, pageId);
      if (!fs.existsSync(pageDir)) {
        return res.status(404).json({ ok: false, message: "Page not found" });
      }
      assetsDir = path.join(pageDir, 'assets');
      pageJsonPath = path.join(pageDir, "page.json");
    }

    const isImage = file.mimetype.startsWith("image/");

    let assetType = "unknown";
    let subFolder = "";

    if (isImage) { assetType = "image"; subFolder = "image"; }
    else { return res.status(400).json({ ok: false, message: "Unsupported file type. Only images are allowed." }); }

    const targetDir = path.join(assetsDir, subFolder);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const targetPath = path.join(targetDir, file.originalname);
    fs.copyFileSync(file.path, targetPath);
    fs.unlinkSync(file.path);

    if (updatePageJson && panel !== 'upload') {
      let pageData = { media: [], header: {} };
      if (fs.existsSync(pageJsonPath)) {
        pageData = JSON.parse(fs.readFileSync(pageJsonPath, "utf8"));
      }

      const existingIndex = pageData.media.findIndex((m) => m.panel === panel);
      const newEntry = { panel: panel, type: assetType, fileName: file.originalname };

      if (existingIndex > -1) pageData.media[existingIndex] = { ...pageData.media[existingIndex], ...newEntry };
      else pageData.media.push(newEntry);

      fs.writeFileSync(pageJsonPath, JSON.stringify(pageData, null, 2));

      // Sync with DB Cache
      const volumeId = await findVolumeId(volume);
      if (volumeId) {
        await VolumeService.syncSinglePage(volumeId, chapter, pageId);
      }
    }

    res.json({ ok: true, message: "Asset uploaded.", assetPath: targetPath });
  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ ok: false, message: "Failed to upload asset" });
  }
};



exports.servePreview = async (req, res) => {
  const { series, volume, chapter, pageId } = req.params;
  const { mode } = req.query; // New: mode param
  
  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const pageDir = path.join(seriesPath, "Volumes", volume, chapter, pageId);

    let layoutId = "Standard_Page";
    const atomicPath = path.join(pageDir, 'page.json');
    if (fs.existsSync(atomicPath)) {
      const atomic = JSON.parse(fs.readFileSync(atomicPath, 'utf8'));
      if (atomic.header?.layouts) {
        const modeKey = mode === 'portrait' ? 'portrait' : 'landscape';
        layoutId = atomic.header.layouts[modeKey]?.id || layoutId;
      } else {
        layoutId = (mode === 'portrait' ? atomic.header?.portraitLayout?.id : atomic.header?.layout?.id) || layoutId;
      }
    }

    const layoutFolder = mode === 'portrait' ? 'portrait' : 'landscape';
    const templatePath = path.join(__dirname, '..', 'Library', 'layouts', layoutFolder, `${layoutId}.html`);
    const content = fs.existsSync(templatePath)
      ? fs.readFileSync(templatePath, 'utf8')
      : `<div class="page-layout ${layoutId}">Layout Not Found</div>`;

    res.render("preview-shell/preview", { series, volume, chapter, pageId, content });
  } catch (err) {
    console.error("Preview Error:", err);
    res.status(500).send("Error serving preview");
  }
};

exports.saveMedia = async (req, res) => {
  const { series, volume, chapter, pageId } = req.params;
  const { media } = req.body; // Expecting array of media objects

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

    // PERFORM ROBUST MERGE
    if (!pageData.media) pageData.media = [];

    media.forEach(newEntry => {
      const existingIdx = pageData.media.findIndex(m => m.panel === newEntry.panel);
      if (existingIdx > -1) {
        pageData.media[existingIdx] = { ...pageData.media[existingIdx], ...newEntry };
      } else {
        pageData.media.push(newEntry);
      }
    });

    if (!pageData.header) pageData.header = {};
    pageData.header.lastUpdated = new Date();

    fs.writeFileSync(pageJsonPath, JSON.stringify(pageData, null, 2));

    // Sync
    const volumeId = await findVolumeId(volume);
    if (volumeId) {
      await VolumeService.syncSinglePage(volumeId, chapter, pageId);
    }

    res.json({ ok: true, message: "Media merged successfully." });
  } catch (err) {
    console.error("Save Media Error:", err);
    res.status(500).json({ ok: false, message: "Failed to save media" });
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

      // DYNAMIC PATH RESOLUTION FOR AUDIO
      const baseAudioPath = `/api/audio/${seriesFolderName}/${volume}/${chapter}/${pageId}/assets/`;
      if (pageData.scene && Array.isArray(pageData.scene)) {
        pageData.scene.forEach(cue => {
          // If audioSrc is just a filename (no slashes, no protocols), expand it
          if (cue.audioSrc && typeof cue.audioSrc === 'string' && !cue.audioSrc.includes('/') && !cue.audioSrc.includes(':')) {
            cue.audioSrc = baseAudioPath + cue.audioSrc;
          }
        });
      }

      res.json({ ok: true, scene: pageData.scene || [] });
    } else {
      res.json({ ok: true, scene: [] });
    }
  } catch (e) {
    res.status(500).json({ ok: false, message: "Failed to parse page data" });
  }
};

exports.getAssets = async (req, res) => {
  const { series, volume, chapter, pageId, type } = req.params;
  const scope = req.query.scope || 'page';

  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const volumesDir = path.join(seriesPath, "Volumes");
    let assetsDir;

    if (scope === 'global') {
      assetsDir = type === 'audio' ? path.join(__dirname, '..', 'resources', 'audio') : null;
    } else if (scope === 'series') {
      assetsDir = path.join(volumesDir, '..', 'assets', type);
    } else if (scope === 'volume') {
      assetsDir = path.join(volumesDir, volume, 'assets', type);
    } else {
      assetsDir = path.join(volumesDir, volume, chapter, pageId, "assets", type);
    }

    if (!assetsDir || !fs.existsSync(assetsDir)) return res.json({ ok: true, files: [] });

    const files = fs.readdirSync(assetsDir).filter(file => fs.statSync(path.join(assetsDir, file)).isFile()).map(file => {
      const stats = fs.statSync(path.join(assetsDir, file));
      return { name: file, mtime: stats.mtimeMs };
    });
    res.json({ ok: true, files });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Failed to list assets" });
  }
};

exports.getPanels = async (req, res) => {
  const { series, volume, chapter, pageId } = req.params;
  const { mode } = req.query; // New: mode param (landscape/portrait)
  
  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const pageDir = path.join(seriesPath, "Volumes", volume, chapter, pageId);
    const cssPath = path.join(pageDir, `page.css`);

    let layoutId = "Standard_Page";
    const atomicPath = path.join(pageDir, 'page.json');
    if (fs.existsSync(atomicPath)) {
      const atomic = JSON.parse(fs.readFileSync(atomicPath, 'utf8'));
      if (atomic.header?.layouts) {
        const modeKey = mode === 'portrait' ? 'portrait' : 'landscape';
        layoutId = atomic.header.layouts[modeKey]?.id || layoutId;
      } else {
        layoutId = (mode === 'portrait' ? atomic.header?.portraitLayout?.id : atomic.header?.layout?.id) || layoutId;
      }
    }

    const layoutFolder = mode === 'portrait' ? 'portrait' : 'landscape';
    const templatePath = path.join(__dirname, '..', 'Library', 'layouts', layoutFolder, `${layoutId}.html`);
    let combinedContent = "";
    if (fs.existsSync(cssPath)) {
      combinedContent = fs.readFileSync(cssPath, "utf8");
      const importRegex = /@import\s+url\(([^)]+)\)/g;
      let importMatch;
      while ((importMatch = importRegex.exec(combinedContent)) !== null) {
        let relativePath = importMatch[1].replace(/['"]/g, "").trim();
        const absImportPath = relativePath.startsWith('/')
          ? path.join(__dirname, '..', 'Library', relativePath.replace(/^\/layouts/, 'layouts'))
          : path.resolve(pageDir, relativePath);
        if (fs.existsSync(absImportPath)) combinedContent += "\n" + fs.readFileSync(absImportPath, "utf8");
      }
    }

    const templateHtmlContent = fs.existsSync(templatePath) ? fs.readFileSync(templatePath, 'utf8') : "";
    const panels = new Set();
    let match;
    const templatePanelRegex = /class=\"[^ vital]*panel\s+panel-([a-zA-Z0-9]+)[^ vital]*\"/g;
    while ((match = templatePanelRegex.exec(templateHtmlContent)) !== null) panels.add(`.panel-${match[1]}`);

    if (panels.size === 0) {
      const nthChildPanelRegex = /panel:nth-child\((\d+)\)/g;
      let nthMatch;
      let maxNth = 0;
      while ((nthMatch = nthChildPanelRegex.exec(combinedContent)) !== null) {
        const num = parseInt(nthMatch[1]);
        if (num > maxNth) maxNth = num;
      }
      if (maxNth > 0) for (let i = 1; i <= maxNth; i++) panels.add(`.panel-${i}`);
    }

    res.json({ ok: true, panels: Array.from(panels).sort(), layoutClass: layoutId });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Failed to parse panels" });
  }
};

exports.saveScene = async (req, res) => {
  const { series, volume, chapter, pageId } = req.params;
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

    const volumeId = await findVolumeId(volume);
    if (volumeId) {
      await VolumeService.syncSinglePage(volumeId, chapter, pageId);
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

exports.changeLayout = async (req, res) => {
  const { volumeId, chapterId, pageId, layout, mode } = req.body;
  try {
    const Volume = require('../models/Volume');
    const volume = await Volume.findById(volumeId);
    if (!volume) return res.status(404).json({ ok: false, message: "Volume not found" });

    const pathParts = volume.volumePath.split('/').filter(p => p.length > 0);
    const seriesFolderName = pathParts[1];
    const seriesPath = await resolveSeriesPath(seriesFolderName);

    const pageFolder = path.join(seriesPath, 'Volumes', path.basename(volume.volumePath), chapterId, pageId);
    const atomicPath = path.join(pageFolder, 'page.json');
    const cssPath = path.join(pageFolder, 'page.css');

    if (!fs.existsSync(atomicPath)) return res.status(404).json({ ok: false, message: "page.json not found" });

    const pageData = JSON.parse(fs.readFileSync(atomicPath, 'utf8'));
    const layoutId = layout.replace('.html', '');

    if (!pageData.header) pageData.header = {};
    if (!pageData.header.layouts) pageData.header.layouts = { landscape: {}, portrait: {} };
    
    // Update the correct layout based on mode
    const modeKey = mode === 'portrait' ? 'portrait' : 'landscape';
    if (!pageData.header.layouts[modeKey]) pageData.header.layouts[modeKey] = {};
    
    pageData.header.layouts[modeKey].id = layoutId;
    pageData.header.layouts[modeKey].html = `${layoutId}.html`;
    pageData.header.layouts[modeKey].css = "";

    fs.writeFileSync(atomicPath, JSON.stringify(pageData, null, 2));

    if (fs.existsSync(cssPath)) {
      let cssContent = fs.readFileSync(cssPath, 'utf8');
      const importRegex = /@import\s+url\(['"]\/layouts\/styles\/.*?\.css['"]\);/g;
      cssContent = cssContent.replace(importRegex, '');
      fs.writeFileSync(cssPath, cssContent);
    }

    await VolumeService.syncSinglePage(volumeId, chapterId, pageId);
    res.json({ ok: true, message: `Layout updated for ${mode || 'landscape'}` });
  } catch (e) {
    console.error("Change Layout Error:", e);
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.insertPage = async (req, res) => {
  const { series, volume, chapter, insertPoint } = req.body;

  if (!series || !volume || !chapter || insertPoint === undefined) {
    return res.status(400).json({ ok: false, message: "Missing required fields" });
  }

  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const result = await VolumeService.insertPage({
      seriesFolderName,
      volumeFolderName: volume,
      chapterFolderName: chapter,
      insertPoint
    });

    res.json(result);
  } catch (err) {
    console.error("Insert Page Error:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
};

exports.createChapter = async (req, res) => {
  const { series, volume, chapterIndex, title } = req.body;

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

exports.uploadMiddleware = upload.single("asset");
