import { init } from '/libs/pageInitializer.js';
import { loadCSS, loadScript } from '/libs/Utility.js';

class PageManager {
    static getPageInfo(url) {
        const normalized = url.replace(/\\/g, '/');
        const parts = normalized.split('/').filter(p => p.length > 0);
        
        // Find anchors in path
        const libIdx = parts.findIndex(p => p.toLowerCase() === 'library');
        const seriesIdx = parts.findIndex(p => p.toLowerCase() === 'comic series' || p.toLowerCase() === 'comic%20series');
        
        let series = "unknown";
        let volume = "unknown";
        let chapter = "unknown";
        let pageId = "unknown";

        const startIdx = libIdx !== -1 ? libIdx : seriesIdx;
        
        if (startIdx !== -1) {
            // Path structure: .../Library/{Series}/Volumes/{Volume}/{Chapter}/{Page}/...
            // or .../Comic Series/{Series}/Volumes/{Volume}/{Chapter}/{Page}/...
            series = parts[startIdx + 1] || series;
            const volAnchorIdx = parts.indexOf('Volumes', startIdx);
            if (volAnchorIdx !== -1) {
                volume = parts[volAnchorIdx + 1] || volume;
                chapter = parts[volAnchorIdx + 2] || chapter;
                pageId = parts[volAnchorIdx + 3] || pageId;
            }
        }

        const pageMatch = pageId.match(/page(\d+)/i);
        const pageIndex = pageMatch ? parseInt(pageMatch[1], 10) : 0;
        
        return { series, pageId, pageIndex, chapter, volume };
    }

    constructor(pages) {
        this.pages = pages;
        this.currentPageContainer = null;
        this.currentPageIndex = -1;
        this.activeAbortControllers = new Map();
        
        // Initialize transition sound
        this.transitionSound = new Audio('/resources/audio/transition_audio.mp3');
        this.transitionSound.volume = 0.4; // Subtle volume
    }

    async goToPage(index) {
        if (index < 0 || index >= this.pages.length) return;

        console.log(`PageManager: Transitioning to page ${index}`);

        // Play transition sound if enabled
        const soundEnabled = localStorage.getItem('viewerSoundEffects') !== 'false';
        if (soundEnabled && this.currentPageIndex !== -1 && this.currentPageIndex !== index) {
            this.transitionSound.currentTime = 0;
            this.transitionSound.play().catch(e => console.warn("Transition sound blocked by browser policy. User must interact first.", e));
        }

        // Handle horizontal scroll if Lenis is active
        if (window.lenis) {
            const target = document.getElementById(this.pages[index].containerId);
            if (target) {
                window.lenis.scrollTo(target, {
                    duration: 1.2,
                    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // Expo out
                });
            }
        }

        // 1. Sliding Window: [Previous, Current, Next]
        const windowIndices = new Set([index - 1, index, index + 1]);
        
        // 2. Handle page transition animations (Legacy support)
        if (!window.lenis && this.currentPageIndex !== -1 && this.currentPageIndex !== index) {
            const oldPage = this.pages[this.currentPageIndex];
            const oldContainer = document.getElementById(oldPage.containerId);
            if (oldContainer) {
                oldContainer.classList.remove('active');
                oldContainer.classList.add('leaving');

                setTimeout(() => {
                    oldContainer.classList.remove('leaving');
                }, 800);
            }
        }

        this.currentPageIndex = index;

        // 3. Load/Warm up window
        const loadPromises = [];

        // Current (Show)
        loadPromises.push(this.loadPage(index, true));

        // Adjacent (Preload Hidden)
        if (index + 1 < this.pages.length) loadPromises.push(this.loadPage(index + 1, false));
        if (index - 1 >= 0) loadPromises.push(this.loadPage(index - 1, false));

        await Promise.all(loadPromises);

        // 4. Purge anything outside the window
        for (let i = 0; i < this.pages.length; i++) {
            if (!windowIndices.has(i)) {
                this.unloadPage(i);
            }
        }
    }

    async loadPage(index, shouldShow = false) {
        const pageGroup = this.pages[index];
        if (!pageGroup) return;

        const pageContainer = document.getElementById(pageGroup.containerId);
        if (!pageContainer) return;

        // Already Loaded?
        if (pageContainer.dataset.loaded === 'true') {
            if (shouldShow) {
                this.showPage(index);
            } else {
                pageContainer.classList.remove('active');
            }
            return;
        }

        console.log(`PageManager: Preloading page ${index}...`);

        if (this.activeAbortControllers.has(pageGroup.containerId)) {
            this.activeAbortControllers.get(pageGroup.containerId).abort();
        }
        
        const controller = new AbortController();
        this.activeAbortControllers.set(pageGroup.containerId, controller);

        if (pageGroup.isSpread) {
            // Load all pages in the spread concurrently
            await Promise.all(pageGroup.pages.map(p => 
                loadSection(p.containerId, p.html, true, p, controller.signal)
            ));
        } else {
            // Standard single page
            await loadSection(pageContainer.id, pageGroup.html, true, pageGroup, controller.signal);
        }
        
        pageContainer.dataset.loaded = 'true';

        if (shouldShow) {
            this.showPage(index);
        } else {
            pageContainer.classList.remove('active');
        }
    }

    unloadPage(index) {
        const pageGroup = this.pages[index];
        if (!pageGroup || index === this.currentPageIndex) return;

        const pageContainer = document.getElementById(pageGroup.containerId);
        if (!pageContainer || pageContainer.dataset.loaded !== 'true') return;

        // If the page is currently animating out, defer the purge
        if (pageContainer.classList.contains('leaving')) {
            console.log(`PageManager: Deferring purge of page ${index} until animation ends.`);
            setTimeout(() => this.unloadPage(index), 900); // 800ms animation + 100ms buffer
            return;
        }

        console.log(`PageManager: Purging page ${index} from DOM.`);

        if (this.activeAbortControllers.has(pageContainer.id)) {
            this.activeAbortControllers.get(pageContainer.id).abort();
            this.activeAbortControllers.delete(pageContainer.id);
        }

        const event = new CustomEvent('view_hidden', {
            bubbles: true,
            detail: { index: index, section: pageContainer }
        });
        pageContainer.dispatchEvent(event);

        // Clean up CSS for all pages in the group
        if (pageGroup.isSpread) {
            pageGroup.pages.forEach(p => {
                const { pageId } = PageManager.getPageInfo(p.html);
                const pageCss = document.getElementById(`css-${pageId}`);
                if (pageCss) pageCss.remove();
                
                // Clear the inner content but keep the container
                const inner = document.getElementById(p.containerId);
                if (inner) inner.innerHTML = '';
            });
        } else {
            const { pageId } = PageManager.getPageInfo(pageGroup.html);
            const pageCss = document.getElementById(`css-${pageId}`);
            if (pageCss) pageCss.remove();
            
            // For single pages, we can just clear the container
            pageContainer.innerHTML = '';
        }

        pageContainer.classList.remove('active', 'leaving');
        pageContainer.removeAttribute('data-loaded');
    }

    showPage(index) {
        const page = this.pages[index];
        if (!page) return;

        const pageContainer = document.getElementById(page.containerId);
        if (pageContainer) {
            const wasActive = pageContainer.classList.contains('active');
            pageContainer.classList.add('active');
            this.currentPageContainer = pageContainer;

            if (!wasActive) {
                const event = new CustomEvent('view_visible', {
                    bubbles: true,
                    detail: { index: index, section: pageContainer }
                });
                pageContainer.dispatchEvent(event);
            }
        }
    }
}

export async function loadSection(containerId, htmlPath, isComicPage = true, pageData = null, abortSignal = null) {
    try {
        await loadCSS('/views/public/styles/engine.css');

        let layoutUrl = htmlPath;
        if (pageData) {
            const lid = pageData.layout?.id || 
                      pageData.header?.layout?.id || 
                      pageData.portraitLayoutId || 
                      pageData.layoutId || 
                      pageData.header?.portraitLayout?.id ||
                      pageData.header?.layouts?.portrait?.id || 
                      pageData.layouts?.portrait?.id || 
                      "Standard_Page";

            layoutUrl = `/layouts/portrait/${lid}.html?t=${Date.now()}`;
        }
        let response = await fetch(layoutUrl);

        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }

        const html = await response.text();
        const container = document.getElementById(containerId);

        const pageInfo = PageManager.getPageInfo(htmlPath);
        const { pageId } = pageInfo;

        if (container) {
            container.innerHTML = html;

            if (isComicPage) {
                const folderPath = htmlPath.substring(0, htmlPath.lastIndexOf('/'));
                const jsPath = `${folderPath}/page.js`.replace(/\\/g, '/');
                const cssPath = `${folderPath}/page.css`.replace(/\\/g, '/');

                // Add exportSecret to dynamic import if present in URL
                const exportSecret = new URLSearchParams(window.location.search).get('exportSecret');
                const finalJsPath = exportSecret ? `${jsPath}${jsPath.includes('?') ? '&' : '?'}exportSecret=${exportSecret}` : jsPath;

                const oldPageCss = document.getElementById(`css-${pageId}`);
                if (oldPageCss) oldPageCss.remove();

                await loadCSS(cssPath, true);
                const newLink = document.querySelector(`link[href*="${cssPath}"]`);
                if (newLink) newLink.id = `css-${pageId}`;

                try {
                    await document.fonts.load('1em "Comic Book"');
                    await document.fonts.load('1em "Comic Book Bold"');
                } catch (e) { }

                let pageSpecificInit = null;
                try {
                    const pageSpecificModule = await import(finalJsPath);
                    if (pageSpecificModule.onPageLoad) {
                        pageSpecificInit = pageSpecificModule.onPageLoad;
                    }
                } catch (err) { }

                // Bypass database cache to ensure we always get the latest data from disk
                const cachedScene = null;
                const cachedMedia = null;

                await init(container, pageInfo, cachedScene, cachedMedia, abortSignal);

                if (pageSpecificInit && !abortSignal?.aborted) {
                    await pageSpecificInit(container, pageInfo);
                }
            }

            document.dispatchEvent(new CustomEvent('sectionLoaded', { detail: { id: containerId } }));
        }
    } catch (err) {
        console.error(`Error loading section ${containerId}:`, err);
    }
}

export function initPageManager(pages) {
    const pageManager = new PageManager(pages);
    return pageManager;
}