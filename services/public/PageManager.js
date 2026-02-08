import { init } from '/libs/pageInitializer.js';
import { loadCSS, loadScript } from '/libs/Utility.js';
import AudioStateManager from '/services/public/AudioStateManager.js';

class PageManager {
    static getPageInfo(url) {
        const urlParts = url.split('/').filter(p => p.length > 0);
        // New standardized URL: /Library/SeriesFolderName/Volumes/volume-1/chapter-1/page1/page.json
        
        const libraryIndex = urlParts.indexOf('Library');
        let series = "No_Overflow"; 
        let volume = "volume-1";
        let chapter = "chapter-1";
        let pageId = "page1";

        if (libraryIndex !== -1 && urlParts.length > libraryIndex + 1) {
            series = urlParts[libraryIndex + 1];
            // Volumes is usually at libraryIndex + 2
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
        this.activeAbortControllers = new Map(); // Track initialization abort signals
    }

    async goToPage(index) {
        if (index < 0 || index >= this.pages.length) return;

        if (this.currentPageContainer) {
            this.unloadPage(this.currentPageIndex);
        }

        await this.loadPage(index);
        this.showPage(index);
    }

    async loadPage(index) {
        if (this.currentPageIndex === index || !this.pages[index]) return;

        const page = this.pages[index];
        const pageContainer = document.getElementById(page.containerId);

        if (pageContainer) {
            // Cancel any pending init for this container
            if (this.activeAbortControllers.has(page.containerId)) {
                this.activeAbortControllers.get(page.containerId).abort();
            }
            const controller = new AbortController();
            this.activeAbortControllers.set(page.containerId, controller);

            // Pass the full page object and abort signal to loadSection
            await loadSection(pageContainer.id, page.html, true, page, controller.signal);
            this.currentPageContainer = pageContainer;
            this.currentPageIndex = index;

            if (this.pageTransitionAudio && this.pageTransitionAudio.paused) {
                this.pageTransitionAudio.currentTime = 0;
                this.pageTransitionAudio.play().catch(e => console.error("Page transition audio play failed:", e));
            }
        }
    }

    unloadPage(index) {
        if (this.currentPageIndex === index && this.currentPageContainer) {
            const pageContainer = this.currentPageContainer;
            
            // Abort any pending initialization for this container
            if (this.activeAbortControllers.has(pageContainer.id)) {
                this.activeAbortControllers.get(pageContainer.id).abort();
                this.activeAbortControllers.delete(pageContainer.id);
            }

            const event = new CustomEvent('view_hidden', { 
                bubbles: true,
                detail: { index: index, section: pageContainer } 
            });
            pageContainer.dispatchEvent(event);

            const pageHtmlPath = this.pages[index].html;
            const { pageId } = PageManager.getPageInfo(pageHtmlPath);

            if (window.audioStateManager) {
                window.audioStateManager.unregisterAllPageAudio(pageId);
            }

            const newContainer = pageContainer.cloneNode(true);
            newContainer.innerHTML = '';
            newContainer.classList.remove('active');
            pageContainer.parentNode.replaceChild(newContainer, pageContainer);

            this.currentPageContainer = null;
            this.currentPageIndex = -1;
        }
    }

    showPage(index) {
        if (this.currentPageContainer && this.currentPageIndex === index) {
            const pageContainer = this.currentPageContainer;
            const wasActive = pageContainer.classList.contains('active');
            pageContainer.classList.add('active');
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
                // Determine Page Directory from htmlPath
                const folderPath = htmlPath.substring(0, htmlPath.lastIndexOf('/'));
                const jsPath = `${folderPath}/page.js`.replace(/\\/g, '/');
                const cssPath = `${folderPath}/page.css`.replace(/\\/g, '/');

                // CLEANUP: Remove old page-specific CSS if it exists
                const oldPageCss = document.getElementById('page-specific-css');
                if (oldPageCss) oldPageCss.remove();

                // Load new CSS with a dedicated ID for future cleanup
                await loadCSS(cssPath, true);
                const newLink = document.querySelector(`link[href*="${cssPath}"]`);
                if (newLink) newLink.id = 'page-specific-css';

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

                // Always call generic init first, passing cached data if available
                const cachedScene = pageData ? pageData.sceneData : null;
                const cachedMedia = pageData ? pageData.mediaData : null;
                
                await init(container, pageInfo, cachedScene, cachedMedia, abortSignal);

                // Then, if a page-specific extension exists, call it
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