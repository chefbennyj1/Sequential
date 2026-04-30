const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const { resolveSeriesPath } = require("../services/MediaService");
const Volume = require("../models/Volume");
const Series = require("../models/Series");
const PanelService = require("../services/PanelService");
const VolumeService = require("../services/VolumeService");

const layoutsDir = path.resolve(__dirname, "..", "Library", "layouts");

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

exports.getNextPanelId = async (req, res) => {
  const { series, volume, chapter, pageId, mode } = req.query;

  if (!series || !volume || !chapter || !pageId) {
    return res.status(400).json({ ok: false, message: "Missing required parameters" });
  }

  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const pageDir = path.join(seriesPath, "Volumes", volume, chapter, pageId);
    const atomicPath = path.join(pageDir, 'page.json');

    if (!fs.existsSync(atomicPath)) {
        return res.status(404).json({ ok: false, message: "page.json not found" });
    }

    const pageJson = JSON.parse(fs.readFileSync(atomicPath, 'utf8'));
    const modeKey = mode === 'portrait' ? 'portrait' : 'landscape';
    const layoutId = (pageJson.header?.layouts?.[modeKey]?.id) || (mode === 'portrait' ? pageJson.header?.portraitLayout?.id : pageJson.header?.layout?.id) || "Standard_Page";

    const layoutFolder = mode === 'portrait' ? 'portrait' : 'landscape';
    const templatePath = path.join(__dirname, '..', 'Library', 'layouts', layoutFolder, `${layoutId}.html`);
    
    let templateHtml = "";
    if (fs.existsSync(templatePath)) {
        templateHtml = fs.readFileSync(templatePath, 'utf8');
    }

    const nextId = PanelService.getNextPanelId(templateHtml, pageJson);
    res.json({ ok: true, nextId });
  } catch (err) {
    console.error("Get Next Panel ID Error:", err);
    res.status(500).json({ ok: false, message: err.message });
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

    // --- DATA CLEANUP & ORPHAN DETECTION ---
    const layoutFolder = mode === 'portrait' ? 'portrait' : 'landscape';
    const templatePath = path.join(__dirname, '..', 'Library', 'layouts', layoutFolder, `${layoutId}.html`);
    
    let newPanels = new Set();
    if (fs.existsSync(templatePath)) {
        const templateHtml = fs.readFileSync(templatePath, 'utf8');
        newPanels = PanelService.getPanelsFromTemplate(templateHtml);
    }

    // 1. Recalculate Media (Unselect panels not in new layout)
    if (pageData.media) {
        pageData.media = pageData.media.filter(m => {
            // Keep it if it's in the new layout OR if it's floating
            if (newPanels.has(m.panel)) return true;
            if (m.isFloating) return true;
            return false;
        });
    }

    // 2. Mark Orphaned Scene Items
    if (pageData.scene) {
        pageData.scene.forEach(item => {
            if (item.displayType.type === 'SpeechBubble' || (item.displayType.type === 'TextBlock' && item.placement?.panel)) {
                const target = item.placement?.panel;
                // If the target is NOT in the new panels AND NOT in the remaining media (floating)
                const panelExists = newPanels.has(target) || (pageData.media && pageData.media.some(m => m.panel === target));
                item.isOrphaned = !panelExists;
            }
        });
    }

    fs.writeFileSync(atomicPath, JSON.stringify(pageData, null, 2));

    if (fs.existsSync(cssPath)) {
      let cssContent = fs.readFileSync(cssPath, 'utf8');
      const importRegex = /@import\s+url\(['"]\/layouts\/styles\/.*?\.css['"]\);/g;
      cssContent = cssContent.replace(importRegex, '');
      fs.writeFileSync(cssPath, cssContent);
    }

    await VolumeService.syncSinglePage(volumeId, chapterId, pageId, seriesFolderName);
    res.json({ ok: true, message: `Layout updated for ${mode || 'landscape'}` });
  } catch (e) {
    console.error("Change Layout Error:", e);
    res.status(500).json({ ok: false, message: e.message });
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

    res.render("dashboard/studio/preview/preview", { series: seriesFolderName, volume, chapter, pageId, content });
  } catch (err) {
    console.error("Preview Error:", err);
    res.status(500).send("Error serving preview");
  }
};
