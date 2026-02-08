// libs/pageInitializer.js
import { fetchScene, fetchMedia, loadCSS, imageMaskReveal, resolveMediaUrl, fetchVolumeAudioMap } from '/libs/Utility.js';
import { initScene } from '/services/public/SceneManager.js';
import { initMedia, startMediaPlayback, stopMediaPlayback, restartMediaPlayback, preloadAllMedia, fadeElement, playManuallyTriggeredVideo } from '/services/public/MediaManager.js';
import AudioStateManager from '/services/public/AudioStateManager.js';
import PlaylistManager from '/services/public/PlaylistManager.js';

/**
 * Page Initializer
 * Refactored with Guard Clauses to avoid "If Soup" and improve stability.
 * Now supports optional cached data and AbortSignal to prevent "zombie" initializations.
 */
export async function init(container, pageInfo, cachedScene = null, cachedMedia = null, abortSignal = null) {
    if (!container || !pageInfo) return;
    if (abortSignal?.aborted) return;

    const { pageId, chapter, volume } = pageInfo;
    console.log(`PageInitializer - ${pageId} - Initializing`);

    // 1. Core Setup (Non-blocking font load)
    const coreTasks = [
        loadCSS('/libs/SpeechBubble/SpeechBubble.css'),
        loadCSS('/libs/TextBlock/TextBlock.css')
    ];

    try {
        document.fonts.load('1em "Comic Book"');
    } catch (e) {
        console.warn("Font loading failed, continuing anyway.");
    }

    await Promise.all(coreTasks);
    if (abortSignal?.aborted) return;

    const pageContainer = container.querySelector('.section-container') || container;
    if (pageContainer !== container) pageContainer.classList.add(pageId);

    const allPanels = container.querySelectorAll('.panel');
    const gifUrl = "/libs/panel_mask_image.gif";

    // 2. Data Fetching (Use cache if available)
    const [sceneData, mediaResponse, audioMap] = await Promise.all([
        cachedScene ? Promise.resolve(cachedScene) : fetchScene(volume, chapter, pageId, pageInfo.series),
        cachedMedia ? Promise.resolve(cachedMedia) : fetchMedia(volume, chapter, pageId, pageInfo.series),
        fetchVolumeAudioMap(volume)
    ]);

    if (abortSignal?.aborted) return;

    // 3. Audio Setup (Background & Ambient)
    setupBackgroundAudio(pageId, volume, audioMap, pageInfo);
    const ambientData = await prepareAmbientAudioData(pageId, mediaResponse, pageInfo);

    if (abortSignal?.aborted) return;

    // 4. Media & Scene Controllers
    const { videoElements, playlistManagers } = initMedia(container, pageInfo, mediaResponse.media);
    registerVideoAudio(pageId, videoElements);

    if (abortSignal?.aborted) return;

    const sceneController = await initScene(container, pageInfo, sceneData);

    if (abortSignal?.aborted) {
        if (sceneController?.cleanup) sceneController.cleanup();
        return;
    }

    // 5. Event Listeners (Using Guard Clauses)

    container.addEventListener('view_visible', async () => {
        if (!container.classList.contains("active")) return;

        // Start Global Ambient (Crossfading managed by AudioStateManager)
        if (window.audioStateManager) {
            if (ambientData && ambientData.url) {
                window.audioStateManager.playAmbientAudio(ambientData.url, ambientData.volume);
            } else {
                window.audioStateManager.playAmbientAudio(null);
            }
        }

        await imageMaskReveal(allPanels, gifUrl);

        // Full sequence start
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

    container.addEventListener('dialogueAudioStarted', (e) => {
        const { dialogueItem, duration } = e.detail;
        if (!dialogueItem) return;

        const actions = Array.isArray(dialogueItem.mediaAction) ? dialogueItem.mediaAction : (dialogueItem.mediaAction ? [dialogueItem.mediaAction] : []);
        actions.forEach(action => processMediaAction(container, action, dialogueItem, pageInfo, playlistManagers, sceneController, duration));
    });

    container.addEventListener('cueEnded', (e) => {
        const { dialogueItem } = e.detail;
        if (!dialogueItem) return;

        const actions = Array.isArray(dialogueItem.mediaAction) ? dialogueItem.mediaAction : (dialogueItem.mediaAction ? [dialogueItem.mediaAction] : []);
        actions.forEach(action => handleCueEndAction(container, action, dialogueItem));
    });

    console.log(`PageInitializer - ${pageId} - Loaded`);
}

/** 
 * Logic Helpers 
 */

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

/**
 * Media Action Processor
 */
async function processMediaAction(container, action, dialogueItem, pageInfo, playlistManagers, sceneController, overrideDuration = null) {
    if (!action) return;

    // 1. Audio Change Guard (No Panel Required)
    if (action.type === 'backgroundAudio' || action.type === 'ambientAudio') {
        executeAudioChange(action, pageInfo);
        return;
    }

    if (!action.panel) return;

    const panelSelector = (action.panel.startsWith('.') || action.panel.startsWith('#')) ? action.panel : `.${action.panel}`;
    const panel = container.querySelector(panelSelector);
    if (!panel) return;

    // 2. Camera Guard
    // ONLY trigger here if we are NOT swapping media (i.e. no fileName provided)
    // If swapping, the swap handlers (executeVideoSwap/executeImageSwap) will trigger it on the new element.
    if (!action.fileName && action.type !== 'Playlist') {
        triggerMotionEffect(panel, action.cameraAction, overrideDuration);
    }

    // 3. Playback Control Guard (for play/pause actions on existing videos)
    if (!action.fileName && action.type !== 'Playlist') {
        handleVideoPlaybackControl(panel, action, dialogueItem);
        return;
    }

    // 4. Media Swap Logic
    // Clear existing Playlists on this panel before starting a new media swap or playlist
    const activePM = playlistManagers.find(pm => pm.panelElement === panel);
    if (activePM) {
        activePM.destroy();
        const idx = playlistManagers.indexOf(activePM);
        if (idx > -1) playlistManagers.splice(idx, 1);
    }

    // 5. Route to specific type handler
    if (action.type === 'video') executeVideoSwap(panel, action, dialogueItem, pageInfo);
    else if (action.type === 'image') executeImageSwap(panel, action, dialogueItem, pageInfo);
    else if (action.type === 'Playlist') executePlaylistAction(panel, action, dialogueItem, pageInfo, playlistManagers, sceneController);
}

/**
 * AUDIO CHANGE HANDLER
 */
function executeAudioChange(action, pageInfo) {
    if (!window.audioStateManager) return;

    const url = action.fileName ? resolveMediaUrl(action.fileName, 'audio', pageInfo) : null;
    const volume = action.volume !== undefined ? parseFloat(action.volume) : 1.0;

    if (action.type === 'backgroundAudio') {
        window.audioStateManager.playBackgroundAudio(url, volume);
    } else if (action.type === 'ambientAudio') {
        window.audioStateManager.playAmbientAudio(url, volume);
    }
}

/**
 * CAMERA ACTION GUARD
 */
async function triggerMotionEffect(target, camAction, overrideDuration = null) {
    if (!camAction || !camAction.type || camAction.type === 'none') return;

    try {
        const { applyCameraAction } = await import('/services/public/CameraManager.js');
        if (typeof applyCameraAction === 'function') {
            applyCameraAction(target, camAction, overrideDuration);
        }
    } catch (e) {
        console.warn("CameraManager not available for motion effect.");
    }
}

/**
 * Helper to dispatch panel state changes
 */
function dispatchPanelEvent(panel, detail) {
    const event = new CustomEvent('panel_media_changed', {
        bubbles: true,
        detail: {
            panelSelector: detail.panelSelector,
            type: detail.type,
            fileName: detail.fileName,
            action: detail.action || 'load'
        }
    });
    panel.dispatchEvent(event);
}

/**
 * Media Swap Handlers
 */
async function executeVideoSwap(panel, action, dialogueItem, pageInfo) {
    const videoUrl = resolveMediaUrl(action.fileName, 'video', pageInfo);
    const existingMedia = panel.querySelector('video, img');

    if (existingMedia && !action.crossfade) {
        await fadeElement(existingMedia, 'out', action.transitionDuration || 500);
        existingMedia.remove();
    }

    const v = document.createElement('video');
    v.src = videoUrl;
    v.style.cssText = "width:100%; height:100%; object-fit:cover; opacity:0; transition:opacity " + (action.transitionDuration || 500) + "ms ease-in-out;";
    v.dataset.activeCueId = dialogueItem.id;
    v.dataset.forceStopped = 'false';

    if (action.crossfade) {
        v.style.position = 'absolute'; v.style.top = '0'; v.style.left = '0'; v.style.zIndex = '2';
        if (getComputedStyle(panel).position === 'static') panel.style.position = 'relative';
    }

    v.setAttribute('playsinline', ''); v.setAttribute('disablePictureInPicture', '');
    v.muted = true; v.loop = action.loop !== undefined ? action.loop : true;
    if (action.posterName) v.poster = resolveMediaUrl(action.posterName, 'image', pageInfo);
    if (action.attributes) Object.entries(action.attributes).forEach(([k, val]) => v.setAttribute(k, val));

    panel.appendChild(v);

    const onCanPlay = async () => {
        if (v.dataset.forceStopped === 'true') return;

        v.play().catch(e => console.warn("Video swap play failed", e));
        triggerMotionEffect(v, action.cameraAction);

        if (action.crossfade && existingMedia) {
            await Promise.all([
                fadeElement(v, 'in', action.transitionDuration || 500),
                fadeElement(existingMedia, 'out', action.transitionDuration || 500)
            ]);
            existingMedia.remove();
            v.style.position = ''; v.style.zIndex = '';
        } else {
            await fadeElement(v, 'in', action.transitionDuration || 500);
        }
    };

    if (v.readyState >= 4) onCanPlay();
    else v.addEventListener('canplaythrough', onCanPlay, { once: true });

    dispatchPanelEvent(panel, {
        panelSelector: action.panel,
        type: 'video',
        fileName: action.fileName,
        action: 'load'
    });
}

async function executeImageSwap(panel, action, dialogueItem, pageInfo) {
    const imageUrl = resolveMediaUrl(action.fileName, 'image', pageInfo);
    const existingMedia = panel.querySelector('video, img');

    const img = document.createElement('img');
    img.src = imageUrl;
    img.style.cssText = "width:100%; height:100%; object-fit:cover; opacity:0; transition:opacity " + (action.transitionDuration || 500) + "ms ease-in-out;";

    if (action.attributes) Object.entries(action.attributes).forEach(([k, v]) => img.setAttribute(k, v));
    if (action.style) Object.entries(action.style).forEach(([k, v]) => img.style[k] = v);

    if (action.crossfade && existingMedia) {
        if (getComputedStyle(panel).position === 'static') panel.style.position = 'relative';
        img.style.position = 'absolute'; img.style.top = '0'; img.style.left = '0'; img.style.zIndex = '2';
        panel.appendChild(img);

        triggerMotionEffect(img, action.cameraAction);

        await Promise.all([
            fadeElement(img, 'in', action.transitionDuration || 500),
            fadeElement(existingMedia, 'out', action.transitionDuration || 500)
        ]);
        existingMedia.remove();
        img.style.position = ''; img.style.zIndex = '';
    } else {
        if (existingMedia) {
            await fadeElement(existingMedia, 'out', action.transitionDuration || 500);
            existingMedia.remove();
        }
        panel.appendChild(img);
        triggerMotionEffect(img, action.cameraAction);
        await fadeElement(img, 'in', action.transitionDuration || 500);
    }

    dispatchPanelEvent(panel, {
        panelSelector: action.panel,
        type: 'image',
        fileName: action.fileName,
        action: 'load'
    });
}

async function executePlaylistAction(panel, action, dialogueItem, pageInfo, playlistManagers, sceneController) {
    if (!action.items || action.items.length === 0) return;

    // Check for active PlaylistManager on this panel and destroy it
    const existingPM = playlistManagers.find(pm => pm.panelElement === panel);
    if (existingPM) {
        existingPM.destroy();
        const idx = playlistManagers.indexOf(existingPM);
        if (idx > -1) playlistManagers.splice(idx, 1);
    }

    const pm = new PlaylistManager(panel, action, pageInfo);
    playlistManagers.push(pm);

    if (action.waitForCompletion) {
        await pm.play();
        if (sceneController?.signalMediaActionCompletion) {
            sceneController.signalMediaActionCompletion(dialogueItem.id);
        }
    } else {
        pm.play();
    }
}

function handleVideoPlaybackControl(panel, action, dialogueItem) {
    const v = panel.querySelector('video');
    if (!v) return;

    if (action.action === 'play') {
        v.dataset.activeCueId = dialogueItem.id;
        v.dataset.forceStopped = 'false';
        v.loop = action.loop !== undefined ? action.loop : (v.dataset.shouldLoop === 'true' || true);
        playManuallyTriggeredVideo(v);
    } else if (action.action === 'pause') {
        v.pause();
    }

    dispatchPanelEvent(panel, {
        panelSelector: `.panel-${panel.className.match(/panel-([a-zA-Z0-9]+)/)?.[1] || ''}`,
        type: 'video',
        fileName: v.src.split('/').pop(),
        action: action.action
    });
}
/**
 * End of Cue Handlers
 */
async function handleCueEndAction(container, action, dialogueItem) {
    if (!action || !action.panel) return;
    const panel = container.querySelector(action.panel);
    if (!panel) return; //Why are we checking this, we already checked !action.panel above?

    // 1. Camera Reset Guard
    if (action.cameraAction?.resetOnEnd) {
        try {
            const { resetCamera } = await import('/services/public/CameraManager.js');
            if (typeof resetCamera === 'function') resetCamera(panel);
        } catch (e) { }
    }

    // 2. Sync to Dialogue Guard
    if (!action.syncToDialogue) return;

    const videos = panel.querySelectorAll('video');
    videos.forEach(v => {
        if (v.dataset.activeCueId !== dialogueItem.id) return;

        v.dataset.forceStopped = 'true';
        v.loop = false;
        v.pause();
        v.currentTime = 0;

        // Double-check to prevent "zombie" videos
        setTimeout(() => {
            if (!v.paused && v.dataset.activeCueId === dialogueItem.id) v.pause();
        }, 100);
    });
}
