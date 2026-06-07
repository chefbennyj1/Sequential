const LayoutService = require("../services/LayoutService");
const PreviewService = require("../services/PreviewService");

exports.getLayouts = (req, res) => {
    try {
        const layouts = LayoutService.getLayouts();
        res.json({ ok: true, layouts });
    } catch (err) {
        res.status(500).json({ ok: false, message: "Failed to list layouts" });
    }
};

exports.getNextPanelId = async (req, res) => {
    const { series, volume, chapter, pageId } = req.query;
    if (!series || !volume || !chapter || !pageId) {
        return res.status(400).json({ ok: false, message: "Missing required parameters" });
    }
    try {
        const nextId = await LayoutService.getNextPanelId(series, volume, chapter, pageId);
        res.json({ ok: true, nextPanelId: nextId });
    } catch (err) {
        console.error("getNextPanelId error:", err);
        res.status(500).json({ ok: false, message: err.message });
    }
};

exports.changeLayout = async (req, res) => {
    const { volumeId, chapterId, pageId, layout } = req.body;
    if (!volumeId || !chapterId || !pageId || !layout) {
        return res.status(400).json({ ok: false, message: "Missing required fields" });
    }
    try {
        const layoutId = await LayoutService.changeLayout(volumeId, chapterId, pageId, layout);
        res.json({ ok: true, message: `Layout updated to ${layoutId}` });
    } catch (e) {
        console.error("Change Layout Error:", e);
        const status = (e.message === "Volume not found" || e.message === "page.json not found") ? 404 : 500;
        res.status(status).json({ ok: false, message: e.message });
    }
};

exports.getPanels = async (req, res) => {
    const { series, volume, chapter, pageId } = req.params;
    if (!series || !volume || !chapter || !pageId) {
        return res.status(400).json({ ok: false, message: "Missing required parameters" });
    }
    try {
        const result = await LayoutService.getPanels(series, volume, chapter, pageId);
        res.json({ ok: true, ...result });
    } catch (err) {
        res.status(500).json({ ok: false, message: "Failed to parse panels" });
    }
};

exports.toggleSpread = async (req, res) => {
    const { volumeId, chapterId, pageId, enabled } = req.body;
    console.log(`[PageLayoutController] Toggle Spread: ${pageId} (${enabled})`);
    try {
        await LayoutService.toggleSpread(volumeId, chapterId, pageId, enabled);
        res.json({ ok: true, message: `Spread ${enabled ? 'enabled' : 'disabled'}` });
    } catch (e) {
        console.error("[PageLayoutController] Toggle Spread Error:", e);
        res.status(500).json({ ok: false, message: e.message });
    }
};

exports.servePreview = async (req, res) => {
    try {
        const { series, volume, chapter, pageId } = req.params;
        const previewData = await PreviewService.generatePreviewData(series, volume, chapter, pageId);
        
        res.render("dashboard/studio/preview/preview", {
            series: previewData.seriesFolderName,
            volume: previewData.volume,
            chapter: previewData.chapter,
            pageId: previewData.pageId,
            isSpread: previewData.isSpread,
            leftPage: previewData.leftPage,
            rightPage: previewData.rightPage
        });
    } catch (err) {
        console.error("Preview Error:", err);
        if (err.message === "Page not found") {
            return res.status(404).send("Page not found");
        }
        res.status(500).send("Error serving preview");
    }
};