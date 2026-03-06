// services/public/MediaManager.js
import { resolveMediaUrl } from '/libs/Utility.js';

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

export function initMedia(container, pageInfo, mediaDataArray) {
    const { pageId } = pageInfo;

    console.log(`MediaManager - ${pageId} - Initializing ${mediaDataArray.length} media items.`)
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
                    panel.classList.add(`panel-effect-${media.panelEffect}`);
                    if (media.panelEffect === 'memory') panel.classList.add('active-memory');
                }
            }
        }
    }
}

export async function startMediaPlayback(videos, pageInfo, sequentialVideoPlayback = false) { 
    // No-op for images-only engine
}

export function playManuallyTriggeredVideo(video) {
    // No-op for images-only engine
}

export function stopMediaPlayback(videos, playlistManagers = []) {
    // No-op for images-only engine
}

export function restartMediaPlayback(videos, playlistManagers, pageInfo, sequentialVideoPlayback) {
    // No-op for images-only engine
}

export async function preloadAllMedia(videos, pageId) {
    // No-op for images-only engine
}
