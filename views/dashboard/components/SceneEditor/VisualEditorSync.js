/**
 * VisualEditorSync.js
 * Handles messaging between the main dashboard and the preview iframe.
 */

export function pushSceneUpdate(iframe, sceneData, mediaData) {
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ 
            type: 'updateScene', 
            scene: sceneData, 
            media: mediaData 
        }, '*');
    }
}

export function pushPanelSelect(iframe, panelSelector) {
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'triggerPanelSelection', panel: panelSelector }, '*');
    }
}

export function pushMediaPersisted(iframe, panelSelector, entry) {
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ 
            type: 'mediaPersisted', 
            panel: panelSelector, 
            entry: entry 
        }, '*');
    }
}

/**
 * Syncs the live preview of a panel as sliders are moved.
 */
export function syncPreviewLive(iframe, panelSelector, activeMode, currentMediaData) {
    if (!iframe || !iframe.contentWindow) return;

    const styles = {};
    const fileName = document.getElementById('visual-asset-name')?.value;
    const overlayImage = document.getElementById('visual-overlay-name')?.value;
    const overlayOpacity = document.getElementById('visual-overlay-opacity')?.value || 1.0;
    const assetType = 'image';

    if (activeMode === 'landscape') {
        const align = document.getElementById('visual-style-object-position')?.value || 'center';
        if (align === 'custom') {
            const x = document.getElementById('ls-x-slider')?.value || '50';
            const y = document.getElementById('ls-y-slider')?.value || '50';
            styles.objectPosition = `${x}% ${y}%`;
            styles.transformOrigin = `${x}% ${y}%`;
        } else if (align === 'contain') {
            styles.objectFit = 'contain';
        } else {
            styles.objectFit = 'cover';
            styles.objectPosition = align === 'cover' ? 'center' : align;
        }

        const scale = document.getElementById('visual-ls-scale')?.value || '1';
        styles.transform = parseFloat(scale) !== 1 ? `scale(${scale})` : 'none';
    } else {
        const align = document.getElementById('visual-portrait-style-object-position')?.value || 'center';
        if (align === 'custom') {
            const x = document.getElementById('pt-x-slider')?.value || '50';
            const y = document.getElementById('pt-y-slider')?.value || '50';
            styles.objectPosition = `${x}% ${y}%`;
            styles.transformOrigin = `${x}% ${y}%`;
        } else if (align === 'contain') {
            styles.objectFit = 'contain';
        } else {
            styles.objectFit = 'cover';
            styles.objectPosition = align === 'cover' ? 'center' : align;
        }

        const scale = document.getElementById('visual-pt-scale')?.value || '1';
        styles.transform = parseFloat(scale) !== 1 ? `scale(${scale})` : 'none';
    }

    // Floating specific
    const floatLeft = document.getElementById('float-left');
    if (floatLeft) {
        styles.left = floatLeft.value + '%';
        styles.top = document.getElementById('float-top').value + '%';
        styles.width = document.getElementById('float-width').value + '%';
        
        const hVal = document.getElementById('float-height').value;
        styles.height = (hVal === 'auto' || hVal.includes('%')) ? hVal : (hVal + '%');
        
        const aspect = document.getElementById('float-aspect').value;
        if (aspect && aspect !== 'none') styles.aspectRatio = aspect;
        
        styles.zIndex = document.getElementById('float-z').value;
    }

    iframe.contentWindow.postMessage({ type: 'styleUpdate', panel: panelSelector, styles, fileName, overlayImage, overlayOpacity, assetType }, '*');
}
