// views/dashboard/studio/js/ArrangeManager.js

import { fetchChapterDetailsAPI, reorderPagesAPI } from '../api/StudioClient.js';
import { populateSeriesSelect, populateVolumeSelect, populateChapterSelect } from './LibraryManager.js';

class ArrangeManager {
    constructor() {
        this.container = document.getElementById('arrangePagesContainer');
        this.listElement = document.getElementById('arrangePagesList');
        this.saveBtn = document.getElementById('savePageOrderBtn');
        this.resetBtn = document.getElementById('resetPageOrderBtn');
        this.statusMsg = document.getElementById('arrangeStatus');
        
        this.seriesSelect = document.getElementById('arrangeSeriesSelect');
        this.volumeSelect = document.getElementById('arrangeVolumeSelect');
        this.chapterSelect = document.getElementById('arrangeChapterSelect');
        
        this.currentPages = [];
        this.sortable = null;
        
        this.init();
    }

    init() {
        if (!this.container) return;

        // Mode toggling handled by EventHandlers.js (adding listener there)
        
        this.seriesSelect.onchange = () => {
            populateVolumeSelect('arrangeVolumeSelect', this.seriesSelect.value);
            this.clearList();
        };

        this.volumeSelect.onchange = () => {
            populateChapterSelect(this.volumeSelect.value, 'arrangeChapterSelect', false);
            this.clearList();
        };

        this.chapterSelect.onchange = () => {
            this.loadPages();
        };

        this.saveBtn.onclick = () => this.saveOrder();
        this.resetBtn.onclick = () => this.loadPages();

        // Initialize Sortable
        this.sortable = new Sortable(this.listElement, {
            animation: 150,
            ghostClass: 'arrange-ghost',
            onEnd: () => {
                this.saveBtn.disabled = false;
                this.resetBtn.disabled = false;
            }
        });
    }

    clearList() {
        this.listElement.innerHTML = '<div class="text-muted padding-20 italic">Select a chapter to load pages...</div>';
        this.saveBtn.disabled = true;
        this.resetBtn.disabled = true;
    }

    async loadPages() {
        const volId = this.volumeSelect.value;
        const chapId = this.chapterSelect.value;

        if (!volId || !chapId) return;

        this.statusMsg.textContent = "Loading pages...";
        this.statusMsg.style.color = "var(--cyber-primary)";

        try {
            const chapter = await fetchChapterDetailsAPI(volId, chapId);
            if (chapter && chapter.pages) {
                this.currentPages = chapter.pages;
                this.renderPages();
                this.statusMsg.textContent = "";
            } else {
                this.listElement.innerHTML = '<div class="text-muted padding-20">No pages found in this chapter.</div>';
            }
        } catch (err) {
            this.statusMsg.textContent = "Error loading pages.";
            this.statusMsg.style.color = "#ff4141";
        }
    }

    renderPages() {
        this.listElement.innerHTML = '';
        
        this.currentPages.forEach(page => {
            const pageId = this.extractPageId(page.path);
            const item = document.createElement('div');
            item.className = 'arrange-page-item';
            item.setAttribute('data-id', pageId);
            
            // Thumbnail placeholder or actual image if available
            let thumbHtml = '<div class="page-thumb-placeholder"><ion-icon name="image-outline"></ion-icon></div>';
            if (page.mediaData && page.mediaData.media && page.mediaData.media.length > 0) {
                const firstImg = page.mediaData.media.find(m => m.type === 'image');
                if (firstImg) {
                    // Try to resolve path - this might need more logic depending on server setup
                    // For now using placeholder
                }
            }

            item.innerHTML = `
                <div class="arrange-handle"><ion-icon name="reorder-two-outline"></ion-icon></div>
                <div class="arrange-info">
                    <span class="page-num">Original Index: ${page.index}</span>
                    <span class="page-id">${pageId}</span>
                </div>
            `;
            this.listElement.appendChild(item);
        });

        this.saveBtn.disabled = true;
        this.resetBtn.disabled = true;
    }

    extractPageId(pathStr) {
        if (!pathStr) return 'unknown';
        const parts = pathStr.replace(/\\/g, '/').split('/').filter(p => p.length > 0);
        const lastPart = parts[parts.length - 1];
        return lastPart.includes('.') ? parts[parts.length - 2] : lastPart;
    }

    async saveOrder() {
        const newOrder = Array.from(this.listElement.querySelectorAll('.arrange-page-item'))
            .map(el => el.getAttribute('data-id'));

        const seriesId = this.seriesSelect.value;
        const volFolder = this.volumeSelect.options[this.volumeSelect.selectedIndex]?.getAttribute('data-folder');
        const chapName = this.chapterSelect.options[this.chapterSelect.selectedIndex]?.textContent.split(':')[0].trim().toLowerCase().replace(' ', '-');
        // Better chapName extraction
        const chapValue = this.chapterSelect.value; // chapter-N or ObjectId

        this.saveBtn.disabled = true;
        this.statusMsg.textContent = "Updating page order... This may take a moment.";
        this.statusMsg.style.color = "var(--cyber-primary)";

        try {
            const res = await reorderPagesAPI({
                series: seriesId,
                volume: volFolder,
                chapter: chapValue.includes('chapter-') ? chapValue : `chapter-${this.chapterSelect.options[this.chapterSelect.selectedIndex].text.match(/Chapter (\d+)/)[1]}`,
                newOrder
            });

            if (res.ok) {
                this.statusMsg.textContent = "Order saved successfully! Chapter re-indexed.";
                this.statusMsg.style.color = "#00ff41";
                setTimeout(() => this.loadPages(), 1500);
            } else {
                throw new Error(res.message);
            }
        } catch (err) {
            this.statusMsg.textContent = "Error: " + err.message;
            this.statusMsg.style.color = "#ff4141";
            this.saveBtn.disabled = false;
        }
    }
}

export default ArrangeManager;