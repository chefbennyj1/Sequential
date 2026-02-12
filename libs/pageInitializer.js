// libs/pageInitializer.js
import { fetchScene, fetchMedia, loadCSS, imageMaskReveal, resolveMediaUrl, fetchVolumeAudioMap } from '/libs/Utility.js';
import { initScene } from '/services/public/SceneManager.js';
import { initMedia, startMediaPlayback, stopMediaPlayback, restartMediaPlayback, preloadAllMedia, fadeElement } from '/services/public/MediaManager.js';

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
        loadCSS('/libs/TextBlock/TextBlock.css', true)
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

    const [sceneData, mediaResponse, audioMap] = await Promise.all([
        cachedScene ? Promise.resolve(cachedScene) : fetchScene(volume, chapter, pageId, pageInfo.series),
        cachedMedia ? Promise.resolve(cachedMedia) : fetchMedia(volume, chapter, pageId, pageInfo.series),
        fetchVolumeAudioMap(volume)
    ]);

    if (abortSignal?.aborted) return;

    setupBackgroundAudio(pageId, volume, audioMap, pageInfo);
    const ambientData = await prepareAmbientAudioData(pageId, mediaResponse, pageInfo);

    if (abortSignal?.aborted) return;

    const { videoElements, playlistManagers } = initMedia(container, pageInfo, mediaResponse.media);
    registerVideoAudio(pageId, videoElements);

    if (abortSignal?.aborted) return;

    const sceneController = await initScene(container, pageInfo, sceneData);

    if (abortSignal?.aborted) {
        if (sceneController?.cleanup) sceneController.cleanup();
        return;
    }

    container.addEventListener('view_visible', async () => {
        if (!container.classList.contains("active")) return;

        if (window.audioStateManager) {
            if (ambientData && ambientData.url) {
                window.audioStateManager.playAmbientAudio(ambientData.url, ambientData.volume);
            } else {
                window.audioStateManager.playAmbientAudio(null);
            }
        }

        await imageMaskReveal(allPanels, gifUrl);
        await preloadAllMedia(videoElements, pageId);
        startMediaPlayback(videoElements, pageInfo, mediaResponse.sequentialVideoPlayback);
        if (sceneController?.restart) sceneController.restart();
    });

    container.addEventListener('view_hidden', () => {
        stopMediaPlayback(videoElements, playlistManagers);
        if (sceneController?.cleanup) sceneController.cleanup();
        if (window.audioStateManager) window.audioStateManager.unregisterAllPageAudio(pageId);

        allPanels.forEach(p => {
            p.style.webkitMaskImage = '';
            p.style.maskImage = '';
        });
    });

    console.log(`PageInitializer - ${pageId} - Loaded`);
}

function setupBackgroundAudio(pageId, volume, audioMap, pageInfo) {
    if (!window.audioStateManager) return;

    const entry = audioMap.find(item => item.pages.includes(pageId));
    if (!entry || !entry.fileName) {
        window.audioStateManager.playBackgroundAudio(null);
        return;
    }

    const series = pageInfo.series || "No_Overflow";
    const url = entry.fileName.includes('://')
        ? resolveMediaUrl(entry.fileName, 'audio', pageInfo, true)
        : `/Library/${series}/Volumes/${volume}/assets/audio/${entry.fileName}?t=${Date.now()}`;

    window.audioStateManager.playBackgroundAudio(url, entry.volume || 1.0);
}

async function prepareAmbientAudioData(pageId, mediaResponse, pageInfo) {
    const data = mediaResponse.ambientAudio;
    if (!data || !data.fileName) return null;

    const url = resolveMediaUrl(data.fileName, 'audio', pageInfo, true);
    const volume = data.volume !== undefined ? data.volume : 1.0;

    return { url, volume };
}

function registerVideoAudio(pageId, videoElements) {
    if (!window.audioStateManager) return;
    videoElements.forEach(v => {
        if (v.dataset.audioEnabled === 'true') window.audioStateManager.registerAudio(v, pageId, true);
    });
}
