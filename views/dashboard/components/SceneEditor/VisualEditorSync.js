/**
 * VisualEditorSync.js
 * Handles messaging between the main dashboard and the preview iframe.
 */

export function pushSceneUpdate(iframe, sceneData, mediaData, pageId) {
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ 
            type: 'updateScene', 
            scene: sceneData, 
            media: mediaData,
            pageId: pageId
        }, '*');
    }
}

export function pushPanelSelect(iframe, panelSelector, pageId) {
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'triggerPanelSelection', panel: panelSelector, pageId: pageId }, '*');
    }
}

export function pushMediaPersisted(iframe, panelSelector, entry, pageId) {
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ 
            type: 'mediaPersisted', 
            panel: panelSelector, 
            entry: entry,
            pageId: pageId
        }, '*');
    }
}

/**
 * Syncs the live preview of a panel as sliders are moved.
 * Now takes a structured object for robustness.
 */
export function syncPreviewLive(iframe, panelSelector, options = {}) {
    if (!iframe || !iframe.contentWindow) return;

    const { 
        styles = {}, 
        fileName = null, 
        overlayImage = null, 
        overlayOpacity = 1.0, 
        assetType = 'image', 
        pageId = null 
    } = options;

    iframe.contentWindow.postMessage({ 
        type: 'styleUpdate', 
        panel: panelSelector, 
        styles, 
        fileName, 
        overlayImage, 
        overlayOpacity, 
        assetType, 
        pageId 
    }, '*');
}
