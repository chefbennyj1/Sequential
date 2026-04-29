// libs/pageInitializer.js
import { fetchScene, fetchMedia, loadCSS, imageMaskReveal, resolveMediaUrl } from '/libs/Utility.js';
import { initScene } from '/services/public/SceneManager.js';

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

    const sceneController = await initScene(container, pageInfo, sceneData);

    if (abortSignal?.aborted) {
        if (sceneController?.cleanup) sceneController.cleanup();
        return;
    }

    container.addEventListener('view_visible', async () => {
        if (!container.classList.contains("active")) return;

        window.isRevealing = true;
        await imageMaskReveal(allPanels, gifUrl, 5000, mediaResponse.media, pageInfo);
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
        let panel = container.querySelector(media.panel);

        // --- Handle Floating Panels ---
        if (!panel && media.isFloating) {
            console.log(`PageInitializer - ${pageId} - Creating floating panel ${media.panel}`);
            panel = document.createElement('div');
            // media.panel is usually ".panel-E", we strip the dot for the class
            const panelClass = media.panel.startsWith('.') ? media.panel.substring(1) : media.panel;
            panel.className = `panel ${panelClass} floating-panel`;
            
            // Apply floating styles (X, Y, Z, Width, Height)
            if (media.style) {
                for (const prop in media.style) {
                    panel.style[prop] = media.style[prop];
                }
            }
            
            // Add to the main section-container or the container itself
            const pageContainer = container.querySelector('.section-container') || container;
            pageContainer.appendChild(panel);
        }

        if (panel) {
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
                if (media.isFloating) {
                    img.style.height = '100%'; // Image fills the floating container
                } else {
                    img.style.height = '100%';
                }
                img.style.objectFit = 'cover';
                img.style.objectPosition = 'center';

                // Apply custom styles from media.json (this will overwrite defaults like objectPosition)
                // If it's a floating panel, styles are applied to the panel div, 
                // but img-specific styles can still be applied here.
                if (media.style && !media.isFloating) {
                    // For non-floating, styles apply to image
                    for (const prop in media.style) {
                        img.style[prop] = media.style[prop];
                    }
                } else if (media.imageStyle) {
                    // Specific image styles if floating
                    for (const prop in media.imageStyle) {
                        img.style[prop] = media.imageStyle[prop];
                    }
                }
                
                // Apply portrait-specific overrides if active
                if (window.GEMINI_PORTRAIT_MODE && media.portraitStyle) {
                    for (const prop in media.portraitStyle) {
                        const target = media.isFloating ? panel : img;
                        target.style[prop] = media.portraitStyle[prop];
                    }
                }

                // --- Privacy Blinder ---
                if (media.privacy) {
                    const blinder = document.createElement('div');
                    blinder.className = 'panel-privacy-blinder';
                    blinder.innerHTML = '<span>Click to reveal</span>';
                    
                    panel.style.position = 'relative'; // Ensure blinder covers panel
                    panel.appendChild(img);
                    panel.appendChild(blinder);

                    blinder.onclick = (e) => {
                        e.stopPropagation();
                        blinder.style.transition = 'opacity 0.6s ease, filter 0.6s ease';
                        blinder.style.opacity = '0';
                        img.style.transition = 'filter 0.6s ease';
                        img.style.filter = 'none';
                        setTimeout(() => blinder.remove(), 600);
                    };
                    
                    // Initial blur
                    img.style.filter = 'blur(30px)';
                } else {
                    panel.appendChild(img);
                }

                // Apply Panel Effect if specified in media.json
                if (media.panelEffect) {
                    panel.classList.add(`panel-effect-${media.panelEffect}`);
                    if (media.panelEffect === 'memory') panel.classList.add('active-memory');
                }
            }
        }
    }
}

function applyPanelEffect(container, panelSelector, effectType) {
    const panel = container.querySelector(panelSelector);
    if (!panel) return;

    // Remove all existing panel effects
    panel.classList.remove('panel-effect-memory', 'panel-effect-haze', 'panel-effect-glitch', 'panel-effect-cloudy', 'active-memory');

    if (!effectType) return;

    // Apply new effect
    const effectClass = `panel-effect-${effectType}`;
    panel.classList.add(effectClass);
    
    // Add pulsing for memory
    if (effectType === 'memory') {
        panel.classList.add('active-memory');
    }
}
