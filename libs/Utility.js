/**
 * Applies a mask to a set of panels and returns a promise that resolves after a given duration.
 * @param {HTMLElement[]} panels - An array of panel elements to apply the mask to.
 * @param {string} gifUrl - The URL of the GIF to use as the mask.
 * @param {number} duration - The duration in milliseconds to wait for the animation to complete.
 * @returns {Promise<void>} A promise that resolves after the specified duration.
 */
export function imageMaskReveal(panels, gifUrl, duration = 5000) {
    return new Promise(resolve => {
        if (!panels || panels.length === 0) {
            resolve();
            return;
        }
        panels.forEach(panel => {
            // Append a timestamp to the GIF URL to force it to replay
            const uniqueGifUrl = `${gifUrl}?t=${Date.now()}`;
            
            // Standard Syntax
            panel.style.maskImage = `url(${uniqueGifUrl})`;
            panel.style.maskSize = '100% 100%';
            panel.style.maskRepeat = 'no-repeat';
            panel.style.maskPosition = 'center';
            panel.style.maskMode = 'alpha'; // Ensure alpha masking

            // Webkit Syntax (Required for Chrome/Safari)
            panel.style.webkitMaskImage = `url(${uniqueGifUrl})`;
            panel.style.webkitMaskSize = '100% 100%';
            panel.style.webkitMaskRepeat = 'no-repeat';
            panel.style.webkitMaskPosition = 'center';
        });

        // Resolve the promise after the specified duration
        setTimeout(resolve, duration);
    });
}

/**
 * Ensures videos are set to preload="none" and poster is applied initially.
 * @param {HTMLVideoElement[]} videos - An array of video elements.
 */
export function preloadMediaAssets(videos) {
    videos.forEach(video => {
        // Ensure preload is set to none to prevent automatic loading
        video.setAttribute('preload', 'none');
        // If a poster is defined as a data attribute, use it
        if (video.dataset.poster && !video.poster) {
            video.poster = video.dataset.poster;
        }
        const fadeDuration = 0.5; // The duration of the fade in seconds
        video.addEventListener('timeupdate', () => {
            if (video.duration - video.currentTime <= fadeDuration) {
                video.classList.add('fade-out');
                video.classList.remove('fade-in');
            }
        });

        video.addEventListener('seeked', () => {
            if (video.currentTime < fadeDuration) {
                video.classList.remove('fade-out');
                video.classList.add('fade-in');
            }
        });
    });
}

/**
 * Lazy loads a single video by setting its src and loading it.
 * Returns a promise that resolves when the video can play through.
 * @param {HTMLVideoElement} video - The video element to lazy load.
 * @returns {Promise<void>} A promise that resolves when the video is ready to play.
 */
export function lazyLoadVideo(video, pageId) {
    return new Promise(resolve => {
        if (video.dataset.src) {
            const resolvedDatasetSrc = new URL(video.dataset.src, window.location.origin).href;
            // Only reload if the target source is different from the current source
            if (video.src !== resolvedDatasetSrc) {
                video.src = resolvedDatasetSrc; // Set src to the resolved absolute URL
                video.load();
                console.log(`Utility - ${pageId} - Lazy loading video: ${resolvedDatasetSrc}`);

                const onCanPlayThrough = () => {
                    video.removeEventListener('canplaythrough', onCanPlayThrough);
                    resolve();
                };
                video.addEventListener('canplaythrough', onCanPlayThrough);
                
                video.addEventListener('loadeddata', () => {
                    if (video.readyState >= 3) {
                        resolve();
                    }
                }, { once: true });

                video.addEventListener('error', (e) => {
                    console.error(`Utility - ${pageId} - Error lazy loading video:`, video.dataset.src, e);
                    resolve(); // Resolve anyway to not block the page
                }, { once: true });

            } else {
                resolve(); // Already correct source, no need to load
            }
        } else {
            resolve(); // No data-src
        }
    });
}

/**
 * Fetches scene data for a given page from the API.
 * @param {string} volume - The ID of the volume.
 * @param {string} chapter - The ID of the chapter.
 * @param {string} pageId - The ID of the page.
 * @param {string} series - The folder name of the series.
 * @returns {Promise<Array>} A promise that resolves with an array of dialogue objects.
 */
export async function fetchScene(volume, chapter, pageId, series = "No_Overflow") {
    if (pageId === 'login') {
        return []; // Do not fetch dialogue for the login page
    }
    console.log(`Utiltiy - ${pageId} - Requesting scene data for series: ${series}`);
    try {
        const response = await fetch(`/api/scene/${series}/${volume}/${chapter}/${pageId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log(`Utiltiy - ${pageId} - Received scene data:`, data);
        if (!data.ok) {
            throw new Error(`API error: ${data.message}`);
        }
        return data.scene;
    } catch (error) {
        console.error(`Utiltiy - ${pageId} - Error fetching scene for ${pageId}:`, error);
        return []; // Return an empty array on error
    }
}

/**
 * Fetches media data for a given page from the API.
 * @param {string} volume - The ID of the volume (e.g., 'volume-1').
 * @param {string} chapter - The ID of the chapter (e.g., 'chapter-1').
 * @param {string} pageId - The ID of the page (e.g., 'page1').
 * @param {string} series - The folder name of the series.
 * @returns {Promise<{media: Array, sequentialVideoPlayback: boolean}>} A promise that resolves with an object containing media array and sequentialVideoPlayback flag.
 */
export async function fetchMedia(volume, chapter, pageId, series = "No_Overflow") {
    if (pageId === 'login') {
        return { media: [], sequentialVideoPlayback: false, ambientAudio: null };
    }
    console.log(`Utiltiy - ${pageId} - Requesting media for series: ${series}`);
    try {
        const response = await fetch(`/api/media/${series}/${volume}/${chapter}/${pageId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json(); 
        console.log(`Utiltiy - ${pageId} - Received media data:`, data);
        if (!data.ok) {
            throw new Error(`API error: ${data.message}`);
        }

        const mediaContent = data.media || {}; 

        let mediaArray = [];
        let seqPlay = false;
        let ambientAudio = null;

        if (Array.isArray(mediaContent)) {
            mediaArray = mediaContent;
        } else if (mediaContent && typeof mediaContent === 'object') {
            mediaArray = Array.isArray(mediaContent.media) ? mediaContent.media : [];
            seqPlay = typeof mediaContent.sequentialVideoPlayback === 'boolean' ? mediaContent.sequentialVideoPlayback : false;
            ambientAudio = mediaContent.ambientAudio || null; 
        }

        return {
            media: mediaArray,
            sequentialVideoPlayback: seqPlay,
            ambientAudio: ambientAudio 
        };
    } catch (error) {
        console.error(`Utiltiy - ${pageId} - Error fetching media for ${pageId}:`, error);
        return { media: [], sequentialVideoPlayback: false, ambientAudio: null }; 
    }
}

/**
 * Stores the last visited page ID for a specific chapter in localStorage.
 * @param {string} chapterNumber - The number of the chapter.
 * @param {string} pageId - The ID of the page to store.
 */
export function setLastVisitedPage(chapterNumber, pageId) {
    try {
        localStorage.setItem(`lastVisitedPage_chapter_${chapterNumber}`, pageId);
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
}

/**
 * Retrieves the last visited page ID for a specific chapter from localStorage.
 * @param {string} chapterNumber - The number of the chapter.
 * @returns {string|null} The last visited page ID, or null if not found.
 */
export function getLastVisitedPage(chapterNumber) {
    try {
        return localStorage.getItem(`lastVisitedPage_chapter_${chapterNumber}`);
    } catch (error) {
        console.error('Error reading from localStorage:', error);
        return null;
    }
}

/**
 * Wraps every character in a string within <span> tags.
 *
 * @param {string} str The input string.
 * @returns {string} The new string with characters wrapped in spans.
 */
export function wrapCharsInSpans(str) {
  // 1. Split the string into an array of individual characters.
  const chars = str.split(''); //

  // 2. Map each character to a new string that includes the <span> tags.
  const wrappedChars = chars.map(char => `<span>${char}</span>`);

  // 3. Join the array of wrapped characters back into a single string.
  return wrappedChars.join('');
}

// Example Usage:
// const originalString = "Hello, world!";
// const wrappedString = wrapCharsInSpans(originalString);
//console.log(wrappedString);
// Output: <span>H</span><span>e</span><span>l</span><span>l</span><span>o</span><span>,</span><span> </span><span>w</span><span>o</span><span>r</span><span>l</span><span>d</span><span>!</span>

export function preloadMediaAsset(url, type) {
    return new Promise((resolve, reject) => {
        if (type === 'image') {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
            img.src = url;
        } else if (type === 'video') {
            const video = document.createElement('video');
            video.oncanplaythrough = () => resolve(video);
            video.onerror = () => reject(new Error(`Failed to load video: ${url}`));
            video.src = url;
        } else {
            reject(new Error(`Unknown asset type: ${type}`));
        }
    });
}

export async function loadCSS(href, forceReload = false) {
    if (!forceReload && [...document.styleSheets].some(sheet => sheet.href && sheet.href.includes(href))) return;
    
    return new Promise((resolve, reject) => {
        const finalHref = forceReload ? `${href}?t=${Date.now()}` : href;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = finalHref;
        link.onload = resolve;
        link.onerror = () => reject(new Error(`Failed to load CSS: ${href}`));
        document.head.appendChild(link);
    });
}

export function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.type = 'module';
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.body.appendChild(script);
    });
}

/**
 * Resolves a media filename to a full URL, handling prefixes for series and global assets.
 * @param {string} fileName - The filename, possibly with a prefix like 'series://' or 'global://'.
 * @param {string} type - The asset type: 'image', 'video', or 'audio'.
 * @param {object} pageInfo - Object containing series, volume, chapter, and pageId.
 * @param {boolean} cacheBust - Whether to append a timestamp to invalidate cache.
 * @returns {string} The resolved URL.
 */
export function resolveMediaUrl(fileName, type, pageInfo, cacheBust = false) {
    if (!fileName) return '';
    const series = pageInfo.series || "No_Overflow";
    
    // Check for Cloud Storage configuration
    const config = window.APP_CONFIG || {};
    const useCloud = config.useCloudStorage;
    const gcsBase = `${config.gcsBaseUrl}/${config.gcsBucketName}`;

    let url = '';

    // 1. Series Assets
    if (fileName.startsWith('series://')) {
        const name = fileName.replace('series://', '');
        url = `/Library/${series}/assets/${type}/${name}`;
    }
    
    // 2. Global Resources (Currently audio only in most cases)
    else if (fileName.startsWith('global://')) {
        const name = fileName.replace('global://', '');
        url = `/resources/audio/${name}`;
    }
    
    // 3. Absolute URLs or API paths already resolved
    else if (fileName.startsWith('/') || fileName.startsWith('http')) {
        url = fileName;
    }

    // 4. Volume Assets
    else if (fileName.startsWith('volume://')) {
        const name = fileName.replace('volume://', '');
        if (useCloud) {
            url = `${gcsBase}/Volumes/${pageInfo.volume}/assets/${type}/${name}`;
        } else {
            url = `/Library/${series}/Volumes/${pageInfo.volume}/assets/${type}/${name}`;
        }
    }

    // 5. Default: Page-specific Assets
    else {
        const { volume, chapter, pageId } = pageInfo;
        const apiType = type === 'image' ? 'images' : (type === 'video' ? 'videos' : 'audio');
        
        if (useCloud) {
            // Cloud structure matches local structure: Volumes/volume-i/chapter-j/page-k/assets/type/fileName
            url = `${gcsBase}/Volumes/${volume}/${chapter}/${pageId}/assets/${type}/${fileName}`;
        } else {
            // Use the local /api/:type/:series/:volume/... format
            url = `/api/${apiType}/${series}/${volume}/${chapter}/${pageId}/assets/${fileName}`;
        }
    }

    if (cacheBust && url) {
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}t=${Date.now()}`;
    }

    return url;
}

export async function fetchVolumeAudioMap(volumeId) {
    try {
        const response = await fetch(`/api/volumes/${volumeId}/audio-map`);
        if (!response.ok) return [];
        const data = await response.json();
        return data.map || [];
    } catch (error) {
        console.error("Error fetching audio map:", error);
        return [];
    }
}
