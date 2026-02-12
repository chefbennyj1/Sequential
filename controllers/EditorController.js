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
    if (!identifier) return "No_Overflow"; // Legacy default

    if (mongoose.Types.ObjectId.isValid(identifier)) {
        try {
            const series = await Series.findById(identifier);
            if (series) return series.folderName;
        } catch (e) {
            console.error("Error resolving series ID:", e);
        }
    }
    // Assume it's already a folder name
    return identifier;
}

exports.getLayouts = (req, res) => {
  try {
    const files = fs.readdirSync(layoutsDir);
    const layouts = files.filter(
      (f) => f.endsWith(".html")
    );
    res.json({ ok: true, layouts });
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
    fs.mkdirSync(path.join(pageDir, "assets", "video"), { recursive: true });
    fs.mkdirSync(path.join(pageDir, "assets", "audio"), { recursive: true });

    // 2. Generate Atomic page.json
    const layoutId = layout.replace(".html", "");
    const pageJson = {
        header: {
            version: "2.0",
            pageId: pageId,
            chapter: chapter,
            volume: volume,
            layout: {
                id: layoutId,
                html: `${layoutId}.html`,
                css: "" // Style is now inlined in the HTML
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
    const isVideo = file.mimetype.startsWith("video/");
    const isAudio = file.mimetype.startsWith("audio/");

    let assetType = "unknown";
    let subFolder = "";

    if (isImage) { assetType = "image"; subFolder = "image"; }
    else if (isVideo) { assetType = "video"; subFolder = "video"; }
    else if (isAudio) { assetType = "audio"; subFolder = "audio"; }
    else { return res.status(400).json({ ok: false, message: "Unsupported file type" }); }

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

exports.updateAmbientVolume = async (req, res) => {
  const { series, volume, chapter, pageId, ambientVolume } = req.body;
  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const pageDir = path.join(seriesPath, "Volumes", volume, chapter, pageId);
    const pageJsonPath = path.join(pageDir, "page.json");

    if (fs.existsSync(pageJsonPath)) {
      const pageData = JSON.parse(fs.readFileSync(pageJsonPath, "utf8"));
      if (!pageData.header) pageData.header = {};
      if (!pageData.header.ambientAudio) pageData.header.ambientAudio = {};
      pageData.header.ambientAudio.volume = parseFloat(ambientVolume);
      fs.writeFileSync(pageJsonPath, JSON.stringify(pageData, null, 2));
    }
    res.json({ ok: true, message: "Volume updated." });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.setPageAmbientAudio = async (req, res) => {
    const { series, volume, chapter, pageId, fileName, ambientVolume } = req.body;
    console.log(`setPageAmbientAudio: ${pageId}, file=${fileName}, vol=${ambientVolume}`);
    try {
        const seriesFolderName = await getSeriesFolderName(series);
        const seriesPath = await resolveSeriesPath(seriesFolderName);
        const pageDir = path.join(seriesPath, "Volumes", volume, chapter, pageId);
        const pageJsonPath = path.join(pageDir, "page.json");

        if (fs.existsSync(pageJsonPath)) {
            const pageData = JSON.parse(fs.readFileSync(pageJsonPath, "utf8"));
            if (!pageData.header) pageData.header = {};
            
            // Ensure ambientAudio object exists
            if (!pageData.header.ambientAudio) {
                pageData.header.ambientAudio = { loop: true, volume: 1.0 };
            }
            
            pageData.header.ambientAudio.fileName = fileName;
            
            // Update volume if provided
            if (ambientVolume !== undefined) {
                const vol = parseFloat(ambientVolume);
                if (!isNaN(vol)) {
                    pageData.header.ambientAudio.volume = vol;
                }
            }
            console.log("Updated Ambient Audio:", pageData.header.ambientAudio);

            fs.writeFileSync(pageJsonPath, JSON.stringify(pageData, null, 2));

            // Sync with DB Cache
            const volumeId = await findVolumeId(volume);
            if (volumeId) {
                await VolumeService.syncSinglePage(volumeId, chapter, pageId);
            }
        }
        res.json({ ok: true, message: "Ambient audio updated." });
    } catch (e) {
        console.error("setPageAmbientAudio Error:", e);
        res.status(500).json({ ok: false, message: e.message });
    }
};

exports.uploadAmbientAudio = async (req, res) => {
  const { series, volume, chapter, pageId } = req.body;
  const file = req.file;
  if (!file) return res.status(400).json({ ok: false, message: "No file uploaded" });

  try {
    const audioDir = path.join(__dirname, "..", "global_assets", "ambient");
    if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

    const targetPath = path.join(audioDir, file.originalname);
    fs.copyFileSync(file.path, targetPath);
    fs.unlinkSync(file.path);

    const seriesFolderName = await getSeriesFolderName(series);
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const pageJsonPath = path.join(seriesPath, "Volumes", volume, chapter, pageId, "page.json");

    if (fs.existsSync(pageJsonPath)) {
      const pageData = JSON.parse(fs.readFileSync(pageJsonPath, "utf8"));
      if (!pageData.header) pageData.header = {};
      pageData.header.ambientAudio = { fileName: file.originalname, loop: true, volume: 1.0 };
      fs.writeFileSync(pageJsonPath, JSON.stringify(pageData, null, 2));
    }

    res.json({ ok: true, message: "Ambient audio set successfully.", fileName: file.originalname });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

exports.servePreview = async (req, res) => {
  const { series, volume, chapter, pageId } = req.params;
  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const pageDir = path.join(seriesPath, "Volumes", volume, chapter, pageId);
    
    let layoutId = "Standard_Page";
    const atomicPath = path.join(pageDir, 'page.json');
    if (fs.existsSync(atomicPath)) {
        const atomic = JSON.parse(fs.readFileSync(atomicPath, 'utf8'));
        layoutId = atomic.header?.layout?.id || layoutId;
    }

    const templatePath = path.join(__dirname, '..', 'Library', 'layouts', `${layoutId}.html`);
    const content = fs.existsSync(templatePath) 
        ? fs.readFileSync(templatePath, 'utf8') 
        : `<div class="page-layout ${layoutId}">Layout Not Found</div>`;

    res.render("editor/preview", { volume, chapter, pageId, content });
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
    pageData.media = media;

    // Optional: timestamp update?
    if (!pageData.header) pageData.header = {};
    pageData.header.lastUpdated = new Date();

    fs.writeFileSync(pageJsonPath, JSON.stringify(pageData, null, 2));

    // Sync
    const volumeId = await findVolumeId(volume);
    if (volumeId) {
        await VolumeService.syncSinglePage(volumeId, chapter, pageId);
    }

    res.json({ ok: true, message: "Media saved successfully." });
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
  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const pageDir = path.join(seriesPath, "Volumes", volume, chapter, pageId);
    const cssPath = path.join(pageDir, `page.css`);

    let layoutId = "Standard_Page";
    const atomicPath = path.join(pageDir, 'page.json');
    if (fs.existsSync(atomicPath)) {
        const atomic = JSON.parse(fs.readFileSync(atomicPath, 'utf8'));
        layoutId = atomic.header?.layout?.id || layoutId;
    }

    const templatePath = path.join(__dirname, '..', 'Library', 'layouts', `${layoutId}.html`);
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
        while((nthMatch = nthChildPanelRegex.exec(combinedContent)) !== null) {
            const num = parseInt(nthMatch[1]);
            if (num > maxNth) maxNth = num;
        }
        if (maxNth > 0) for(let i = 1; i <= maxNth; i++) panels.add(`.panel-${i}`);
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

    const baseAudioPath = `/api/audio/${seriesFolderName}/${volume}/${chapter}/${pageId}/assets/`;

    const seenIds = new Set();
    sceneData.forEach((item) => {
      if (!item.id || seenIds.has(item.id)) item.id = uuidv4();
      seenIds.add(item.id);

      // Default audioSrc to empty string if missing
      if (!item.audioSrc) item.audioSrc = "";

      // STRIP PATH BEFORE SAVING
      if (item.audioSrc && typeof item.audioSrc === 'string' && item.audioSrc.startsWith(baseAudioPath)) {
          item.audioSrc = item.audioSrc.replace(baseAudioPath, '');
      }
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

exports.changeLayout = async (req, res) => {
    const { volumeId, chapterId, pageId, layout } = req.body;
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
        if (!pageData.header.layout) pageData.header.layout = {};
        
        pageData.header.layout.id = layoutId;
        pageData.header.layout.html = `${layoutId}.html`;
        pageData.header.layout.css = ""; 

        fs.writeFileSync(atomicPath, JSON.stringify(pageData, null, 2));

        if (fs.existsSync(cssPath)) {
            let cssContent = fs.readFileSync(cssPath, 'utf8');
            const importRegex = /@import\s+url\(['"]\/layouts\/styles\/.*?\.css['"]\);/g;
            cssContent = cssContent.replace(importRegex, '');
            fs.writeFileSync(cssPath, cssContent);
        }

        await VolumeService.syncSinglePage(volumeId, chapterId, pageId);
        res.json({ ok: true, message: "Layout updated successfully" });
    } catch (e) {
        console.error("Change Layout Error:", e);
        res.status(500).json({ ok: false, message: e.message });
    }
};

exports.uploadMiddleware = upload.single("asset");
