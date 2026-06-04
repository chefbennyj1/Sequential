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
    
    // Single layout architecture: Save to all keys for maximum compatibility
    pageData.header.layout = { id: layoutId, html: `${layoutId}.html`, css: "" };
    pageData.header.portraitLayout = { id: layoutId, html: `${layoutId}.html`, css: "" };
    
    // Legacy support
    pageData.header.layouts = {
        landscape: { id: layoutId, html: `${layoutId}.html`, css: "" },
        portrait: { id: layoutId, html: `${layoutId}.html`, css: "" }
    };

    // --- DATA CLEANUP & ORPHAN DETECTION ---
    // In the new architecture, we always look in the portrait folder
    const templatePath = path.join(__dirname, '..', 'Library', 'layouts', 'portrait', `${layoutId}.html`);
    
    let newPanels = new Set();
    if (fs.existsSync(templatePath)) {
        const templateHtml = fs.readFileSync(templatePath, 'utf8');
        newPanels = PanelService.getPanelsFromTemplate(templateHtml);
    }

    // 1. Recalculate Media (Unselect panels not in new layout)
    if (pageData.media) {
        pageData.media = pageData.media.filter(m => {
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
    res.json({ ok: true, message: `Layout updated to ${layoutId}` });
  } catch (e) {
    console.error("Change Layout Error:", e);
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.getPanels = async (req, res) => {
  const { series, volume, chapter, pageId } = req.params;
  const mode = req.query.mode || 'portrait'; // Default to portrait
  
  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const pageDir = path.join(seriesPath, "Volumes", volume, chapter, pageId);
    const cssPath = path.join(pageDir, `page.css`);

    let layoutId = "Standard_Page";
    const atomicPath = path.join(pageDir, 'page.json');
    if (fs.existsSync(atomicPath)) {
      const atomic = JSON.parse(fs.readFileSync(atomicPath, 'utf8'));
      if (atomic.header?.layout) {
          layoutId = atomic.header.layout.id;
      } else if (atomic.header?.layouts) {
        const modeKey = mode === 'portrait' ? 'portrait' : 'landscape';
        layoutId = atomic.header.layouts[modeKey]?.id || layoutId;
      } else {
        layoutId = (mode === 'portrait' ? atomic.header?.portraitLayout?.id : atomic.header?.layout?.id) || layoutId;
      }
    }

    const layoutFolder = mode === 'landscape' ? 'landscape' : 'portrait';
    const altFolder = layoutFolder === 'portrait' ? 'landscape' : 'portrait';
    
    let templatePath = path.join(__dirname, '..', 'Library', 'layouts', layoutFolder, `${layoutId}.html`);
    // Fallback if not in primary folder
    if (!fs.existsSync(templatePath)) {
        templatePath = path.join(__dirname, '..', 'Library', 'layouts', altFolder, `${layoutId}.html`);
    }

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
    const panels = PanelService.getPanelsFromTemplate(templateHtmlContent);

    // Spread Detection
    let isSpread = false;
    if (atomicPath && fs.existsSync(atomicPath)) {
        const atomic = JSON.parse(fs.readFileSync(atomicPath, 'utf8'));
        const spreadType = atomic.header?.spread?.type;
        if (spreadType && spreadType !== 'none') {
            isSpread = true;
        } else {
            // Auto-detect fallback
            const pageMatch = pageId.match(/page(\d+)/i);
            if (pageMatch) {
                const pageNum = parseInt(pageMatch[1]);
                const isPotentialLeft = pageNum % 2 === 0;
                const partnerId = `page${isPotentialLeft ? pageNum + 1 : pageNum - 1}`;
                const partnerPath = path.join(seriesPath, "Volumes", volume, chapter, partnerId, 'page.json');
                if (fs.existsSync(partnerPath)) {
                    const partnerAtomic = JSON.parse(fs.readFileSync(partnerPath, 'utf8'));
                    if (partnerAtomic.header?.spread?.type && partnerAtomic.header.spread.type !== 'none') {
                        isSpread = true;
                    }
                }
            }
        }
    }

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

    res.json({ ok: true, panels: Array.from(panels).sort(), layoutClass: layoutId, isSpread });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Failed to parse panels" });
  }
};

exports.toggleSpread = async (req, res) => {
  const { volumeId, chapterId, pageId, enabled } = req.body;
  console.log(`[PageLayoutController] Toggle Spread: ${pageId} (${enabled})`);
  
  try {
    const volume = await Volume.findById(volumeId);
    if (!volume) {
        console.error("[PageLayoutController] Volume not found:", volumeId);
        return res.status(404).json({ ok: false, message: "Volume not found" });
    }

    // Handle both / and \ paths
    const normalizedPath = volume.volumePath.replace(/\\/g, '/');
    const pathParts = normalizedPath.split('/').filter(p => p.length > 0);
    
    // Logic to find series folder: usually it's the one before 'Volumes'
    const volumesIdx = pathParts.indexOf('Volumes');
    const seriesFolderName = (volumesIdx > 0) ? pathParts[volumesIdx - 1] : pathParts[1];
    
    console.log(`[PageLayoutController] Series folder: ${seriesFolderName}`);

    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const volumeSubFolder = path.basename(volume.volumePath);

    const pageMatch = pageId.match(/page(\d+)/i);
    if (!pageMatch) throw new Error("Invalid pageId format: " + pageId);
    
    const pageNum = parseInt(pageMatch[1]);
    const isLeft = pageNum % 2 === 0;
    
    const partnerNum = isLeft ? pageNum + 1 : pageNum - 1;
    const partnerId = `page${partnerNum}`;

    console.log(`[PageLayoutController] Paging: Self=${pageId}, Partner=${partnerId}`);

    const updatePage = (pId, type) => {
      const pPath = path.join(seriesPath, 'Volumes', volumeSubFolder, chapterId, pId, 'page.json');
      if (fs.existsSync(pPath)) {
        const data = JSON.parse(fs.readFileSync(pPath, 'utf8'));
        if (!data.header) data.header = {};
        data.header.spread = enabled ? { type, isBroken: false } : { type: 'none', isBroken: false };
        fs.writeFileSync(pPath, JSON.stringify(data, null, 2));
        console.log(`[PageLayoutController] Updated page.json for ${pId}`);
        return true;
      }
      console.warn(`[PageLayoutController] page.json not found for partner/self: ${pPath}`);
      return false;
    };

    const successSelf = updatePage(pageId, isLeft ? 'left' : 'right');
    const successPartner = updatePage(partnerId, isLeft ? 'right' : 'left');

    await VolumeService.syncSinglePage(volumeId, chapterId, pageId, seriesFolderName);
    if (successPartner) {
      await VolumeService.syncSinglePage(volumeId, chapterId, partnerId, seriesFolderName);
    }

    res.json({ ok: true, message: `Spread ${enabled ? 'enabled' : 'disabled'}` });
  } catch (e) {
    console.error("[PageLayoutController] Toggle Spread Error:", e);
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.servePreview = async (req, res) => {
  const { series, volume, chapter, pageId } = req.params;
  const mode = req.query.mode || 'portrait';

  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const volumesDir = path.join(seriesPath, "Volumes");
    const pageDir = path.join(volumesDir, volume, chapter, pageId);

    const getPageContent = (pId) => {
      const pDir = path.join(volumesDir, volume, chapter, pId);
      const atomicPath = path.join(pDir, 'page.json');
      if (!fs.existsSync(atomicPath)) return null;

      const atomic = JSON.parse(fs.readFileSync(atomicPath, 'utf8'));
      let layoutId = "Standard_Page";
      if (atomic.header?.layout) {
          layoutId = atomic.header.layout.id;
      } else if (atomic.header?.layouts) {
        const modeKey = mode === 'portrait' ? 'portrait' : 'landscape';
        layoutId = atomic.header.layouts[modeKey]?.id || layoutId;
      } else {
        layoutId = (mode === 'portrait' ? atomic.header?.portraitLayout?.id : atomic.header?.layout?.id) || layoutId;
      }

      const layoutFolder = mode === 'landscape' ? 'landscape' : 'portrait';
      const altFolder = layoutFolder === 'portrait' ? 'landscape' : 'portrait';
      let templatePath = path.join(__dirname, '..', 'Library', 'layouts', layoutFolder, `${layoutId}.html`);
      if (!fs.existsSync(templatePath)) {
          templatePath = path.join(__dirname, '..', 'Library', 'layouts', altFolder, `${layoutId}.html`);
      }

      const html = fs.existsSync(templatePath) ? fs.readFileSync(templatePath, 'utf8') : `<div class="page-layout ${layoutId}">Layout Not Found</div>`;
      return { html, layoutId, spread: atomic.header?.spread };
    };

    let mainPage = getPageContent(pageId);
    if (!mainPage) return res.status(404).send("Page not found");

    let leftPage = null;
    let rightPage = null;
    let isSpread = false;

    // AUTO-DETECTION Fallback: If metadata is missing on this page, check the logical partner
    if (!mainPage.spread || mainPage.spread.type === 'none') {
        const pageMatch = pageId.match(/page(\d+)/i);
        if (pageMatch) {
            const pageNum = parseInt(pageMatch[1]);
            const isPotentialLeft = pageNum % 2 === 0;
            const partnerId = `page${isPotentialLeft ? pageNum + 1 : pageNum - 1}`;
            const partnerPage = getPageContent(partnerId);
            
            if (partnerPage && partnerPage.spread && partnerPage.spread.type !== 'none') {
                console.log(`[Preview] Detected un-marked spread page ${pageId}. Partner ${partnerId} confirmed.`);
                mainPage.spread = { 
                    type: partnerPage.spread.type === 'left' ? 'right' : 'left',
                    isBroken: false 
                };
            }
        }
    }

    if (mainPage.spread && mainPage.spread.type !== 'none') {
        isSpread = true;
        const pageMatch = pageId.match(/page(\d+)/i);
        if (pageMatch) {
            const pageNum = parseInt(pageMatch[1]);
            const isMainLeft = mainPage.spread.type === 'left';
            const partnerId = `page${isMainLeft ? pageNum + 1 : pageNum - 1}`;
            const partnerPage = getPageContent(partnerId);
            
            if (isMainLeft) {
                leftPage = { ...mainPage, pageId };
                rightPage = partnerPage ? { ...partnerPage, pageId: partnerId } : null;
            } else {
                rightPage = { ...mainPage, pageId };
                leftPage = partnerPage ? { ...partnerPage, pageId: partnerId } : null;
            }
        }
    } else {
        leftPage = { ...mainPage, pageId };
    }

    res.render("dashboard/studio/preview/preview", { 
        series: seriesFolderName, 
        volume, 
        chapter, 
        pageId, // This is the 'active' context page
        isSpread,
        leftPage,
        rightPage
    });
  } catch (err) {
    console.error("Preview Error:", err);
    res.status(500).send("Error serving preview");
  }
};
