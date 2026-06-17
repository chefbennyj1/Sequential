const fs = require("fs");
const path = require("path");
const { resolveSeriesPath } = require("./MediaService");
const LayoutService = require("./LayoutService");

class PreviewService {
    static async generatePreviewData(series, volume, chapter, pageId) {
        const seriesFolderName = await LayoutService.getSeriesFolderName(series);
        const seriesPath = await resolveSeriesPath(seriesFolderName);
        const volumesDir = path.join(seriesPath, "Volumes");
        
        const getPageContent = (pId) => {
            const atomicPath = path.join(volumesDir, volume, chapter, pId, 'page.json');
            if (!fs.existsSync(atomicPath)) return null;
            const atomic = JSON.parse(fs.readFileSync(atomicPath, 'utf8'));
            
            const layoutId = atomic.header?.layout?.id ?? "Standard_Page";
            const templatePath = path.join(__dirname, '..', 'Library', 'layouts', 'portrait', `${layoutId}.html`);
            const html = fs.existsSync(templatePath) ? fs.readFileSync(templatePath, 'utf8') : `<div class="page-layout ${layoutId}">Layout Not Found</div>`;
            return { html, layoutId, spread: atomic.header?.spread };
        };

        let mainPage = getPageContent(pageId);
        if (!mainPage) throw new Error("Page not found");

        let leftPage = null;
        let rightPage = null;
        let isSpread = false;

        if (!mainPage.spread || mainPage.spread.type === 'none') {
            const pageMatch = pageId.match(/page(\d+)/i);
            if (pageMatch) {
                const pageNum = parseInt(pageMatch[1]);
                const isPotentialLeft = pageNum % 2 === 0;
                const partnerId = `page${isPotentialLeft ? pageNum + 1 : pageNum - 1}`;
                const partnerPage = getPageContent(partnerId);
                if (partnerPage && partnerPage.spread && partnerPage.spread.type !== 'none') {
                    mainPage.spread = { type: partnerPage.spread.type === 'left' ? 'right' : 'left', isBroken: false };
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

        return { seriesFolderName, volume, chapter, pageId, isSpread, leftPage, rightPage };
    }
}

module.exports = PreviewService;