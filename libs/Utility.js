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
 * Extracts a palette of interesting colors from an image URL using canvas sampling.
 * Prioritizes "vibrant" or "accent" colors over purely frequent ones (like backgrounds).
 */
export async function extractPalette(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 100;
            canvas.height = 100;
            ctx.drawImage(img, 0, 0, 100, 100);

            const data = ctx.getImageData(0, 0, 100, 100).data;
            const buckets = {};
            
            for (let i = 0; i < data.length; i += 16) {
                const r = data[i];
                const g = data[i+1];
                const b = data[i+2];

                // Convert to HSL to check "interestingness"
                const [h, s, l] = rgbToHsl(r, g, b);

                // Skip extremely dark, extremely light, or extremely dull (grays)
                if (l < 0.1 || l > 0.9) continue; 
                if (s < 0.15) continue;

                // Group by hue (36 buckets) and moderate saturation/lightness
                const hueBucket = Math.round(h / 10) * 10;
                const satBucket = Math.round(s * 5) / 5;
                const lightBucket = Math.round(l * 5) / 5;
                const key = `${hueBucket}-${satBucket}-${lightBucket}`;

                if (!buckets[key]) {
                    buckets[key] = { r, g, b, count: 0, s };
                }
                buckets[key].count++;
            }

            // Sort by count but give a bonus to more saturated colors (accents)
            const sorted = Object.values(buckets).sort((a, b) => {
                const scoreA = a.count * (1 + a.s);
                const scoreB = b.count * (1 + b.s);
                return scoreB - scoreA;
            });

            // Convert back to hex and return top 8 unique-ish colors
            const result = [];
            for (const b of sorted) {
                const hex = "#" + ((1 << 24) + (b.r << 16) + (b.g << 8) + b.b).toString(16).slice(1);
                if (!result.includes(hex)) result.push(hex);
                if (result.length >= 8) break;
            }

            // If we found nothing (e.g. image was all gray), just return default gray/black/white
            if (result.length === 0) resolve(['#ffffff', '#888888', '#000000', '#ff0000', '#00ff00', '#0000ff']);
            else resolve(result);
        };
        img.onerror = (e) => reject(new Error("Failed to load image for palette extraction"));
        img.src = url;
    });
}

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; // achromatic
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h * 360, s, l];
}
