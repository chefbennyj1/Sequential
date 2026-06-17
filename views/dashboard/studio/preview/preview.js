import { PreviewPageController } from "./PreviewPageController.js";

export async function init(container, params) {
    const pages = [];
    const pageContainers = container.querySelectorAll('.page-container');
    
    const globalControls = {
        fileInput: document.getElementById('globalPanelUpload'),
        activeUploadTarget: null
    };

    if (globalControls.fileInput) {
        globalControls.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file && globalControls.activeUploadTarget) {
                const { controller, panel, panelClass, label } = globalControls.activeUploadTarget;
                controller.handleUpload(file, panel, panelClass, label);
            }
            globalControls.fileInput.value = ''; 
            globalControls.activeUploadTarget = null;
        });
    }

    for (const pageCont of pageContainers) {
        const pageId = pageCont.dataset.pageId;
        const controller = new PreviewPageController(pageCont, pageId, params, globalControls);
        await controller.init();
        pages.push(controller);
    }

    // CSS aspect-ratio and max-constraints now handle fitting.
    // Logic-based scaling removed to prevent fighting with responsive layout.

    window.addEventListener('message', (e) => {
        const { type, pageId, panel, scene, media } = e.data;
        const targetPage = pages.find(p => p.pageId === pageId);
        
        // Guard: Stop if targeted page is not found
        if (!targetPage && pageId) return;

        const controller = targetPage || pages[0];
        if (!controller) return;

        switch (type) {
            case 'triggerUpload':
                controller.triggerUpload(panel, globalControls);
                break;
            case 'styleUpdate':
            case 'mediaPersisted':
                controller.handleStyleUpdate(e.data);
                break;
            case 'triggerPanelSelection':
                controller.selectPanel(panel);
                break;
            case 'refreshScene':
                controller.loadExistingMedia();
                break;
            case 'updateScene':
                controller.renderScene(scene, media);
                break;
        }
    });

    window.parent.postMessage({ type: 'previewReady', isSpread: params.isSpread, pageId: params.pageId, partnerPageId: params.partnerPageId }, '*');
}
