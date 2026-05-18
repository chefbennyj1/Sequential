// views/dashboard/components/SceneEditor/VisualEditorManager.js
import { saveMediaAPI, fetchMedia, fetchNextPanelId } from '../../studio/api/StudioClient.js';
import { openFileBrowser } from '../FileBrowser/FileBrowser.js';
import { extractPalette } from '/libs/Utility.js';

export class VisualEditorManager {
    constructor(container, getActiveAssets, activeSeriesId, activeSeriesFolder) {
        this.container = container;
        this.getActiveAssets = getActiveAssets;
        this.activeSeriesId = activeSeriesId;
        this.activeSeriesFolder = activeSeriesFolder;
        this.currentVisualMediaData = [];
        this.currentVisualContext = {};
        this.selectedPanelSelector = null;
        this.activeMode = 'landscape'; // Default mode

        // Setup Socket Listener for Real-Time AI Updates
        if (window.socket) {
            window.socket.on('panel_ai_updated', (data) => {
                if (this.currentVisualContext && 
                    this.currentVisualContext.volume === data.volume &&
                    this.currentVisualContext.chapter === data.chapter &&
                    this.currentVisualContext.pageId === data.pageId) {
                        
                    // Update internal data state
                    const mediaIdx = this.currentVisualMediaData.findIndex(m => m.panel === data.panelId);
                    if (mediaIdx !== -1) {
                        this.currentVisualMediaData[mediaIdx].description = data.description;
                        this.currentVisualMediaData[mediaIdx].alt = data.alt;
                        this.currentVisualMediaData[mediaIdx].hashtags = data.hashtags;
                    }

                    // If this panel is currently being edited in the UI, update the inputs
                    if (this.selectedPanelSelector === data.panelId || this.selectedPanelSelector === '.' + data.panelId) {
                        const descInput = document.getElementById('visual-asset-description');
                        
                        if (descInput) {
                            descInput.value = data.description;
                            descInput.style.borderColor = '#00ccff';
                            setTimeout(() => descInput.style.borderColor = '#333', 1500);
                        }
                        
                        const saveBtn = document.getElementById('saveVisualMediaBtn');
                        const aiBtn = document.getElementById('visual-ai-analyze-btn');
                        if (saveBtn && (saveBtn.textContent.includes('Waiting for AI') || saveBtn.disabled)) {
                            saveBtn.textContent = 'Save Panel Asset';
                            saveBtn.disabled = false;
                        }
                        if (aiBtn && aiBtn.disabled) {
                            aiBtn.disabled = false;
                            aiBtn.innerHTML = '<ion-icon name="sparkles-outline"></ion-icon> <span>AI Analyze Image</span>';
                        }
                    }
                }
            });

            window.socket.on('panel_ai_error', (data) => {
                if (this.currentVisualContext && 
                    this.currentVisualContext.volume === data.volume &&
                    this.currentVisualContext.chapter === data.chapter &&
                    this.currentVisualContext.pageId === data.pageId) {

                    if (this.selectedPanelSelector === data.panelId || this.selectedPanelSelector === '.' + data.panelId) {
                        alert("AI Analysis Failed: " + data.message);

                        const saveBtn = document.getElementById('saveVisualMediaBtn');
                        const aiBtn = document.getElementById('visual-ai-analyze-btn');

                        if (saveBtn) {
                            saveBtn.textContent = 'Save Panel Asset';
                            saveBtn.disabled = false;
                        }
                        if (aiBtn) {
                            aiBtn.disabled = false;
                            aiBtn.innerHTML = '<ion-icon name="sparkles-outline"></ion-icon> <span>AI Analyze Image</span>';
                        }
                    }
                }
            });
        }

        // --- Handle Messages from Preview Iframe ---
        window.addEventListener('message', (e) => {
            if (e.data.type === 'assetUploaded') {
                const { panel, type, fileName } = e.data;
                this.updateCache(panel, type, fileName);
            }
            if (e.data.type === 'panelDragged') {
                this.updatePosition(e.data);
            }
        });
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

        toolsPane.innerHTML = ''; // Clear for full rebuild

        // 1. Header Row
        const headerRow = document.createElement('div');
        headerRow.className = 'flex-row justify-between align-center margin-b-15';

        const title = document.createElement('h4');
        title.style.margin = '0';
        title.textContent = 'Page Panels';
        headerRow.appendChild(title);

        const addBtn = document.createElement('button');
        addBtn.id = 'addFloatingPanelBtn';
        addBtn.className = 'small btn-accent';
        addBtn.textContent = '+ Add Floating';
        addBtn.onclick = () => this.createFloatingPanel();
        headerRow.appendChild(addBtn);

        toolsPane.appendChild(headerRow);

        // 2. Body UI
        const editorUI = document.createElement('div');
        editorUI.className = 'panel-editor-ui';

        const instructions = document.createElement('p');
        instructions.className = 'text-muted margin-b-15';
        instructions.textContent = 'Select any element to edit its asset and alignment.';
        editorUI.appendChild(instructions);

        const geoList = document.createElement('div');
        geoList.className = 'geometry-list margin-b-20';
        editorUI.appendChild(geoList);
        toolsPane.appendChild(editorUI);

        allItems.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = `geometry-item ${item.isFloating ? 'bg-black-20 border-accent' : 'bg-black-10 border-dim'} padding-10 border-radius-8 margin-b-10 flex-row align-center cursor-pointer hover-bright`;
            itemDiv.dataset.panel = item.panel;
            
            itemDiv.onclick = (e) => {
                if (e.target.closest('.delete-geom-btn')) return;
                this.loadPanel({ ...this.currentVisualContext, panel: item.panel }, this.activeSeriesId);
                
                // Highlight in preview
                const iframe = document.getElementById('pagePreviewFrame');
                if (iframe && iframe.contentWindow) {
                    iframe.contentWindow.postMessage({ type: 'triggerPanelSelection', panel: item.panel }, '*');
                }
            };

            const contentRow = document.createElement('div');
            contentRow.className = 'flex-row align-center gap-10 flex-1';

            // Thumbnail
            const thumbDiv = document.createElement('div');
            thumbDiv.className = 'geometry-thumb border-dim border-radius-4';
            thumbDiv.style.cssText = 'width:40px; height:40px; background:#000; display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0;';
            
            if (item.fileName) {
                const img = document.createElement('img');
                const series = this.activeSeriesFolder || this.activeSeriesId;
                const { volume, chapter, pageId } = this.currentVisualContext;
                img.src = `/api/images/${series}/${volume}/${chapter}/${pageId}/assets/${item.fileName}`;
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                thumbDiv.appendChild(img);
            } else {
                const icon = document.createElement('ion-icon');
                icon.name = 'image-outline';
                icon.className = 'text-muted';
                thumbDiv.appendChild(icon);
            }
            contentRow.appendChild(thumbDiv);

            // Info
            const infoDiv = document.createElement('div');
            infoDiv.style.minWidth = '0';

            const nameDiv = document.createElement('div');
            nameDiv.className = 'text-accent font-weight-bold font-size-09 flex-row align-center gap-5';
            nameDiv.textContent = item.panel.replace('.', '');
            
            if (item.isFloating) {
                const floatBadge = document.createElement('span');
                floatBadge.className = 'text-muted font-size-06 uppercase border-dim padding-x-5 border-radius-4';
                floatBadge.textContent = 'Floating';
                nameDiv.appendChild(floatBadge);
            }
            infoDiv.appendChild(nameDiv);

            const fileDiv = document.createElement('div');
            fileDiv.className = 'text-muted font-size-07 truncate';
            fileDiv.textContent = item.fileName || 'No asset assigned';
            infoDiv.appendChild(fileDiv);

            contentRow.appendChild(infoDiv);
            itemDiv.appendChild(contentRow);

            if (item.isFloating) {
                const delBtn = document.createElement('button');
                delBtn.className = 'small btn-danger-outline delete-geom-btn margin-l-10';
                delBtn.dataset.panel = item.panel;
                delBtn.title = 'Delete Geometry';
                
                const trashIcon = document.createElement('ion-icon');
                trashIcon.name = 'trash-outline';
                delBtn.appendChild(trashIcon);
                
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.handleDeletePanel(item.panel);
                };
                itemDiv.appendChild(delBtn);
            }

            geoList.appendChild(itemDiv);
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

        const parseScale = (transform) => {
            if (!transform) return 1;
            const match = transform.match(/scale\(([^)]+)\)/);
            return match ? parseFloat(match[1]) : 1;
        };

        const isLsCustom = entry.style?.objectPosition && !['center', 'top center', 'bottom center', 'left center', 'right center'].includes(entry.style.objectPosition);
        const isPtCustom = entry.portraitStyle?.objectPosition && !['center', 'top center', 'bottom center', 'left center', 'right center'].includes(entry.portraitStyle.objectPosition);

        const lsPos = parsePos(entry.style?.objectPosition);
        const ptPos = parsePos(entry.portraitStyle?.objectPosition);
        const lsScale = parseScale(entry.style?.transform);
        const ptScale = parseScale(entry.portraitStyle?.transform);

        const getNum = (val) => {
            if (typeof val === 'number') return val;
            return parseFloat(val) || 0;
        };

        container.innerHTML = `
            <div class="panel-editor-ui">
                <div class="flex-between align-center margin-b-15">
                    <button id="backToDirectoryBtn" class="small">&larr; Geometry Directory</button>
                    <h4 class="text-accent margin-0" style="text-transform: uppercase;">${panelSelector.replace('.', '')}</h4>
                </div>

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

                <input type="hidden" id="visual-asset-type" value="image">

                <div class="form-group margin-b-15">
                    <label>File Name ${entry.isFloating ? '(Panel Overlay)' : ''}</label>
                    <div class="flex-row gap-5">
                        <input type="text" id="visual-asset-name" class="gov-select flex-1" value="${entry.fileName || ''}" placeholder="e.g. background.png">
                        <button id="visual-asset-browse" class="small btn-browse">...</button>
                    </div>
                </div>
                <div class="form-group margin-b-15">
                    <div class="flex-row justify-between align-center margin-b-5">
                        <label class="margin-0">Panel Description (AI Metadata / Alt Text)</label>
                        <button id="visual-ai-analyze-btn" class="small btn-secondary flex-row align-center gap-5" title="Run Gemini AI for this panel">
                            <ion-icon name="sparkles-outline"></ion-icon>
                            <span>AI Analyze Image</span>
                        </button>
                    </div>
                    <textarea id="visual-asset-description" class="gov-select width-100" rows="3" placeholder="Describe the action and composition...">${entry.description || ''}</textarea>
                </div>
                <div class="form-group margin-b-15 flex-row gap-10">
                    <div class="flex-2">
                        <label>Overlay Image (PNG)</label>
                        <div class="flex-row gap-5">
                            <input type="text" id="visual-overlay-name" class="gov-select flex-1" value="${entry.overlayImage || ''}" placeholder="e.g. overlay_fx.png">
                            <button id="visual-overlay-browse" class="small btn-browse">...</button>
                        </div>
                    </div>
                    <div class="flex-1">
                        <label>Overlay Opacity</label>
                        <input type="number" id="visual-overlay-opacity" class="gov-input width-100" step="0.1" min="0" max="1" value="${entry.overlayOpacity !== undefined ? entry.overlayOpacity : 1.0}">
                    </div>
                </div>
                
                <!-- MODE TABS -->
                <div class="flex-row gap-10 margin-b-15 border-dim-bottom padding-b-10">
                    <button class="mode-tab-btn flex-1 small ${this.activeMode === 'landscape' ? 'active' : ''}" data-mode="landscape">Landscape</button>
                    <button class="mode-tab-btn flex-1 small ${this.activeMode === 'portrait' ? 'active' : ''}" data-mode="portrait">Portrait</button>
                </div>

                <!-- LANDSCAPE CONTROLS -->
                <div id="landscape-controls" class="mode-controls" style="display: ${this.activeMode === 'landscape' ? 'block' : 'none'};">
                    <div class="form-group margin-b-15">
                        <label>Alignment</label>
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
                    <div class="form-group margin-b-15">
                        <label>Scale (Zoom)</label>
                        <div class="flex-row gap-5 align-center">
                            <button type="button" class="small btn-nudge" data-target="ls-scale" data-dir="-0.1">-</button>
                            <input type="number" id="visual-ls-scale" class="gov-input flex-1" step="0.1" min="1.0" value="${lsScale}">
                            <button type="button" class="small btn-nudge" data-target="ls-scale" data-dir="0.1">+</button>
                        </div>
                    </div>
                    <div id="ls-pan-wrapper" style="display: ${isLsCustom ? 'block' : 'none'};">
                        <label>Pan (X & Y)</label>
                        <div class="flex-row gap-5 align-center margin-b-5">
                           <span style="width: 15px">X</span>
                           <button type="button" class="small btn-nudge" data-target="ls-x" data-dir="-1">-</button>
                           <input type="range" id="ls-x-slider" min="-20" max="120" value="${lsPos.x}" class="flex-1">
                           <button type="button" class="small btn-nudge" data-target="ls-x" data-dir="1">+</button>
                        </div>
                        <div class="flex-row gap-5 align-center">
                           <span style="width: 15px">Y</span>
                           <button type="button" class="small btn-nudge" data-target="ls-y" data-dir="-1">-</button>
                           <input type="range" id="ls-y-slider" min="-20" max="120" value="${lsPos.y}" class="flex-1">
                           <button type="button" class="small btn-nudge" data-target="ls-y" data-dir="1">+</button>
                        </div>
                    </div>
                </div>

                <!-- PORTRAIT CONTROLS -->
                <div id="portrait-controls" class="mode-controls" style="display: ${this.activeMode === 'portrait' ? 'block' : 'none'};">
                    <div class="form-group margin-b-15">
                        <label>Alignment</label>
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
                    <div class="form-group margin-b-15">
                        <label>Scale (Zoom)</label>
                        <div class="flex-row gap-5 align-center">
                            <button type="button" class="small btn-nudge" data-target="pt-scale" data-dir="-0.1">-</button>
                            <input type="number" id="visual-pt-scale" class="gov-input flex-1" step="0.1" min="1.0" value="${ptScale}">
                            <button type="button" class="small btn-nudge" data-target="pt-scale" data-dir="0.1">+</button>
                        </div>
                    </div>
                    <div id="pt-pan-wrapper" style="display: ${isPtCustom ? 'block' : 'none'};">
                        <label>Pan (X & Y)</label>
                        <div class="flex-row gap-5 align-center margin-b-5">
                           <span style="width: 15px">X</span>
                           <button type="button" class="small btn-nudge" data-target="pt-x" data-dir="-1">-</button>
                           <input type="range" id="pt-x-slider" min="-20" max="120" value="${ptPos.x}" class="flex-1">
                           <button type="button" class="small btn-nudge" data-target="pt-x" data-dir="1">+</button>
                        </div>
                        <div class="flex-row gap-5 align-center">
                           <span style="width: 15px">Y</span>
                           <button type="button" class="small btn-nudge" data-target="pt-y" data-dir="-1">-</button>
                           <input type="range" id="pt-y-slider" min="-20" max="120" value="${ptPos.y}" class="flex-1">
                           <button type="button" class="small btn-nudge" data-target="pt-y" data-dir="1">+</button>
                        </div>
                    </div>
                </div>

                <div class="tools-footer-sticky">
                    <button id="saveVisualMediaBtn" class="update__btn width-100">Save Panel Asset</button>
                </div>
            </div>
        `;

        this.bindEvents(entry, panelSelector);
    }

    bindEvents(entry, panelSelector) {
        const backBtn = document.getElementById('backToDirectoryBtn');
        const nameInput = document.getElementById('visual-asset-name');
        const overlayInput = document.getElementById('visual-overlay-name');
        const browseBtn = document.getElementById('visual-asset-browse');
        const overlayBrowseBtn = document.getElementById('visual-overlay-browse');
        const saveBtn = document.getElementById('saveVisualMediaBtn');
        const deleteBtn = document.getElementById('deleteFloatingPanelBtn');

        const lsAlignSelect = document.getElementById('visual-style-object-position');
        const ptAlignSelect = document.getElementById('visual-portrait-style-object-position');
        const lsPanWrapper = document.getElementById('ls-pan-wrapper');
        const ptPanWrapper = document.getElementById('pt-pan-wrapper');

        if (backBtn) backBtn.onclick = () => this.loadPanel({ ...this.currentVisualContext, panel: null }, this.activeSeriesId);

        // --- Tab Logic ---
        document.querySelectorAll('.mode-tab-btn').forEach(btn => {
            btn.onclick = () => {
                const mode = btn.dataset.mode;
                this.activeMode = mode;
                
                // Toggle Buttons
                document.querySelectorAll('.mode-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
                
                // Toggle Sections
                document.getElementById('landscape-controls').style.display = mode === 'landscape' ? 'block' : 'none';
                document.getElementById('portrait-controls').style.display = mode === 'portrait' ? 'block' : 'none';
            };
        });

        if (lsAlignSelect && lsPanWrapper) {
            lsAlignSelect.onchange = () => { lsPanWrapper.style.display = lsAlignSelect.value === 'custom' ? 'block' : 'none'; };
        }
        if (ptAlignSelect && ptPanWrapper) {
            ptAlignSelect.onchange = () => { ptPanWrapper.style.display = ptAlignSelect.value === 'custom' ? 'block' : 'none'; };
        }

        if (nameInput) {
            nameInput.oninput = () => this.syncPreview(panelSelector);
        }

        // --- Real-time Sync for Sliders ---
        const sliders = [
            'visual-ls-scale', 'ls-x-slider', 'ls-y-slider',
            'visual-pt-scale', 'pt-x-slider', 'pt-y-slider',
            'float-left', 'float-top', 'float-width', 'float-height', 'float-z'
        ];
        sliders.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.oninput = () => this.syncPreview(panelSelector);
        });

        const selects = ['visual-style-object-position', 'visual-portrait-style-object-position'];
        selects.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.onchange = (e) => {
                if (id === 'visual-style-object-position' && lsPanWrapper) {
                    lsPanWrapper.style.display = el.value === 'custom' ? 'block' : 'none';
                }
                if (id === 'visual-portrait-style-object-position' && ptPanWrapper) {
                    ptPanWrapper.style.display = el.value === 'custom' ? 'block' : 'none';
                }
                this.syncPreview(panelSelector);
            };
        });

        browseBtn.onclick = () => {
            openFileBrowser('image', this.currentVisualContext.volume, this.currentVisualContext.chapter, this.currentVisualContext.pageId, (fileName) => {
                nameInput.value = fileName;
                this.syncPreview(panelSelector);
            }, 'page', this.activeSeriesId, this.getActiveAssets());
        };

        overlayBrowseBtn.onclick = () => {
            openFileBrowser('image', this.currentVisualContext.volume, this.currentVisualContext.chapter, this.currentVisualContext.pageId, (fileName) => {
                overlayInput.value = fileName;
                this.syncPreview(panelSelector);
            }, 'page', this.activeSeriesId, this.getActiveAssets());
        };

        document.querySelectorAll('.panel-editor-ui .btn-nudge').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                const targetId = btn.dataset.target.includes('scale') ? 'visual-' + btn.dataset.target : btn.dataset.target + '-slider';
                const el = document.getElementById(targetId);
                if (el) {
                    const step = parseFloat(btn.dataset.dir);
                    let val = parseFloat(el.value) + step;
                    if (!btn.dataset.target.includes('scale')) {
                        val = Math.min(120, Math.max(-20, Math.round(val)));
                    } else {
                        val = Math.max(1.0, val);
                    }
                    el.value = btn.dataset.target.includes('scale') ? val.toFixed(1) : val;
                    this.syncPreview(panelSelector);
                }
            };
        });

        saveBtn.onclick = () => this.handleSave(panelSelector);
        if (deleteBtn) deleteBtn.onclick = () => this.handleDeletePanel(panelSelector);

        const aiBtn = document.getElementById('visual-ai-analyze-btn');
        if (aiBtn) {
            aiBtn.onclick = async () => {
                // 1. AUTO-SAVE FIRST
                // This ensures the filename is persisted on disk before the AI reads the page.json
                aiBtn.disabled = true;
                aiBtn.innerHTML = '<ion-icon name="save-outline"></ion-icon> <span>Saving...</span>';

                // Create an AbortController for a 60-second timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 60000);

                try {
                    // Call handleSave and wait for it
                    await this.handleSave(panelSelector);

                    // 2. TRIGGER AI
                    aiBtn.innerHTML = '<ion-icon name="sync-outline" class="spin"></ion-icon> <span>Analyzing...</span>';

                    const scope = {
                        seriesId: this.activeSeriesId,
                        volume: this.currentVisualContext.volume,
                        chapter: this.currentVisualContext.chapter,
                        pageId: this.currentVisualContext.pageId,
                        panelId: panelSelector
                    };

                    const res = await fetch('/api/vision/scan', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ force: true, scope }),
                        signal: controller.signal
                    });
                    
                    clearTimeout(timeoutId);
                    const data = await res.json();
                    
                    if (!data.ok) throw new Error(data.message);

                } catch (err) {
                    clearTimeout(timeoutId);
                    let errorMsg = err.message;
                    if (err.name === 'AbortError') {
                        errorMsg = "The AI analysis is taking too long. It might still be processing in the background, but the connection timed out. Please try again later.";
                    }
                    
                    alert("AI Analysis / Save failed: " + errorMsg);
                    aiBtn.disabled = false;
                    aiBtn.innerHTML = '<ion-icon name="sparkles-outline"></ion-icon> <span>AI Analyze Image</span>';
                }
            };
        }
    }

    syncPreview(panelSelector) {
        const iframe = document.getElementById('pagePreviewFrame');
        if (!iframe || !iframe.contentWindow) return;

        // Collect current UI values
        const styles = {};
        const mode = this.activeMode; // Current tab

        const fileName = document.getElementById('visual-asset-name')?.value;
        const assetType = 'image';

        if (mode === 'landscape') {
            const align = document.getElementById('visual-style-object-position')?.value || 'center';
            if (align === 'custom') {
                const x = document.getElementById('ls-x-slider')?.value || '50';
                const y = document.getElementById('ls-y-slider')?.value || '50';
                styles.objectPosition = `${x}% ${y}%`;
                styles.transformOrigin = `${x}% ${y}%`;
            } else if (align === 'contain') {
                styles.objectFit = 'contain';
            } else {
                styles.objectFit = 'cover';
                styles.objectPosition = align === 'cover' ? 'center' : align;
            }

            const scale = document.getElementById('visual-ls-scale')?.value || '1';
            styles.transform = parseFloat(scale) !== 1 ? `scale(${scale})` : 'none';
        } else {
            const align = document.getElementById('visual-portrait-style-object-position')?.value || 'center';
            if (align === 'custom') {
                const x = document.getElementById('pt-x-slider')?.value || '50';
                const y = document.getElementById('pt-y-slider')?.value || '50';
                styles.objectPosition = `${x}% ${y}%`;
                styles.transformOrigin = `${x}% ${y}%`;
            } else if (align === 'contain') {
                styles.objectFit = 'contain';
            } else {
                styles.objectFit = 'cover';
                styles.objectPosition = align === 'cover' ? 'center' : align;
            }

            const scale = document.getElementById('visual-pt-scale')?.value || '1';
            styles.transform = parseFloat(scale) !== 1 ? `scale(${scale})` : 'none';
        }

        // Floating specific
        const floatLeft = document.getElementById('float-left');
        if (floatLeft) {
            styles.left = floatLeft.value + '%';
            styles.top = document.getElementById('float-top').value + '%';
            styles.width = floatLeft.value + '%'; // Note: Should probably be float-width, but kept for parity
            styles.zIndex = document.getElementById('float-z').value;
        }

        iframe.contentWindow.postMessage({ type: 'styleUpdate', panel: panelSelector, styles, fileName, assetType }, '*');
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
                this.loadPanel({ panel: null, ...this.currentVisualContext }, this.activeSeriesId);
            } else throw new Error(res.message);
        } catch (err) {
            alert("Delete failed: " + err.message);
        }
    }

    async handleSave(panelSelector) {
        const nameInput = document.getElementById('visual-asset-name');
        const saveBtn = document.getElementById('saveVisualMediaBtn');

        const idx = this.currentVisualMediaData.findIndex(m => m.panel === panelSelector);
        const existingEntry = idx !== -1 ? this.currentVisualMediaData[idx] : {};

        const updatedEntry = {
            ...existingEntry,
            panel: panelSelector,
            type: 'image',
            fileName: nameInput.value,
            description: document.getElementById('visual-asset-description')?.value || '',
            alt: document.getElementById('visual-asset-description')?.value || '',
            overlayImage: document.getElementById('visual-overlay-name')?.value || '',
            overlayOpacity: parseFloat(document.getElementById('visual-overlay-opacity')?.value) || 1.0
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
            const xSlider = document.getElementById('ls-x-slider');
            const ySlider = document.getElementById('ls-y-slider');
            const x = xSlider ? xSlider.value : '50';
            const y = ySlider ? ySlider.value : '50';
            const pos = `${x}% ${y}%`;
            existingStyle.objectPosition = pos;
            existingStyle.transformOrigin = pos;
            existingStyle.objectFit = 'cover';
        } else if (lsAlign === 'contain') {
            existingStyle.objectFit = 'contain';
            delete existingStyle.objectPosition;
            delete existingStyle.transformOrigin;
        } else {
            existingStyle.objectFit = 'cover';
            if (lsAlign === 'cover') {
                delete existingStyle.objectPosition;
                delete existingStyle.transformOrigin;
            } else {
                existingStyle.objectPosition = lsAlign;
                existingStyle.transformOrigin = lsAlign;
            }
        }

        const ptAlign = document.getElementById('visual-portrait-style-object-position')?.value || 'center';
        if (ptAlign === 'custom') {
            const xSlider = document.getElementById('pt-x-slider');
            const ySlider = document.getElementById('pt-y-slider');
            const x = xSlider ? xSlider.value : '50';
            const y = ySlider ? ySlider.value : '50';
            const pos = `${x}% ${y}%`;
            existingPortraitStyle.objectPosition = pos;
            existingPortraitStyle.transformOrigin = pos;
            existingPortraitStyle.objectFit = 'cover';
        } else if (ptAlign === 'contain') {
            existingPortraitStyle.objectFit = 'contain';
            delete existingPortraitStyle.objectPosition;
            delete existingPortraitStyle.transformOrigin;
        } else {
            existingPortraitStyle.objectFit = 'cover';
            if (ptAlign === 'cover') {
                delete existingPortraitStyle.objectPosition;
                delete existingPortraitStyle.transformOrigin;
            } else {
                existingPortraitStyle.objectPosition = ptAlign;
                existingPortraitStyle.transformOrigin = ptAlign;
            }
        }

        // --- Handle Scaling ---
        const lsScaleInput = document.getElementById('visual-ls-scale');
        const ptScaleInput = document.getElementById('visual-pt-scale');
        
        const lsScaleVal = lsScaleInput ? lsScaleInput.value : '1';
        if (parseFloat(lsScaleVal) !== 1) {
            existingStyle.transform = `scale(${parseFloat(lsScaleVal).toFixed(2)})`;
        } else {
            delete existingStyle.transform;
        }

        const ptScaleVal = ptScaleInput ? ptScaleInput.value : '1';
        if (parseFloat(ptScaleVal) !== 1) {
            existingPortraitStyle.transform = `scale(${parseFloat(ptScaleVal).toFixed(2)})`;
        } else {
            delete existingPortraitStyle.transform;
        }

        updatedEntry.style = existingStyle;
        updatedEntry.portraitStyle = existingPortraitStyle;

        console.log(`[VisualEditor] Saving ${panelSelector}:`, updatedEntry);

        if (idx !== -1) this.currentVisualMediaData[idx] = updatedEntry;
        else this.currentVisualMediaData.push(updatedEntry);

        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";

        try {
            const res = await saveMediaAPI(this.currentVisualContext.volume, this.currentVisualContext.chapter, this.currentVisualContext.pageId, this.currentVisualMediaData, this.activeSeriesId);
            if (res.ok) {
                saveBtn.textContent = "Saved!";
                setTimeout(() => { 
                    saveBtn.disabled = false; 
                    saveBtn.textContent = "Save Panel Asset"; 
                }, 2000);

                const iframe = document.getElementById('pagePreviewFrame');
                if (iframe && iframe.contentWindow) {
                    iframe.contentWindow.postMessage({ 
                        type: 'mediaPersisted', 
                        panel: panelSelector, 
                        entry: updatedEntry 
                    }, '*');
                }

            } else throw new Error(res.message);
        } catch (err) {
            alert("Error: " + err.message);
            saveBtn.disabled = false;
            saveBtn.textContent = "Retry Save";
        }
    }
}
