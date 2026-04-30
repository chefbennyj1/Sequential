// views/dashboard/components/SceneEditor/VisualEditorManager.js
import { saveMediaAPI, fetchMedia, fetchNextPanelId } from '../../studio/api/StudioClient.js';
import { openFileBrowser } from '../FileBrowser/FileBrowser.js';

export class VisualEditorManager {
    constructor(container, getActiveAssets, activeSeriesId, activeSeriesFolder) {
        this.container = container;
        this.getActiveAssets = getActiveAssets;
        this.activeSeriesId = activeSeriesId;
        this.activeSeriesFolder = activeSeriesFolder;
        this.currentVisualMediaData = [];
        this.currentVisualContext = {};
        this.selectedPanelSelector = null;
    }

    renderAllPanels(panelNames = []) {
        const toolsPane = document.querySelector('.layout-editor .tools-pane');
        
        // --- Union-Based Data Collector ---
        // Combine panels found in the iframe DOM with panels stored in media.json
        const allUniqueSelectors = new Set([
            ...panelNames,
            ...this.currentVisualMediaData.map(m => m.panel)
        ]);

        const allItems = Array.from(allUniqueSelectors).map(p => {
            const entry = this.currentVisualMediaData.find(m => m.panel === p);
            return {
                panel: p,
                isFloating: entry?.isFloating || false,
                fileName: entry?.fileName || '',
                type: entry?.type || 'image'
            };
        });

        // Sort: Non-floating (A, B, C...) then Floating
        allItems.sort((a, b) => {
            if (a.isFloating !== b.isFloating) return a.isFloating ? 1 : -1;
            return a.panel.localeCompare(b.panel);
        });

        toolsPane.innerHTML = `
            <div class="flex-row justify-between align-center margin-b-15">
                <h4 style="margin:0;">Page Panels</h4>
                <button id="addFloatingPanelBtn" class="small btn-accent">+ Add Floating</button>
            </div>
            
            <div class="panel-editor-ui">
                <p class="text-muted margin-b-15">Select any element to edit its asset and alignment.</p>
                
                <div class="geometry-list margin-b-20">
                    ${allItems.map(item => `
                        <div class="geometry-item ${item.isFloating ? 'bg-black-20 border-accent' : 'bg-black-10 border-dim'} padding-10 border-radius-8 margin-b-10 flex-row align-center cursor-pointer hover-bright" data-panel="${item.panel}">
                            <div class="flex-row align-center gap-10 flex-1">
                                <div class="geometry-thumb border-dim border-radius-4" style="width:40px; height:40px; background:#000; display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0;">
                                    ${item.fileName ? `<img src="/api/images/${this.activeSeriesFolder || this.activeSeriesId}/${this.currentVisualContext.volume}/${this.currentVisualContext.chapter}/${this.currentVisualContext.pageId}/assets/${item.fileName}" style="width:100%; height:100%; object-fit:cover;">` : '<ion-icon name="image-outline" class="text-muted"></ion-icon>'}
                                </div>
                                <div style="min-width:0;">
                                    <div class="text-accent font-weight-bold font-size-09 flex-row align-center gap-5">
                                        ${item.panel.replace('.', '')}
                                        ${item.isFloating ? '<span class="text-muted font-size-06 uppercase border-dim padding-x-5 border-radius-4">Floating</span>' : ''}
                                    </div>
                                    <div class="text-muted font-size-07 truncate">${item.fileName || 'No asset assigned'}</div>
                                </div>
                            </div>
                            ${item.isFloating ? `
                            <button class="small btn-danger-outline delete-geom-btn margin-l-10" data-panel="${item.panel}" title="Delete Geometry">
                                <ion-icon name="trash-outline"></ion-icon>
                            </button>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        const addBtn = document.getElementById('addFloatingPanelBtn');
        if (addBtn) addBtn.onclick = () => this.createFloatingPanel();

        // Bind clicks to selection
        toolsPane.querySelectorAll('.geometry-item').forEach(el => {
            el.onclick = (e) => {
                if (e.target.closest('.delete-geom-btn')) return;
                const panel = el.dataset.panel;
                this.loadPanel({ ...this.currentVisualContext, panel }, this.activeSeriesId);
                
                // Highlight in preview
                const iframe = document.getElementById('pagePreviewFrame');
                if (iframe && iframe.contentWindow) {
                    iframe.contentWindow.postMessage({ type: 'triggerPanelSelection', panel }, '*');
                }
            };
        });

        // Bind deletes
        toolsPane.querySelectorAll('.delete-geom-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.handleDeletePanel(btn.dataset.panel);
            };
        });
    }

    async loadPanel(data, seriesId) {
        const { panel, volume, chapter, pageId } = data;
        this.currentVisualContext = { volume, chapter, pageId };
        this.selectedPanelSelector = panel;
        this.activeSeriesId = seriesId;

        // Get panels from iframe if available
        let panelNames = [];
        const iframe = document.getElementById('pagePreviewFrame');
        if (iframe && iframe.contentWindow && iframe.contentWindow.GEMINI_PANELS) {
            panelNames = iframe.contentWindow.GEMINI_PANELS;
        }

        const res = await fetchMedia(volume, chapter, pageId, seriesId);
        this.currentVisualMediaData = Array.isArray(res) ? res : (res.media || []);

        if (!panel) {
            this.renderAllPanels(panelNames);
            return;
        }

        const container = document.querySelector('.layout-editor .tools-pane');
        container.innerHTML = `<h4 style="margin-top:0;">Panel Settings</h4><div id="visualEditorContainer">Loading...</div>`;
        this.render(panel);
    }

    async createFloatingPanel() {
        const { volume, chapter, pageId } = this.currentVisualContext;
        const mode = document.querySelector('.layout-editor .preview-pane-flex').classList.contains('portrait-mode') ? 'portrait' : 'landscape';

        const nextId = await fetchNextPanelId(this.activeSeriesId, volume, chapter, pageId, mode);
        if (!nextId) return;

        const panelSelector = `.panel-${nextId}`;
        const newEntry = {
            panel: panelSelector,
            isFloating: true,
            type: 'image',
            fileName: '',
            style: {
                position: 'absolute',
                top: '10%',
                left: '10%',
                width: '30%',
                height: 'auto',
                'aspect-ratio': '1 / 1',
                'z-index': '10'
            }
        };

        this.currentVisualMediaData.push(newEntry);
        this.selectedPanelSelector = panelSelector;

        // Auto-save the new panel so it persists
        await saveMediaAPI(volume, chapter, pageId, this.currentVisualMediaData, this.activeSeriesId);

        // Notify preview to render the new panel
        const iframe = document.getElementById('pagePreviewFrame');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.location.reload();
        }

        // Show the properties for the new panel
        this.loadPanel({ ...this.currentVisualContext, panel: panelSelector }, this.activeSeriesId);
    }

    updateCache(panel, type, fileName) {
        const idx = this.currentVisualMediaData.findIndex(m => m.panel === panel);
        const updatedEntry = { panel, type, fileName };
        if (idx !== -1) {
            this.currentVisualMediaData[idx] = { ...this.currentVisualMediaData[idx], ...updatedEntry };
        } else {
            this.currentVisualMediaData.push(updatedEntry);
        }
        if (this.selectedPanelSelector === panel) {
            this.render(panel);
        }
    }

    updatePosition(data) {
        const { panel, left, top } = data;
        const idx = this.currentVisualMediaData.findIndex(m => m.panel === panel);
        if (idx !== -1) {
            const entry = this.currentVisualMediaData[idx];
            if (!entry.style) entry.style = {};
            entry.style.left = left + '%';
            entry.style.top = top + '%';

            // If this is the panel we are currently looking at, update the inputs
            if (this.selectedPanelSelector === panel) {
                const leftInput = document.getElementById('float-left');
                const topInput = document.getElementById('float-top');
                if (leftInput) leftInput.value = left;
                if (topInput) topInput.value = top;
            }
        }
    }

    render(panelSelector) {
        const container = document.getElementById('visualEditorContainer');
        if (!container) return;

        let entry = this.currentVisualMediaData.find(m => m.panel === panelSelector);
        if (!entry) {
            entry = { panel: panelSelector, type: 'image', fileName: '' };
        }

        const parsePos = (posStr) => {
            if (!posStr || ['center', 'top center', 'bottom center', 'left center', 'right center'].includes(posStr)) {
                if (posStr === 'top center') return { x: 50, y: 0 };
                if (posStr === 'bottom center') return { x: 50, y: 100 };
                if (posStr === 'left center') return { x: 0, y: 50 };
                if (posStr === 'right center') return { x: 100, y: 50 };
                return { x: 50, y: 50 };
            }
            const parts = posStr.split(' ');
            return { x: parseFloat(parts[0]) || 50, y: parseFloat(parts[1]) || 50 };
        };

        const isLsCustom = entry.style?.objectPosition && !['center', 'top center', 'bottom center', 'left center', 'right center'].includes(entry.style.objectPosition);
        const isPtCustom = entry.portraitStyle?.objectPosition && !['center', 'top center', 'bottom center', 'left center', 'right center'].includes(entry.portraitStyle.objectPosition);

        const lsPos = parsePos(entry.style?.objectPosition);
        const ptPos = parsePos(entry.portraitStyle?.objectPosition);

        const getNum = (val) => {
            if (typeof val === 'number') return val;
            return parseFloat(val) || 0;
        };

        container.innerHTML = `
            <div class="panel-editor-ui">
                <button id="backToDirectoryBtn" class="small margin-b-15">&larr; Geometry Directory</button>

                ${entry.isFloating ? `
                <div class="floating-panel-settings border-dim padding-10 margin-b-15 border-radius-8 bg-black-20">
                    <div class="flex-row justify-between align-center margin-b-10">
                        <h5 class="text-accent">Floating Geometry</h5>
                        <button id="deleteFloatingPanelBtn" class="small btn-danger-outline">Delete</button>
                    </div>
                    <div class="form-group margin-b-10 flex-row gap-10">
                        <div class="flex-1">
                            <label>Left (%)</label>
                            <input type="number" id="float-left" class="gov-input width-100" value="${getNum(entry.style?.left)}">
                        </div>
                        <div class="flex-1">
                            <label>Top (%)</label>
                            <input type="number" id="float-top" class="gov-input width-100" value="${getNum(entry.style?.top)}">
                        </div>
                        <div class="flex-1">
                            <label>Z-Index</label>
                            <input type="number" id="float-z" class="gov-input width-100" value="${entry.style?.['z-index'] || 10}">
                        </div>
                    </div>
                    <div class="form-group flex-row gap-10 margin-b-10">
                        <div class="flex-1">
                            <label>Width (%)</label>
                            <input type="number" id="float-width" class="gov-input width-100" value="${getNum(entry.style?.width)}">
                        </div>
                        <div class="flex-1">
                            <label>Height</label>
                            <input type="text" id="float-height" class="gov-input width-100" value="${entry.style?.height || 'auto'}" placeholder="auto or %">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Aspect Ratio (W/H)</label>
                        <input type="text" id="float-aspect" class="gov-input width-100" value="${entry.style?.['aspect-ratio'] || 'none'}" placeholder="e.g. 1 / 1 or 16 / 9">
                    </div>
                </div>
                ` : ''}

                <div class="form-group margin-b-15">
                    <label>Asset Type</label>
                    <select id="visual-asset-type" class="gov-select width-100">
                        <option value="image" ${entry.type === 'image' ? 'selected' : ''}>Image</option>
                        <option value="playlist" ${entry.type === 'playlist' ? 'selected' : ''}>Playlist</option>
                    </select>
                </div>
                <div class="form-group margin-b-15">
                    <label>File Name ${entry.isFloating ? '(Panel Overlay)' : ''}</label>
                    <div class="flex-row gap-5">
                        <input type="text" id="visual-asset-name" class="gov-select flex-1" value="${entry.fileName || ''}" placeholder="e.g. background.png">
                        <button id="visual-asset-browse" class="small btn-browse">...</button>
                    </div>
                </div>
                <div class="form-group margin-b-15 flex-row gap-10">
                    <div class="flex-1">
                        <label>Privacy Blinder</label>
                        <div class="flex-row gap-5 align-center">
                            <input type="checkbox" id="visual-privacy-enabled" ${entry.privacy ? 'checked' : ''}>
                            <span>Click to reveal</span>
                        </div>
                    </div>
                    <div class="flex-1">
                        <label>Panel Mask (Repeatable GIF)</label>
                        <div class="flex-row gap-5">
                            <input type="text" id="visual-mask-name" class="gov-select flex-1" value="${entry.maskGif || ''}" placeholder="e.g. memory_mask.gif">
                            <button id="visual-mask-browse" class="small btn-browse">...</button>
                        </div>
                    </div>
                </div>
                <div class="form-group margin-b-15">
                    <label>Mask Background Color</label>
                    <div class="flex-row gap-10">
                        <input type="color" id="visual-mask-bg" class="gov-color-input" value="${entry.maskBg || '#000000'}">
                        <input type="text" id="visual-mask-bg-text" class="gov-input mono flex-1" value="${entry.maskBg || '#000000'}">
                    </div>
                </div>
                <div class="form-group margin-b-15 flex-row gap-10">
                    <div class="flex-1">
                        <label>Landscape Align</label>
                        <select id="visual-style-object-position" class="gov-select width-100">
                            <option value="cover" ${(!isLsCustom && (!entry.style || (entry.style.objectFit !== 'contain' && (!entry.style.objectPosition || entry.style.objectPosition === 'center')))) ? 'selected' : ''}>Cover (Center)</option>
                            <option value="contain" ${(entry.style && entry.style.objectFit === 'contain') ? 'selected' : ''}>Contain (Fit Full)</option>
                            <option value="top center" ${(entry.style && entry.style.objectPosition === 'top center') ? 'selected' : ''}>Cover (Top Pinned)</option>
                            <option value="bottom center" ${(entry.style && entry.style.objectPosition === 'bottom center') ? 'selected' : ''}>Cover (Bottom Pinned)</option>
                            <option value="left center" ${(entry.style && entry.style.objectPosition === 'left center') ? 'selected' : ''}>Cover (Left Pinned)</option>
                            <option value="right center" ${(entry.style && entry.style.objectPosition === 'right center') ? 'selected' : ''}>Cover (Right Pinned)</option>
                            <option value="custom" ${isLsCustom ? 'selected' : ''}>Cover (Custom Pan)</option>
                        </select>
                    </div>
                    <div class="flex-1">
                        <label>Portrait Align</label>
                        <select id="visual-portrait-style-object-position" class="gov-select width-100">
                            <option value="cover" ${(!isPtCustom && (!entry.portraitStyle || (entry.portraitStyle.objectFit !== 'contain' && (!entry.portraitStyle.objectPosition || entry.portraitStyle.objectPosition === 'center')))) ? 'selected' : ''}>Cover (Center)</option>
                            <option value="contain" ${(entry.portraitStyle && entry.portraitStyle.objectFit === 'contain') ? 'selected' : ''}>Contain (Fit Full)</option>
                            <option value="top center" ${(entry.portraitStyle && entry.portraitStyle.objectPosition === 'top center') ? 'selected' : ''}>Cover (Top Pinned)</option>
                            <option value="bottom center" ${(entry.portraitStyle && entry.portraitStyle.objectPosition === 'bottom center') ? 'selected' : ''}>Cover (Bottom Pinned)</option>
                            <option value="left center" ${(entry.portraitStyle && entry.portraitStyle.objectPosition === 'left center') ? 'selected' : ''}>Cover (Left Pinned)</option>
                            <option value="right center" ${(entry.portraitStyle && entry.portraitStyle.objectPosition === 'right center') ? 'selected' : ''}>Cover (Right Pinned)</option>
                            <option value="custom" ${isPtCustom ? 'selected' : ''}>Cover (Custom Pan)</option>
                        </select>
                    </div>
                </div>
                <div class="form-group margin-b-15 flex-row gap-10">
                    <div class="flex-1" id="ls-pan-wrapper" style="display: ${isLsCustom ? 'block' : 'none'};">
                        <label>Landscape Pan (X & Y)</label>
                        <div class="flex-row gap-5 align-center margin-b-5">
                           <span style="width: 15px">X</span>
                           <button type="button" class="small btn-nudge" data-target="ls-x" data-dir="-1">-</button>
                           <input type="range" id="ls-x-slider" min="0" max="100" value="${lsPos.x}" class="flex-1">
                           <button type="button" class="small btn-nudge" data-target="ls-x" data-dir="1">+</button>
                        </div>
                        <div class="flex-row gap-5 align-center">
                           <span style="width: 15px">Y</span>
                           <button type="button" class="small btn-nudge" data-target="ls-y" data-dir="-1">-</button>
                           <input type="range" id="ls-y-slider" min="0" max="100" value="${lsPos.y}" class="flex-1">
                           <button type="button" class="small btn-nudge" data-target="ls-y" data-dir="1">+</button>
                        </div>
                    </div>
                    <div class="flex-1" id="pt-pan-wrapper" style="display: ${isPtCustom ? 'block' : 'none'};">
                        <label>Portrait Pan (X & Y)</label>
                        <div class="flex-row gap-5 align-center margin-b-5">
                           <span style="width: 15px">X</span>
                           <button type="button" class="small btn-nudge" data-target="pt-x" data-dir="-1">-</button>
                           <input type="range" id="pt-x-slider" min="0" max="100" value="${ptPos.x}" class="flex-1">
                           <button type="button" class="small btn-nudge" data-target="pt-x" data-dir="1">+</button>
                        </div>
                        <div class="flex-row gap-5 align-center">
                           <span style="width: 15px">Y</span>
                           <button type="button" class="small btn-nudge" data-target="pt-y" data-dir="-1">-</button>
                           <input type="range" id="pt-y-slider" min="0" max="100" value="${ptPos.y}" class="flex-1">
                           <button type="button" class="small btn-nudge" data-target="pt-y" data-dir="1">+</button>
                        </div>
                    </div>
                </div>
                <button id="saveVisualMediaBtn" class="update__btn width-100 margin-t-10">Save Panel Asset</button>
            </div>
        `;

        this.bindEvents(entry, panelSelector);
    }

    bindEvents(entry, panelSelector) {
        const backBtn = document.getElementById('backToDirectoryBtn');
        const typeSelect = document.getElementById('visual-asset-type');
        const nameInput = document.getElementById('visual-asset-name');
        const maskInput = document.getElementById('visual-mask-name');
        const browseBtn = document.getElementById('visual-asset-browse');
        const maskBrowseBtn = document.getElementById('visual-mask-browse');
        const maskBgInput = document.getElementById('visual-mask-bg');
        const maskBgText = document.getElementById('visual-mask-bg-text');
        const saveBtn = document.getElementById('saveVisualMediaBtn');
        const deleteBtn = document.getElementById('deleteFloatingPanelBtn');

        const lsAlignSelect = document.getElementById('visual-style-object-position');
        const ptAlignSelect = document.getElementById('visual-portrait-style-object-position');
        const lsPanWrapper = document.getElementById('ls-pan-wrapper');
        const ptPanWrapper = document.getElementById('pt-pan-wrapper');

        if (backBtn) backBtn.onclick = () => this.loadPanel({ ...this.currentVisualContext, panel: null }, this.activeSeriesId);

        if (lsAlignSelect && lsPanWrapper) {
            lsAlignSelect.onchange = () => { lsPanWrapper.style.display = lsAlignSelect.value === 'custom' ? 'block' : 'none'; };
        }
        if (ptAlignSelect && ptPanWrapper) {
            ptAlignSelect.onchange = () => { ptPanWrapper.style.display = ptAlignSelect.value === 'custom' ? 'block' : 'none'; };
        }
        if (maskBgInput && maskBgText) {
            maskBgInput.oninput = () => maskBgText.value = maskBgInput.value;
            maskBgText.oninput = () => maskBgInput.value = maskBgText.value;
        }

        browseBtn.onclick = () => {
            const type = typeSelect ? typeSelect.value : 'image';
            openFileBrowser(type, this.currentVisualContext.volume, this.currentVisualContext.chapter, this.currentVisualContext.pageId, (fileName) => {
                nameInput.value = fileName;
            }, 'page', this.activeSeriesId, this.getActiveAssets());
        };

        maskBrowseBtn.onclick = () => {
            openFileBrowser('image', this.currentVisualContext.volume, this.currentVisualContext.chapter, this.currentVisualContext.pageId, (fileName) => {
                maskInput.value = fileName;
            }, 'page', this.activeSeriesId, this.getActiveAssets());
        };

        document.querySelectorAll('.panel-editor-ui .btn-nudge').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                const slider = document.getElementById(btn.dataset.target + '-slider');
                if (slider) slider.value = Math.min(100, Math.max(0, parseInt(slider.value) + parseInt(btn.dataset.dir)));
            };
        });

        saveBtn.onclick = () => this.handleSave(panelSelector);
        if (deleteBtn) deleteBtn.onclick = () => this.handleDeletePanel(panelSelector);
    }

    async handleDeletePanel(panelSelector) {
        if (!confirm(`Are you sure you want to delete floating panel ${panelSelector}?`)) return;

        const idx = this.currentVisualMediaData.findIndex(m => m.panel === panelSelector);
        if (idx === -1) return;

        this.currentVisualMediaData.splice(idx, 1);

        try {
            const res = await saveMediaAPI(this.currentVisualContext.volume, this.currentVisualContext.chapter, this.currentVisualContext.pageId, this.currentVisualMediaData, this.activeSeriesId);
            if (res.ok) {
                const iframe = document.getElementById('pagePreviewFrame');
                if (iframe) iframe.contentWindow.location.reload();
                // Return to main layout tools
                this.loadPanel({ panel: null, ...this.currentVisualContext }, this.activeSeriesId);
            } else throw new Error(res.message);
        } catch (err) {
            alert("Delete failed: " + err.message);
        }
    }

    async handleSave(panelSelector) {
        const typeSelect = document.getElementById('visual-asset-type');
        const nameInput = document.getElementById('visual-asset-name');
        const maskInput = document.getElementById('visual-mask-name');
        const saveBtn = document.getElementById('saveVisualMediaBtn');

        const idx = this.currentVisualMediaData.findIndex(m => m.panel === panelSelector);
        const existingEntry = idx !== -1 ? this.currentVisualMediaData[idx] : {};

        const updatedEntry = {
            ...existingEntry,
            panel: panelSelector,
            type: typeSelect ? typeSelect.value : 'image',
            fileName: nameInput.value,
            maskGif: maskInput.value,
            maskBg: document.getElementById('visual-mask-bg-text')?.value || '#000000',
            privacy: document.getElementById('visual-privacy-enabled')?.checked || false
        };

        let existingStyle = existingEntry.style ? { ...existingEntry.style } : {};
        let existingPortraitStyle = existingEntry.portraitStyle ? { ...existingEntry.portraitStyle } : {};

        // --- Handle Floating Geometry ---
        if (updatedEntry.isFloating) {
            existingStyle.position = 'absolute';
            existingStyle.left = document.getElementById('float-left').value + '%';
            existingStyle.top = document.getElementById('float-top').value + '%';
            existingStyle.width = document.getElementById('float-width').value + '%';

            const hVal = document.getElementById('float-height').value;
            if (hVal.includes('%') || hVal === 'auto') {
                existingStyle.height = hVal;
            } else if (!isNaN(parseFloat(hVal))) {
                existingStyle.height = hVal + '%';
            } else {
                existingStyle.height = 'auto';
            }

            const aspectVal = document.getElementById('float-aspect').value;
            if (aspectVal && aspectVal !== 'none') {
                existingStyle['aspect-ratio'] = aspectVal;
            } else {
                delete existingStyle['aspect-ratio'];
            }

            existingStyle['z-index'] = document.getElementById('float-z').value;
        }

        const lsAlign = document.getElementById('visual-style-object-position')?.value || 'center';
        if (lsAlign === 'custom') {
            const x = document.getElementById('ls-x-slider')?.value || '50';
            const y = document.getElementById('ls-y-slider')?.value || '50';
            existingStyle.objectPosition = `${x}% ${y}%`;
            existingStyle.objectFit = 'cover';
        } else if (lsAlign === 'contain') {
            existingStyle.objectFit = 'contain';
            delete existingStyle.objectPosition;
        } else {
            existingStyle.objectFit = 'cover';
            lsAlign === 'cover' ? delete existingStyle.objectPosition : existingStyle.objectPosition = lsAlign;
        }

        const ptAlign = document.getElementById('visual-portrait-style-object-position')?.value || 'center';
        if (ptAlign === 'custom') {
            const x = document.getElementById('pt-x-slider')?.value || '50';
            const y = document.getElementById('pt-y-slider')?.value || '50';
            existingPortraitStyle.objectPosition = `${x}% ${y}%`;
            existingPortraitStyle.objectFit = 'cover';
        } else if (ptAlign === 'contain') {
            existingPortraitStyle.objectFit = 'contain';
            delete existingPortraitStyle.objectPosition;
        } else {
            existingPortraitStyle.objectFit = 'cover';
            ptAlign === 'cover' ? delete existingPortraitStyle.objectPosition : existingPortraitStyle.objectPosition = ptAlign;
        }

        updatedEntry.style = existingStyle;
        updatedEntry.portraitStyle = existingPortraitStyle;

        if (idx !== -1) this.currentVisualMediaData[idx] = updatedEntry;
        else this.currentVisualMediaData.push(updatedEntry);

        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";

        try {
            const res = await saveMediaAPI(this.currentVisualContext.volume, this.currentVisualContext.chapter, this.currentVisualContext.pageId, this.currentVisualMediaData, this.activeSeriesId);
            if (res.ok) {
                saveBtn.textContent = "Saved!";
                const iframe = document.getElementById('pagePreviewFrame');
                if (iframe) iframe.contentWindow.location.reload();
                setTimeout(() => { saveBtn.disabled = false; saveBtn.textContent = "Save Panel Asset"; }, 2000);
            } else throw new Error(res.message);
        } catch (err) {
            alert("Error: " + err.message);
            saveBtn.disabled = false;
            saveBtn.textContent = "Retry Save";
        }
    }
}
