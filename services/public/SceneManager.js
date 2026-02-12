// services/public/SceneManager.js
import SpeechBubble from '/libs/SpeechBubble/SpeechBubble.js';
import TextBlock from '/libs/TextBlock/TextBlock.js';
import SoundEffect from '/libs/SoundEffect/SoundEffect.js';
import { resolveMediaUrl } from '/libs/Utility.js';

function manageSequentialAudioVisuals(audioVisualItemsToAnimate, container) {
    if (!audioVisualItemsToAnimate || audioVisualItemsToAnimate.length === 0) return { cleanup: () => {}, restart: () => {} };

    let currentIndex = 0;
    let currentAnimationId = 0;
    let currentAudioElement = null;
    let itemEndedListener = null;
    let timeoutId = null;
    
    // Map to store resolve functions for media actions that are "blocking" execution
    const pendingMediaActionResolvers = new Map();

    const animate = async () => { 
        const myAnimationId = currentAnimationId;

        // In Sequential mode, we don't want to hide previous items.
        // We only hide/pause items that are explicitly NOT part of the cumulative reveal if needed,
        // but for a comic experience, we usually want them to stay.
        
        // audioVisualItemsToAnimate.forEach(item => {
        //     if (item.loop) return;
        //     if (item.hide) item.hide();
        //     if (item.pause) item.pause();
        // });

        if (currentAudioElement) {
            currentAudioElement.pause();
            currentAudioElement.currentTime = 0;
            currentAudioElement.removeEventListener('ended', itemEndedListener);
            currentAudioElement = null;
        }
        clearTimeout(timeoutId);

        if (currentIndex >= audioVisualItemsToAnimate.length) {
            console.log(`Animation sequence completed.`);
            return;
        }

        const audioVisualItem = audioVisualItemsToAnimate[currentIndex];
        let cueDuration = audioVisualItem.duration || 2000;

        // 1. Prepare Timers/Promises
        const waitPromises = [];

        // B. Standard Content Duration (Audio/Text/Custom)
        waitPromises.push(new Promise(async (resolve) => {
            let playPromise;
            if (typeof audioVisualItem.play === 'function') {
                playPromise = audioVisualItem.play();
            } else if (audioVisualItem.show) { 
                audioVisualItem.show();
            }

            if (playPromise && typeof playPromise.then === 'function') {
                try {
                    await playPromise; 
                    resolve();
                } catch (e) {
                    console.error("Error during promise-based item playback:", e);
                    resolve();
                }
            }
            else if (audioVisualItem.audioElement) {
                currentAudioElement = audioVisualItem.audioElement;
                
                // Get precise audio duration if possible
                if (currentAudioElement.readyState >= 1) {
                    cueDuration = currentAudioElement.duration * 1000;
                } else {
                    currentAudioElement.addEventListener('loadedmetadata', () => {
                        cueDuration = currentAudioElement.duration * 1000;
                    }, { once: true });
                }

                itemEndedListener = () => {
                    resolve();
                };

                // NEW: Handle Audio Errors (e.g., 404 Missing File) to prevent hanging
                const itemErrorListener = (e) => {
                    console.warn(`SceneManager: Audio failed to load/play (${currentAudioElement.src}). Skipping cue audio.`);
                    resolve();
                };

                currentAudioElement.addEventListener('ended', itemEndedListener);
                currentAudioElement.addEventListener('error', itemErrorListener, { once: true });

                currentAudioElement.play()
                .then(() => {
                    const duration = (currentAudioElement.duration && isFinite(currentAudioElement.duration)) 
                        ? (currentAudioElement.duration * 1000) + 1000 
                        : 5000; 
                    
                    setTimeout(() => {
                        if (currentIndex === audioVisualItemsToAnimate.indexOf(audioVisualItem)) {
                            console.warn("SceneManager: Audio 'ended' event timed out. Forcing next cue.");
                            resolve(); 
                        }
                    }, duration);
                })
                .catch(e => {
                    // This catches play() rejections (e.g. NotAllowedError or 404 if browser detects early)
                    console.warn(`SceneManager audio play() rejected:`, e);
                    // Resolve immediately to show the text anyway
                    resolve();
                });
            }
            else {
                timeoutId = setTimeout(() => {
                    resolve();
                }, cueDuration);
            }
        }));

        // Trigger Media Action with calculated duration
        if (container && audioVisualItem.options) { 
            const event = new CustomEvent('dialogueAudioStarted', {
                detail: { 
                    dialogueItem: audioVisualItem.options,
                    duration: cueDuration 
                }
            });
            container.dispatchEvent(event);
        }

        // A. Media Action Wait (Optional)
        if (audioVisualItem.options && audioVisualItem.options.mediaAction && audioVisualItem.options.mediaAction.waitForCompletion) {
             console.log(`SceneManager: Waiting for media action completion for item ${audioVisualItem.options.id}`);
             waitPromises.push(new Promise(resolve => {
                 pendingMediaActionResolvers.set(audioVisualItem.options.id, resolve);
            }));
        }

        // 3. Wait for all conditions to be met
        await Promise.all(waitPromises);

        // Abort if a new animation has taken over
        if (myAnimationId !== currentAnimationId) return;

        // 4. Clean up & Next
        // We DON'T hide the item in Sequential mode to keep the comic page intact
        /*
        if (audioVisualItem.hide && !audioVisualItem.loop) {
            audioVisualItem.hide();
        }
        */

        if (container && audioVisualItem.options) {
            const event = new CustomEvent('cueEnded', {
                detail: { dialogueItem: audioVisualItem.options }
            });
            console.log(`SceneManager: Dispatching cueEnded for item ${audioVisualItem.options?.id}`);
            container.dispatchEvent(event);
        }

        // Global Cue Delay: Add breathing room between cues
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Abort if a new animation has taken over during the delay
        if (myAnimationId !== currentAnimationId) return;

        currentIndex++;
        animate();
    };

    const startAnimation = () => {
        currentAnimationId++; // Kill any existing animation loops
        
        if (currentAudioElement) {
            currentAudioElement.pause();
            currentAudioElement.currentTime = 0;
            currentAudioElement.removeEventListener('ended', itemEndedListener);
            currentAudioElement = null;
        }
        clearTimeout(timeoutId);
        currentIndex = 0;
        
        // Reset any pending resolvers
        pendingMediaActionResolvers.forEach(resolve => resolve());
        pendingMediaActionResolvers.clear();

        animate();
    };

    const cleanup = () => {
        currentAnimationId++; // Kill existing loops on cleanup
        
        if (currentAudioElement) {
            currentAudioElement.pause();
            currentAudioElement.currentTime = 0;
            currentAudioElement.removeEventListener('ended', itemEndedListener);
        }
        clearTimeout(timeoutId);
        
        // Resolve any pending media actions so they don't hang if re-initialized
        pendingMediaActionResolvers.forEach(resolve => resolve());
        pendingMediaActionResolvers.clear();

        audioVisualItemsToAnimate.forEach(item => {
            if (item.destroy) {
                item.destroy();
            } else {
                if (item.hide) item.hide();
                if (item.pause) item.pause();
                if (item.audioElement && window.audioStateManager) {
                    window.audioStateManager.unregisterAudio(item.audioElement);
                }
            }
        });
        audioVisualItemsToAnimate.length = 0;
    };

    const signalMediaActionCompletion = (id) => {
        if (pendingMediaActionResolvers.has(id)) {
            console.log(`SceneManager: Received completion signal for ${id}`);
            const resolve = pendingMediaActionResolvers.get(id);
            resolve();
            pendingMediaActionResolvers.delete(id);
        }
    };

    return { cleanup, restart: startAnimation, signalMediaActionCompletion };
}

export async function initScene(container, pageInfo, sceneData) {
    const { series, pageId, pageIndex, chapter, volume } = pageInfo;
    const page = container.querySelector('.section-container') || container;

    const audioVisualItemsToAnimate = [];
    for (const [index, item] of sceneData.entries()) {
        let audioVisualItem = null;

        // Central Audio Resolution
        let resolvedAudioSrc = item.audioSrc || null;
        if (resolvedAudioSrc && !resolvedAudioSrc.includes('/') && !resolvedAudioSrc.includes(':')) {
            resolvedAudioSrc = resolveMediaUrl(resolvedAudioSrc, 'audio', pageInfo, true);
        } else if (item.audioSrc === undefined && item.id) {
            resolvedAudioSrc = resolveMediaUrl(`${item.id}.mp3`, 'audio', pageInfo, true);
        }

        if (item.displayType.type === 'SpeechBubble') {
            const panelEl = container.querySelector(item.placement.panel);
            if (!panelEl) {
                console.error(`SpeechBubble on page ${pageId}, index ${index}: Panel '${item.placement.panel}' not found.`);
                continue;
            }
            const bubbleOptions = { ...item, series, volume, chapter, pageId, pageIndex, dialogueIndex: index, audioSrc: resolvedAudioSrc };
            if (item.attributes) bubbleOptions.attributes = item.attributes;
            if (item.style) bubbleOptions.style = item.style;
            if (item.placement?.tailSkew) bubbleOptions.tailSkew = item.placement.tailSkew;
            Object.assign(bubbleOptions, item.placement); 
            const bubble = new SpeechBubble(panelEl, bubbleOptions);
            await bubble.render();
            audioVisualItem = bubble;

        } else if (item.displayType.type === 'TextBlock') {
            const panelEl = (item.placement && item.placement.panel) ? container.querySelector(item.placement.panel) : page;
            if (!panelEl) {
                console.error(`TextBlock on page ${pageId}, index ${index}: Panel or page container not found.`);
                continue;
            }
            const textBlockOptions = { 
                ...item, 
                series, 
                volume, 
                chapter, 
                pageId, 
                textBlockType: item.displayType.style || 'Narrator', 
                pageIndex, 
                dialogueIndex: index, 
                audioSrc: resolvedAudioSrc 
            };
            if (item.attributes) textBlockOptions.attributes = item.attributes;
            if (item.style) textBlockOptions.style = item.style;
            Object.assign(textBlockOptions, item.placement); 
            const textBlock = new TextBlock(panelEl, textBlockOptions);
            await textBlock.render();
            audioVisualItem = textBlock;

        } else if (item.displayType.type === 'SoundEffect') {
            const panelEl = (item.placement && item.placement.panel) ? container.querySelector(item.placement.panel) : null;
            const soundEffect = new SoundEffect(panelEl, { ...item, series, volume, chapter, pageId, audioSrc: resolvedAudioSrc });
            await soundEffect.render();
            audioVisualItem = soundEffect;
        } else if (item.displayType.type === 'Pause') {
             audioVisualItem = {
                duration: item.duration || 1000,
                options: item
            };
        }

        if (audioVisualItem && (audioVisualItem.audioElement || audioVisualItem.duration || typeof audioVisualItem.play === 'function')) {
            audioVisualItemsToAnimate.push(audioVisualItem);
        }
    }

    if (audioVisualItemsToAnimate.length > 0) {
        audioVisualItemsToAnimate.sort((a, b) => {
            const orderA = (a.options && a.options.displayOrder !== undefined) ? a.options.displayOrder : Infinity;
            const orderB = (b.options && b.options.displayOrder !== undefined) ? b.options.displayOrder : Infinity;
            return orderA - orderB;
        });

        // Gemini Comic Mode: Immediate Render
        const urlParams = new URLSearchParams(window.location.search);
        const forceComicMode = urlParams.get('mode') === 'comic' || window.GEMINI_COMIC_MODE || true; // Default to true for Sequential Server

        if (forceComicMode) {
            console.log("Comic Mode Active: Showing all bubbles immediately.");
            audioVisualItemsToAnimate.forEach(item => {
                if (item.show) item.show();
                // Ensure text is visible immediately
                if (item.element) item.element.style.visibility = 'visible'; 
            });
            
            // Dispatch shown events for all items immediately so any linked media actions trigger
            audioVisualItemsToAnimate.forEach(item => {
                if (container && item.options) {
                    const event = new CustomEvent('dialogueAudioStarted', {
                        detail: { 
                            dialogueItem: item.options,
                            duration: 0 
                        }
                    });
                    container.dispatchEvent(event);
                }
            });

            return { 
                cleanup: () => {
                     audioVisualItemsToAnimate.forEach(item => {
                        if (item.destroy) item.destroy();
                    });
                }, 
                restart: () => {} 
            };
        }

        return manageSequentialAudioVisuals(audioVisualItemsToAnimate, container);
    }
    return { cleanup: () => {}, restart: () => {} };
}