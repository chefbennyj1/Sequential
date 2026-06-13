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
            item.className = 'arrange-page-item glass glass--bright padding-10 border-radius-8 margin-b-10';
            item.setAttribute('data-id', pageId);

            // 1. Drag Handle
            const handle = document.createElement('div');
            handle.className = 'arrange-handle';
            const handleIcon = document.createElement('ion-icon');
            handleIcon.name = 'reorder-two-outline';
            handle.appendChild(handleIcon);
            item.appendChild(handle);

            // 2. Info Section
            const info = document.createElement('div');
            info.className = 'arrange-info';

            const numSpan = document.createElement('span');
            numSpan.className = 'page-num';
            numSpan.textContent = `Original Index: ${page.index}`;
            info.appendChild(numSpan);

            const idSpan = document.createElement('span');
            idSpan.className = 'page-id';
            idSpan.textContent = pageId;
            info.appendChild(idSpan);

            item.appendChild(info);
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
                // Reload immediately to sync UI
                this.loadPages();
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