// libs/pageInitializer.js
import { fetchScene, fetchMedia, loadCSS, imageMaskReveal, resolveMediaUrl } from '/libs/Utility.js';
import { initScene } from '/services/public/SceneManager.js';
import { applyExportMatchScale } from '/libs/ExportMatchScale.js';

// The reader's page is sized in vh (page.css: 94vh), so its actual on-screen
// height depends on the browser window — unlike the editor's preview pane,
// it can change after load if the reader resizes their window. One listener,
// set up once, re-applies the scale to every currently-loaded page (offsetHeight
// is transform-invariant — see ExportMatchScale.js — so it's safe to reapply
// to inactive/preloaded pages too, not just the visible one).
let resizeListenerAttached = false;
function ensureResizeListener() {
    if (resizeListenerAttached) return;
    resizeListenerAttached = true;
    window.addEventListener('resize', () => {
        document.querySelectorAll('.section-container.page').forEach(applyExportMatchScale);
    });
}

/**
 * Page Initializer
 * Static version - Media Actions removed.
 * Consistently handles image initialization and scene logic.
 */
export async function init(container, pageInfo, cachedScene = null, cachedMedia = null, abortSignal = null) {
    if (!container || !pageInfo) return;
    if (abortSignal?.aborted) return;

    const { pageId, chapter, volume } = pageInfo;
    console.log(`PageInitializer - ${pageId} - Initializing`);

    const coreTasks = [
        loadCSS('/libs/SpeechBubble/SpeechBubble.css', true),
        loadCSS('/libs/TextBlock/TextBlock.css', true),
        loadCSS('/libs/ActionText/ActionText.css', true)
    ];

    try {
        document.fonts.load('1em "Comic Book"');
    } catch (e) {}

    await Promise.all(coreTasks);
    if (abortSignal?.aborted) return;

    const pageContainer = container.querySelector('.section-container') || container;
    if (pageContainer !== container) pageContainer.classList.add(pageId);

    const allPanels = container.querySelectorAll('.panel');
    const gifUrl = "/libs/panel_mask_image.gif";

    const [sceneData, mediaResponse] = await Promise.all([
        cachedScene ? Promise.resolve(cachedScene) : fetchScene(volume, chapter, pageId, pageInfo.series),
        cachedMedia ? Promise.resolve(cachedMedia) : fetchMedia(volume, chapter, pageId, pageInfo.series)
    ]);

    if (abortSignal?.aborted) return;

    // Initialize media (images) locally
    initMedia(container, pageInfo, mediaResponse.media);

    if (abortSignal?.aborted) return;

    const sceneController = await initScene(container, pageInfo, sceneData, mediaResponse.media);

    if (abortSignal?.aborted) {
        if (sceneController?.cleanup) sceneController.cleanup();
        return;
    }

    ensureResizeListener();

    // Match export's bubble/text-block sizing (see libs/ExportMatchScale.js).
    // offsetHeight is used there specifically so this is safe to call right
    // here regardless of whether this page is currently active, entering, or
    // sitting off-screen mid zoom-scroll-out (viewer.css transforms don't
    // affect it) — no need to gate this on any active/visible check.
    applyExportMatchScale(pageContainer);

    container.addEventListener('view_visible', async () => {
        if (!container.classList.contains("active")) return;

        window.isRevealing = false;

        if (sceneController?.restart) sceneController.restart();
    });

    container.addEventListener('view_hidden', () => {
        if (sceneController?.cleanup) sceneController.cleanup();

        allPanels.forEach(p => {
            const mediaElements = p.querySelectorAll('img');
            mediaElements.forEach(el => {
                el.style.webkitMaskImage = '';
                el.style.maskImage = '';
            });
        });
    });

    console.log(`PageInitializer - ${pageId} - Loaded`);
}

/**
 * Internal helper to fade an element
 */
export function fadeElement(element, direction, duration = 500) {
    return new Promise(resolve => {
        const endOpacity = direction === 'out' ? 0 : 1;
        element.style.transition = `opacity ${duration}ms ease`;

        setTimeout(() => {
            element.style.opacity = endOpacity;
        }, 20);

        setTimeout(resolve, duration);
    });
}

/**
 * Initializes image media into panels
 */
function initMedia(container, pageInfo, mediaDataArray) {
    const { pageId } = pageInfo;

    console.log(`PageInitializer - ${pageId} - Initializing ${mediaDataArray.length} media items.`);
    
    for (const media of mediaDataArray) {
        const selector = media.panel.startsWith('.') ? media.panel : '.' + media.panel;
        let panel = container.querySelector(selector);

        // --- Handle Floating Panels ---
        if (!panel && media.isFloating) {
            console.log(`PageInitializer - ${pageId} - Creating floating panel ${media.panel}`);
            panel = document.createElement('div');
            const panelClass = media.panel.startsWith('.') ? media.panel.substring(1) : media.panel;
            panel.className = `panel ${panelClass} floating-panel`;
            
            panel.style.position = 'absolute';
            
            const visualProps = ['objectFit', 'objectPosition', 'transform', 'transformOrigin', 'filter', 'opacity'];
            
            if (media.style) {
                for (const prop in media.style) {
                    if (!visualProps.includes(prop)) {
                        panel.style[prop] = media.style[prop];
                    }
                }
            }
            
            const pageContainer = container.querySelector('.section-container') || container.querySelector('.page-layout') || container;
            pageContainer.appendChild(panel);
        }

        if (panel) {
            panel.innerHTML = ''; // Ensure panel is empty before adding image
            if (media.type === 'image') {
                const img = document.createElement('img');
                img.src = resolveMediaUrl(media.fileName, 'image', pageInfo);
                
                if (media.attributes) {
                    for (const attr in media.attributes) {
                        img.setAttribute(attr, media.attributes[attr]);
                    }
                }
                
                // Default fallback styles
                img.style.width = '100%';
                img.style.height = '100%'; // Image fills the panel
                img.style.objectFit = 'cover';
                img.style.objectPosition = 'center';

                // Apply styles from media.json
                const visualProps = ['objectFit', 'objectPosition', 'transform', 'transformOrigin', 'filter', 'opacity'];
                
                if (media.style) {
                    for (const prop in media.style) {
                        if (!media.isFloating || visualProps.includes(prop)) {
                            img.style[prop] = media.style[prop];
                        }
                    }
                }
                
                if (media.imageStyle) {
                    for (const prop in media.imageStyle) {
                        img.style[prop] = media.imageStyle[prop];
                    }
                }
                
                if (window.GEMINI_PORTRAIT_MODE && media.portraitStyle) {
                    for (const prop in media.portraitStyle) {
                        const target = (media.isFloating && !visualProps.includes(prop)) ? panel : img;
                        target.style[prop] = media.portraitStyle[prop];
                    }
                }

                panel.appendChild(img);

                // Add Overlay if exists
                if (media.overlayImage) {
                    const overlayImg = document.createElement('img');
                    overlayImg.src = resolveMediaUrl(media.overlayImage, 'image', pageInfo);
                    overlayImg.style.position = 'absolute';
                    overlayImg.style.inset = '0';
                    overlayImg.style.width = '100%';
                    overlayImg.style.height = '100%';
                    overlayImg.style.objectFit = 'cover';
                    overlayImg.style.pointerEvents = 'none';
                    overlayImg.style.zIndex = '5';
                    overlayImg.style.opacity = media.overlayOpacity !== undefined ? media.overlayOpacity : '1';
                    panel.appendChild(overlayImg);
                }
            }
        }
    }
}
