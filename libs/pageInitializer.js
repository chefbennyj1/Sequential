// libs/pageInitializer.js
import { fetchScene, fetchMedia, loadCSS, imageMaskReveal, resolveMediaUrl } from '/libs/Utility.js';
import { initScene } from '/services/public/SceneManager.js';
import { initMedia, fadeElement } from '/services/public/MediaManager.js';

/**
 * Page Initializer
 * Static version - Media Actions removed.
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

    container.addEventListener('dialogueAudioStarted', (e) => {
        const { dialogueItem } = e.detail;
        if (dialogueItem?.panelEffect && dialogueItem.placement?.panel) {
            applyPanelEffect(container, dialogueItem.placement.panel, dialogueItem.panelEffect);
        }
    });

    console.log(`PageInitializer - ${pageId} - Loaded`);
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
