const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { resolveSeriesPath } = require("./MediaService");
const PanelService = require("./PanelService");
const VolumeService = require("./VolumeService");

const layoutsDir = path.resolve(__dirname, "..", "Library", "layouts");

class LayoutService {
    /**
     * Resolves a series ID or folder name into the canonical folder name.
     */
    static async getSeriesFolderName(identifier) {
        if (!identifier) return null;
        if (mongoose.Types.ObjectId.isValid(identifier)) {
            try {
                const Series = require("../models/Series");
                const series = await Series.findById(identifier);
                if (series) return series.folderName;
            } catch (e) { console.error("Error resolving series ID:", e); }
        }
        try {
            const Series = require("../models/Series");
            const seriesByFolder = await Series.findOne({ folderName: identifier });
            if (seriesByFolder) return seriesByFolder.folderName;
        } catch (e) { }
        return identifier;
    }

    /**
     * Retrieves all available portrait layouts.
     */
    static getLayouts() {
        const portraitDir = path.join(layoutsDir, 'portrait');
        if (!fs.existsSync(portraitDir)) return [];
        const files = fs.readdirSync(portraitDir);
        return files.filter(f => f.endsWith(".html"));
    }

    /**
     * Determines the next available Z-index panel ID for a specific page.
     */
    static async getNextPanelId(series, volume, chapter, pageId) {
        const seriesFolderName = await this.getSeriesFolderName(series);
        const seriesPath = await resolveSeriesPath(seriesFolderName);
        const pageDir = path.join(seriesPath, "Volumes", volume, chapter, pageId);
        const atomicPath = path.join(pageDir, 'page.json');
        
        if (!fs.existsSync(atomicPath)) return 'panel-0';

        const pageJson = JSON.parse(fs.readFileSync(atomicPath, 'utf8'));
        const layoutId = pageJson.header?.layout?.id || pageJson.header?.portraitLayout?.id || pageJson.header?.layouts?.portrait?.id || "Standard_Page";

        const templatePath = path.join(layoutsDir, 'portrait', `${layoutId}.html`);

        if (fs.existsSync(templatePath)) {
            const templateHtml = fs.readFileSync(templatePath, 'utf8');
            // We could parse existing panels here if needed, but we rely on media array for floating panels
        }
        
        const usedPanels = pageJson.media ? pageJson.media.map(m => m.panel) : [];
        const maxZ = usedPanels.reduce((max, p) => {
            if (typeof p === 'string' && p.startsWith('.z-')) {
                const num = parseInt(p.replace('.z-', ''));
                if (!isNaN(num) && num > max) return num;
            }
            return max;
        }, -1);

        return `.z-${maxZ + 1}`;
    }

    /**
     * Updates the layout ID for a page and purges orphaned media/scene elements.
     */
    static async changeLayout(volumeId, chapterId, pageId, layout) {
        const Volume = require('../models/Volume');
        const volume = await Volume.findById(volumeId);
        if (!volume) throw new Error("Volume not found");

        const pathParts = volume.volumePath.split(/[\\/]/);
        const volumesIdx = pathParts.indexOf('Volumes');
        const seriesFolderName = (volumesIdx > 0) ? pathParts[volumesIdx - 1] : pathParts[1];
        
        const seriesPath = await resolveSeriesPath(seriesFolderName);
        const volumeSubFolder = path.basename(volume.volumePath);
        const pageDir = path.join(seriesPath, "Volumes", volumeSubFolder, chapterId, pageId);
        const atomicPath = path.join(pageDir, 'page.json');
        const cssPath = path.join(pageDir, `page.css`);

        if (!fs.existsSync(atomicPath)) throw new Error("page.json not found");

        const pageData = JSON.parse(fs.readFileSync(atomicPath, 'utf8'));
        const layoutId = layout.replace('.html', '');

        if (!pageData.header) pageData.header = {};

        // Flatten metadata to single layout object
        pageData.header.layout = { id: layoutId, html: `${layoutId}.html`, css: "" };
        if (pageData.header.layouts) delete pageData.header.layouts;
        if (pageData.header.portraitLayout) delete pageData.header.portraitLayout;

        const templatePath = path.join(layoutsDir, 'portrait', `${layoutId}.html`);

        let newPanels = new Set();
        if (fs.existsSync(templatePath)) {
            const templateHtml = fs.readFileSync(templatePath, 'utf8');
            newPanels = PanelService.getPanelsFromTemplate(templateHtml);
        }

        // 1. Recalculate Media
        if (pageData.media) {
            pageData.media = pageData.media.filter(m => newPanels.has(m.panel) || m.isFloating);
        }

        // 2. Clear Scene data that targets removed panels
        if (pageData.scene) {
            pageData.scene = pageData.scene.filter(item => {
                if (!item.placement || !item.placement.targetPanel) return true;
                return newPanels.has(item.placement.targetPanel);
            });
        }

        fs.writeFileSync(atomicPath, JSON.stringify(pageData, null, 2));

        // Purge old layout imports from page.css
        if (fs.existsSync(cssPath)) {
            let cssContent = fs.readFileSync(cssPath, 'utf8');
            const importRegex = /@import\s+url\(['"]\/layouts\/styles\/.*?\.css['"]\);/g;
            cssContent = cssContent.replace(importRegex, '');
            fs.writeFileSync(cssPath, cssContent);
        }

        await VolumeService.syncSinglePage(volumeId, chapterId, pageId, seriesFolderName);
        return layoutId;
    }

    /**
     * Resolves all available panels for a page by parsing its layout template and CSS.
     */
    static async getPanels(series, volume, chapter, pageId) {
        const seriesFolderName = await this.getSeriesFolderName(series);
        const seriesPath = await resolveSeriesPath(seriesFolderName);
        const pageDir = path.join(seriesPath, "Volumes", volume, chapter, pageId);
        const cssPath = path.join(pageDir, `page.css`);

        let layoutId = "Standard_Page";
        const atomicPath = path.join(pageDir, 'page.json');
        let isSpread = false;

        if (fs.existsSync(atomicPath)) {
            const atomic = JSON.parse(fs.readFileSync(atomicPath, 'utf8'));
            if (atomic.header?.spread && atomic.header.spread.type !== 'none') isSpread = true;
            
            // Partner check if not explicitly marked
            if (!isSpread) {
                const match = pageId.match(/page(\d+)/i);
                if (match) {
                    const pageNum = parseInt(match[1]);
                    const prevPageId = `page${pageNum - 1}`;
                    const prevAtomicPath = path.join(seriesPath, "Volumes", volume, chapter, prevPageId, 'page.json');
                    if (fs.existsSync(prevAtomicPath)) {
                        const prevAtomic = JSON.parse(fs.readFileSync(prevAtomicPath, 'utf8'));
                        if (prevAtomic.header?.spread && prevAtomic.header.spread.type === 'left') isSpread = true;
                    }
                }
            }
            
            layoutId = atomic.header?.layout?.id || atomic.header?.portraitLayout?.id || atomic.header?.layouts?.portrait?.id || layoutId;
        }

        const templatePath = path.join(layoutsDir, 'portrait', `${layoutId}.html`);
        let combinedContent = "";

        if (fs.existsSync(cssPath)) {
            combinedContent = fs.readFileSync(cssPath, "utf8");
            const importRegex = /@import\s+url\(['"](.+?)['"]\);/g;
            let importMatch;
            while ((importMatch = importRegex.exec(combinedContent)) !== null) {
                let relativePath = importMatch[1].replace(/['"]/g, "").trim();
                const absImportPath = relativePath.startsWith('/')
                    ? path.join(__dirname, '..', 'Library', relativePath.replace(/^\/layouts/, 'layouts'))
                    : path.resolve(pageDir, relativePath);
                if (fs.existsSync(absImportPath)) combinedContent += "\n" + fs.readFileSync(absImportPath, "utf8");
            }
        }

        let panels = new Set();
        if (fs.existsSync(templatePath)) {
            const templateHtml = fs.readFileSync(templatePath, "utf8");
            panels = PanelService.getPanelsFromTemplate(templateHtml);
        } else {
            // Regex Fallback
            const panelRegex = /\.panel-[a-zA-Z0-9_-]+/g;
            let match;
            while ((match = panelRegex.exec(combinedContent)) !== null) panels.add(match[0]);
            
            const nthPanelRegex = /\.page-layout\s*>\s*:nth-child\((\d+)\)/g;
            let maxNth = 0;
            while ((match = nthPanelRegex.exec(combinedContent)) !== null) {
                const num = parseInt(match[1]);
                if (num > maxNth) maxNth = num;
            }
            if (maxNth > 0) for (let i = 1; i <= maxNth; i++) panels.add(`.panel-${i}`);
        }

        return { panels: Array.from(panels).sort(), layoutClass: layoutId, isSpread };
    }

    /**
     * Toggles spread pairing between a left and right page by updating both page.jsons.
     */
    static async toggleSpread(volumeId, chapterId, pageId, enabled) {
        const Volume = require('../models/Volume');
        const volume = await Volume.findById(volumeId);
        if (!volume) throw new Error("Volume not found");

        const normalizedPath = volume.volumePath.replace(/\\/g, '/');
        const pathParts = normalizedPath.split('/');
        const volumesIdx = pathParts.indexOf('Volumes');
        const seriesFolderName = (volumesIdx > 0) ? pathParts[volumesIdx - 1] : pathParts[1];
        const seriesPath = await resolveSeriesPath(seriesFolderName);
        const volumeSubFolder = path.basename(volume.volumePath);

        const pageMatch = pageId.match(/page(\d+)/i);
        if (!pageMatch) throw new Error("Invalid pageId format");
        
        const pageNum = parseInt(pageMatch[1]);
        const isLeft = pageNum % 2 === 0;

        const partnerNum = isLeft ? pageNum + 1 : pageNum - 1;
        const partnerId = `page${partnerNum}`;

        const updatePage = (pId, type) => {
            const pPath = path.join(seriesPath, 'Volumes', volumeSubFolder, chapterId, pId, 'page.json');
            if (fs.existsSync(pPath)) {
                const data = JSON.parse(fs.readFileSync(pPath, 'utf8'));
                if (!data.header) data.header = {};
                data.header.spread = enabled ? { type, isBroken: false } : { type: 'none', isBroken: false };
                fs.writeFileSync(pPath, JSON.stringify(data, null, 2));
                return true;
            }
            return false;
        };

        updatePage(pageId, isLeft ? 'left' : 'right');
        updatePage(partnerId, isLeft ? 'right' : 'left');
    }
}

module.exports = LayoutService;