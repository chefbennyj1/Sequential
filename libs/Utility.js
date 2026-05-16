/**
 * Applies a mask to the content inside a set of panels and returns a promise.
 */
export function imageMaskReveal(panels, gifUrl, duration = 5000, mediaData = null, pageInfo = null) {
    return new Promise(resolve => {
        if (!panels || panels.length === 0) {
            resolve();
            return;
        }

        const uniqueGifUrl = `${gifUrl}${gifUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;

        panels.forEach(panel => {
            const mediaElements = panel.querySelectorAll('img');
            mediaElements.forEach(el => {
                el.style.maskImage = `url(${uniqueGifUrl})`;
                el.style.maskSize = '100% 100%';
                el.style.maskRepeat = 'no-repeat';
                el.style.maskPosition = 'center';
                el.style.maskMode = 'alpha';
                el.style.webkitMaskImage = `url(${uniqueGifUrl})`;
                el.style.webkitMaskSize = '100% 100%';
                el.style.webkitMaskRepeat = 'no-repeat';
                el.style.webkitMaskPosition = 'center';
            });
        });

        setTimeout(() => {
            panels.forEach(panel => {
                const mediaElements = panel.querySelectorAll('img');
                mediaElements.forEach(el => {
                    el.style.maskImage = '';
                    el.style.webkitMaskImage = '';
                });
            });
            resolve();
        }, duration);
    });
}

// Helper to get secret from URL
function getExportSecret() {
    return new URLSearchParams(window.location.search).get('exportSecret');
}

function appendSecret(url) {
    const secret = getExportSecret();
    if (!secret) return url;
    if (!url.startsWith('/') && !url.includes(window.location.host)) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}exportSecret=${secret}`;
}

export async function fetchScene(volume, chapter, pageId, series) {
    if (!series) throw new Error("series is required for fetchScene");
    if (pageId === 'login') return [];
    try {
        const response = await fetch(appendSecret(`/api/scene/${series}/${volume}/${chapter}/${pageId}`));
        const data = await response.json();
        return data.ok ? data.scene : [];
    } catch (error) {
        console.error(error);
        return [];
    }
}

export async function fetchMedia(volume, chapter, pageId, series) {
    if (!series) throw new Error("series is required for fetchMedia");
    if (pageId === 'login') return { media: [], ambientAudio: null };
    try {
        const response = await fetch(appendSecret(`/api/media/${series}/${volume}/${chapter}/${pageId}`));
        const data = await response.json();
        const mediaContent = data.media || {};
        let mediaArray = Array.isArray(mediaContent) ? mediaContent : (mediaContent.media || []);
        return {
            media: mediaArray,
            ambientAudio: mediaContent.ambientAudio || null
        };
    } catch (error) {
        console.error(error);
        return { media: [], ambientAudio: null };
    }
}

export function setLastVisitedPage(chapterNumber, pageId) {
    try { localStorage.setItem(`lastVisitedPage_chapter_${chapterNumber}`, pageId); } catch (e) { }
}

export function getLastVisitedPage(chapterNumber) {
    try { return localStorage.getItem(`lastVisitedPage_chapter_${chapterNumber}`); } catch (e) { return null; }
}

export function wrapCharsInSpans(str) {
    return str.split('').map(char => `<span>${char}</span>`).join('');
}

export function preloadMediaAsset(url, type) {
    return new Promise((resolve, reject) => {
        if (type === 'image') {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed: ${url}`));
            img.src = appendSecret(url);
        } else {
            reject(new Error(`Unsupported: ${type}`));
        }
    });
}

export async function loadCSS(href, forceReload = false) {
    if (!forceReload && [...document.styleSheets].some(sheet => sheet.href && sheet.href.includes(href))) return;
    return new Promise((resolve, reject) => {
        const finalHref = appendSecret(forceReload ? `${href}${href.includes('?') ? '&' : '?'}t=${Date.now()}` : href);
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = finalHref;
        link.onload = resolve;
        link.onerror = () => reject(new Error(`Failed: ${href}`));
        document.head.appendChild(link);
    });
}

export function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = appendSecret(src);
        script.type = 'module';
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Failed: ${src}`));
        document.body.appendChild(script);
    });
}

export function resolveMediaUrl(fileName, type, pageInfo, cacheBust = false) {
    if (!fileName) return '';
    const series = pageInfo.series;
    if (!series) {
        console.error("No series provided in pageInfo for resolveMediaUrl", pageInfo);
        return fileName;
    }

    const config = window.APP_CONFIG || {};
    const useCloud = config.useCloudStorage;
    const gcsBase = `${config.gcsBaseUrl}/${config.gcsBucketName}`;

    let url = '';
    if (fileName.startsWith('series://')) {
        url = `/Library/${series}/assets/${type}/${fileName.replace('series://', '')}`;
    } else if (fileName.startsWith('global://')) {
        url = `/resources/audio/${fileName.replace('global://', '')}`;
    } else if (fileName.startsWith('/') || fileName.startsWith('http')) {
        url = fileName;
    } else if (fileName.startsWith('volume://')) {
        const name = fileName.replace('volume://', '');
        url = useCloud ? `${gcsBase}/Volumes/${pageInfo.volume}/assets/${type}/${name}` : `/Library/${series}/Volumes/${pageInfo.volume}/assets/${type}/${name}`;
    } else {
        const { volume, chapter, pageId } = pageInfo;
        const apiType = 'images'; 
        url = useCloud ? `${gcsBase}/Volumes/${volume}/${chapter}/${pageId}/assets/${fileName}` : `/api/${apiType}/${series}/${volume}/${chapter}/${pageId}/assets/${fileName}`;
    }

    if (cacheBust && url) {
        url += (url.includes('?') ? '&' : '?') + 't=' + Date.now();
    }

    return appendSecret(url);
}

/**
 * Extracts a 5-color palette from an image URL using canvas sampling.
 */
export async function extractPalette(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 100; // Small for performance
            canvas.height = 100;
            ctx.drawImage(img, 0, 0, 100, 100);

            const data = ctx.getImageData(0, 0, 100, 100).data;
            const counts = {};
            
            // Sample pixels every 16 steps for speed
            for (let i = 0; i < data.length; i += 16) {
                const r = data[i];
                const g = data[i+1];
                const b = data[i+2];
                // Quantize to group similar colors (step of 10)
                const qr = Math.round(r / 10) * 10;
                const qg = Math.round(g / 10) * 10;
                const qb = Math.round(b / 10) * 10;
                const hex = "#" + ((1 << 24) + (qr << 16) + (qg << 8) + qb).toString(16).slice(1);
                counts[hex] = (counts[hex] || 0) + 1;
            }

            // Sort and pick top 5
            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            const top5 = sorted.slice(0, 5).map(c => c[0]);
            resolve(top5);
        };
        img.onerror = (e) => reject(new Error("Failed to load image for palette extraction: " + url));
        img.src = url;
    });
}
