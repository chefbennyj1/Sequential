// services/public/MediaManager.js
import { lazyLoadVideo, resolveMediaUrl } from '/libs/Utility.js';
import PlaylistManager from '/services/public/PlaylistManager.js';

export function fadeElement(element, direction, duration = 500) {
    return new Promise(resolve => {
        const startOpacity = direction === 'out' ? 1 : 0;
        const endOpacity = direction === 'out' ? 0 : 1;
        console.log(`Fade Element: ${element.classList} - ${direction} - ${duration}`)
        //element.style.opacity = startOpacity;

        element.style.transition = `opacity ${duration}ms ease`;


        // // Now, trigger the transition
        setTimeout(() => {
            element.style.opacity = endOpacity;
        }, 20); // A small delay to let the browser catch up

        setTimeout(resolve, duration);
    });
}


function setupManualLoop(video) {
    video.onended = async () => {
        if (video.dataset.shouldLoop === 'true') {
            await fadeElement(video, 'out');
            video.currentTime = 0;
            await video.play();
            await fadeElement(video, 'in');
        }
    };
}




export function initMedia(container, pageInfo, mediaDataArray) {
    const { volume, chapter, pageId } = pageInfo;
    const videoElements = [];
    const playlistManagers = [];

    console.log(`MediaManager - ${pageId} - Media items has ${mediaDataArray.length} items.`)
    for (const media of mediaDataArray) {
        const panel = container.querySelector(media.panel);
        if (panel) {
            if (media.type === 'image') {
                const img = document.createElement('img');
                img.src = resolveMediaUrl(media.fileName, 'image', pageInfo);
                if (media.attributes) {
                    for (const attr in media.attributes) {
                        img.setAttribute(attr, media.attributes[attr]);
                    }
                }
                if (media.style) {
                    for (const prop in media.style) {
                        img.style[prop] = media.style[prop];
                    }
                }
                img.style.objectFit = 'cover';
                panel.appendChild(img);

                // Apply Panel Effect if specified in media.json
                if (media.panelEffect) {
                    // We need a way to call applyPanelEffect from here, 
                    // or just apply the class directly since we are in public services.
                    panel.classList.add(`panel-effect-${media.panelEffect}`);
                    if (media.panelEffect === 'memory') panel.classList.add('active-memory');
                }
            } else if (media.type === 'video') {
                const video = document.createElement('video');
                video.muted = media.audioEnabled !== true; // Default to muted unless explicitly enabled
                video.dataset.audioEnabled = media.audioEnabled === true;
                // Set volume if audio is enabled and volume is specified
                if (media.audioEnabled === true && media.volume !== undefined) {
                    video.volume = media.volume;
                } else if (media.audioEnabled === true) {
                    // Default volume if audioEnabled but no specific volume is set
                    video.volume = 1.0;
                }
                video.playsInline = true;
                video.preload = 'none';
                video.disablePictureInPicture = true;

                // Assign a unique ID to the video element for easy retrieval
                const videoId = `video-${pageId}-${media.panel.replace('.', '')}-${media.fileName.replace(/\./g, '-')}`;
                video.id = videoId;

                video.style.objectFit = 'cover';

                let videoSrc = resolveMediaUrl(media.fileName, 'video', pageInfo); 

                video.dataset.src = videoSrc;
                video.dataset.shouldLoop = media.loop !== undefined ? media.loop.toString() : "true";
                // Fix: If syncToDialogue is true, DO NOT autoplay on load.
                video.dataset.autoplay = (media.syncToDialogue === true || media.autoplay === false) ? 'false' : 'true'; 
                
                // Logic: 
                // Default (Crossfade=False) -> Manual Loop (Fade Out -> Black -> Fade In)
                // Crossfade=True -> Native Seamless Loop (No dip to black)
                if (media.crossfade === true) {
                    video.loop = video.dataset.shouldLoop === 'true';
                } else {
                    video.loop = false; 
                    setupManualLoop(video);
                }

                if (media.posterName) {
                    video.poster = resolveMediaUrl(media.posterName, 'image', pageInfo);
                }

                if (media.attributes) {
                    for (const attr in media.attributes) {
                        if (attr === "playbackRate") {
                            video.onloadedmetadata = () => { video.playbackRate = media.attributes[attr]; };
                        }
                        else { video.setAttribute(attr, media.attributes[attr]); }
                    }
                }
                video.style.objectFit = 'cover';
                panel.appendChild(video);
                videoElements.push(video);

                // Apply Panel Effect if specified
                if (media.panelEffect) {
                    panel.classList.add(`panel-effect-${media.panelEffect}`);
                    if (media.panelEffect === 'memory') panel.classList.add('active-memory');
                }
            } else if (media.type === 'Playlist') {
                // Instantiate PlaylistManager directly for background playlists
                const pm = new PlaylistManager(panel, media, pageInfo);
                playlistManagers.push(pm);
                // Start playing immediately (or we could defer to startMediaPlayback)
                pm.play(); 
            }
        }
    }
    return { videoElements, playlistManagers };
}

export async function startMediaPlayback(videos, pageInfo, sequentialVideoPlayback = false) { 
    // Ensure videos are loaded first
    await Promise.all(videos.map(video => lazyLoadVideo(video, pageInfo.pageId)));

    if (sequentialVideoPlayback) {
        let videoIndex = 0;
        const playNextVideo = () => {
            if (videoIndex < videos.length) {
                const video = videos[videoIndex];
                
                if (video.dataset.autoplay === 'true') {
                    video.play().catch(e => console.error("Sequential video play error", e));
                }
                video.onended = () => {
                    videoIndex++;
                    playNextVideo();
                };

            }
        };
        playNextVideo();
    } else {
        // Play all videos concurrently (staggered slightly)
        const staggerDelay = 500; 
        videos.forEach((video, index) => {
            
            setTimeout(() => {
                video.style.visibility = 'visible';
                video.style.position = 'relative';
                if (video.dataset.autoplay === 'true') {
                    video.play().catch(e => console.error("Staggered concurrent video play error", e));
                }
            }, index * staggerDelay);
        });
    }
}

export function playManuallyTriggeredVideo(video) {
    if (!video) return;
    video.style.visibility = 'visible';
    video.style.position = 'relative';
    video.play().catch(e => console.error("Manual video play error", e));
}

export function stopMediaPlayback(videos, playlistManagers = []) {
    videos.forEach(video => {
        video.pause();
        video.currentTime = 0;
        video.removeAttribute('src');
        video.onended = null;
    });

    playlistManagers.forEach(pm => {
        if (pm.destroy) pm.destroy();
    });
}

export function restartMediaPlayback(videos, playlistManagers, pageInfo, sequentialVideoPlayback) {
    console.log(`MediaManager - ${pageInfo.pageId} - Restarting all media...`);
    stopMediaPlayback(videos, playlistManagers);
    startMediaPlayback(videos, pageInfo, sequentialVideoPlayback);
    playlistManagers.forEach(pm => pm.play());
}

export async function preloadAllMedia(videos, pageId) {
    console.log(`MediaManager - ${pageId} - Preloading all videos for the page...`);
    const preloadPromises = videos.map(video => {
        return new Promise(async (resolve, reject) => {
            await lazyLoadVideo(video, pageId);

            if (video.readyState >= 4) { 
                return resolve();
            }

            const canPlayThroughHandler = () => {
                video.removeEventListener('canplaythrough', canPlayThroughHandler);
                video.removeEventListener('error', errorHandler);
                resolve();
            };

            const errorHandler = (e) => {
                video.removeEventListener('canplaythrough', canPlayThroughHandler);
                video.removeEventListener('error', errorHandler);
                console.error("MediaManager - ${pageId} - Error preloading video:", video.src, e);
                reject(new Error(`Failed to load video: ${video.src}`));
            };

            video.addEventListener('canplaythrough', canPlayThroughHandler);
            video.addEventListener('error', errorHandler);
        });
    });

    try {
        await Promise.all(preloadPromises); 
        console.log(`MediaManager - ${pageId} - All videos for the page have been preloaded and are ready to play.`);
    } catch (error) {
        console.error(`MediaManager - ${pageId} - One or more videos failed to preload:`, error);
    }
}
