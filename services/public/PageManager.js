import { init } from '/libs/pageInitializer.js';
import { loadCSS, loadScript } from '/libs/Utility.js';
import AudioStateManager from '/services/public/AudioStateManager.js';

class PageManager {
    static getPageInfo(url) {
        const urlParts = url.split('/').filter(p => p.length > 0);
        const libraryIndex = urlParts.indexOf('Library');
        let series = "No_Overflow"; 
        let volume = "volume-1";
        let chapter = "chapter-1";
        let pageId = "page1";

        if (libraryIndex !== -1 && urlParts.length > libraryIndex + 1) {
            series = urlParts[libraryIndex + 1];
            const volumesIndex = urlParts.indexOf('Volumes', libraryIndex);
            if (volumesIndex !== -1 && urlParts.length > volumesIndex + 1) {
                volume = urlParts[volumesIndex + 1];
                if (urlParts.length > volumesIndex + 2) {
                    chapter = urlParts[volumesIndex + 2];
                }
                if (urlParts.length > volumesIndex + 3) {
                    pageId = urlParts[volumesIndex + 3];
                }
            }
        }

        const pageIndex = parseInt(pageId.replace('page', ''), 10);
        return { series, pageId, pageIndex, chapter, volume };
    }

    constructor(pages) {
        this.pages = pages;
        this.pageTransitionAudio = null;

        if (window.globalPageTransitionAudio) {
            this.pageTransitionAudio = new Audio(`/resources/audio/${window.globalPageTransitionAudio}`);
        }
       
        this.currentPageContainer = null;
        this.currentPageIndex = -1;
        this.activeAbortControllers = new Map(); 
    }

    async goToPage(index) {
        if (index < 0 || index >= this.pages.length) return;

        console.log(`PageManager: Transitioning to page ${index}`);
        
        // 1. Sliding Window: [Previous, Current, Next]
        const windowIndices = new Set([index - 1, index, index + 1]);
        
        // 2. Handle page transition animations
        if (this.currentPageIndex !== -1 && this.currentPageIndex !== index) {
            const oldPage = this.pages[this.currentPageIndex];
            const oldContainer = document.getElementById(oldPage.containerId);
            if (oldContainer) {
                oldContainer.classList.remove('active');
                oldContainer.classList.add('leaving');
                
                // Remove 'leaving' after animation finishes (0.8s per CSS)
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
        const page = this.pages[index];
        if (!page) return;

        const pageContainer = document.getElementById(page.containerId);
        if (!pageContainer) return;

        // Already Loaded?
        if (pageContainer.dataset.loaded === 'true') {
            if (shouldShow) this.showPage(index);
            else pageContainer.classList.remove('active');
            return;
        }

        console.log(`PageManager: Preloading page ${index}...`);

        if (this.activeAbortControllers.has(page.containerId)) {
            this.activeAbortControllers.get(page.containerId).abort();
        }
        const controller = new AbortController();
        this.activeAbortControllers.set(page.containerId, controller);

        // Load the HTML content
        await loadSection(pageContainer.id, page.html, true, page, controller.signal);
        
        pageContainer.dataset.loaded = 'true';

        if (shouldShow) {
            this.showPage(index);
            if (this.pageTransitionAudio && this.pageTransitionAudio.paused) {
                this.pageTransitionAudio.currentTime = 0;
                this.pageTransitionAudio.play().catch(e => console.error("Page transition audio play failed:", e));
            }
        } else {
            pageContainer.classList.remove('active');
        }
    }

    unloadPage(index) {
        const page = this.pages[index];
        if (!page || index === this.currentPageIndex) return;

        const pageContainer = document.getElementById(page.containerId);
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

        const { pageId } = PageManager.getPageInfo(page.html);
        
        // Clean up CSS
        const pageCss = document.getElementById(`css-${pageId}`);
        if (pageCss) pageCss.remove();

        if (window.audioStateManager) {
            window.audioStateManager.unregisterAllPageAudio(pageId);
        }

        // Deep Clean: Reset container
        const newContainer = pageContainer.cloneNode(false);
        newContainer.innerHTML = '';
        newContainer.classList.remove('active', 'leaving');
        newContainer.removeAttribute('data-loaded');
        pageContainer.parentNode.replaceChild(newContainer, pageContainer);
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
        await loadCSS('/views/page.css');
        
        let layoutUrl = htmlPath;
        if (pageData && pageData.layoutId) {
            layoutUrl = `/layouts/${pageData.layoutId}.html?t=${Date.now()}`;
        }

        const response = await fetch(layoutUrl);
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
                    const pageSpecificModule = await import(jsPath);
                    if (pageSpecificModule.onPageLoad) {
                        pageSpecificInit = pageSpecificModule.onPageLoad;
                    }
                } catch (err) { }

                const cachedScene = pageData ? pageData.sceneData : null;
                const cachedMedia = pageData ? pageData.mediaData : null;
                
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