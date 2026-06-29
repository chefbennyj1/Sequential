// views/dashboard/components/SceneEditor/VisualEditorManager.js
import { fetchMedia, saveSceneData } from '../../studio/api/StudioClient.js';
import { openFileBrowser } from '../FileBrowser/FileBrowser.js';
import { renderPanelSettings, renderAllPanelsTemplate } from './VisualEditorUI.js';
import { renderDialogueProperties } from './VisualEditorDialogueUI.js';
import { pushPanelSelect, syncPreviewLive, pushMediaPersisted, pushSceneUpdate } from './VisualEditorSync.js';
import { VisualEditorAssetManager } from './VisualEditorAssetManager.js';

/**
 * VisualEditorManager
 * The central orchestrator for the Visual Editor Studio sub-system.
 * Orchestrates communication between Socket.io, the Preview Iframe, and specialized Managers.
 */
export class VisualEditorManager {
    constructor(container, getActiveAssets, activeSeriesId, activeSeriesFolder, getActiveSceneData) {
        this.container = container;
        this.getActiveAssets = getActiveAssets;
        this.activeSeriesId = activeSeriesId;
        this.activeSeriesFolder = activeSeriesFolder;
        this.getActiveSceneData = getActiveSceneData; 
        
        this.currentVisualMediaData = [];
        this.currentVisualContext = {}; // { volume, chapter, pageId }
        this.selectedPanelSelector = null;
        this.isSpread = false;
        this.activeTab = 'panels';

        // Initialize Asset Manager
        this.assetManager = new VisualEditorAssetManager(this.currentVisualContext, this.currentVisualMediaData, this.activeSeriesId);

        this.initSocketListeners();
        this.initMessageListeners();
    }

    initSocketListeners() {
        if (!window.socket) return;
        window.socket.on('panel_ai_updated', (data) => this.handleAiUpdated(data));
        window.socket.on('panel_ai_error', (data) => this.handleAiError(data));
    }

    initMessageListeners() {
        window.addEventListener('message', (e) => {
            const { type, panel, assetType, fileName } = e.data;

            if (type === 'assetUploaded') {
                this.updateCache(panel, assetType, fileName);
            }
            if (type === 'panelDragged') {
                this.updatePosition(e.data);
            }
            if (type === 'panelSelected') {
                this.loadPanel(e.data, this.activeSeriesId);
            }
        });
    }

    handleAiUpdated(data) {
        if (!this.isCurrentContext(data)) return;
            
        const mediaIdx = this.currentVisualMediaData.findIndex(m => m.panel === data.panelId);
        if (mediaIdx !== -1) {
            this.currentVisualMediaData[mediaIdx].description = data.description;
            this.currentVisualMediaData[mediaIdx].alt = data.alt;
            this.currentVisualMediaData[mediaIdx].hashtags = data.hashtags;
        }

        // Robust selector matching (strip dots for comparison)
        const cleanSelected = this.selectedPanelSelector ? this.selectedPanelSelector.replace('.', '') : null;
        const cleanIncoming = data.panelId ? data.panelId.replace('.', '') : null;

        if (cleanSelected === cleanIncoming) {
            const descInput = document.getElementById('visual-asset-description');
            if (descInput) {
                descInput.value = data.description;
                descInput.style.borderColor = '#00ccff';
                setTimeout(() => descInput.style.borderColor = '#333', 1500);
            }
            this.resetAiButtonState();
            if (window.GlassToast) {
                window.GlassToast.show('success', 'Analysis Complete', 'Image AI analysis finished successfully.');
            }
        } else {
            // Re-render directory to update AI step in stepper
            const iframe = document.getElementById('pagePreviewFrame');
            let panelNames = (iframe && iframe.contentWindow?.GEMINI_PANELS) ? iframe.contentWindow.GEMINI_PANELS : [];
            if (!this.selectedPanelSelector) this.renderDirectory(panelNames);
            if (window.GlassToast) {
                window.GlassToast.show('success', 'Analysis Complete', `Panel ${data.panelId} analysis finished.`);
            }
        }
    }

    handleAiError(data) {
        if (!this.isCurrentContext(data)) return;
        const cleanSelected = this.selectedPanelSelector ? this.selectedPanelSelector.replace('.', '') : null;
        const cleanIncoming = data.panelId ? data.panelId.replace('.', '') : null;

        if (cleanSelected === cleanIncoming) {
            this.resetAiButtonState();
            const msg = data.message ? data.message.toLowerCase() : "";
            
            if (msg.includes('apikey') || msg.includes('api key') || msg.includes('expired')) {
                if (window.GlassToast) {
                    window.GlassToast.show('error', 'API Key Required', 'Please add your APIKey in the AI settings of the application.');
                } else {
                    alert("Please add your APIKey in the AI settings of the application.");
                }
            } else {
                if (window.GlassToast) {
                    window.GlassToast.show('error', 'Analysis Failed', data.message);
                } else {
                    alert("AI Analysis Failed: " + data.message);
                }
            }
        }
    }

    isCurrentContext(data) {
        return this.currentVisualContext && 
               this.currentVisualContext.chapter === data.chapter &&
               this.currentVisualContext.pageId === data.pageId;
    }

    resetAiButtonState() {
        const saveBtn = document.getElementById('saveVisualMediaBtn');
        const aiBtn = document.getElementById('visual-ai-analyze-btn');
        if (saveBtn && (saveBtn.textContent.includes('Waiting for AI') || saveBtn.disabled)) {
            saveBtn.textContent = 'Save Panel Asset';
            saveBtn.disabled = false;
        }
        if (aiBtn && aiBtn.disabled) {
            aiBtn.disabled = false;
            aiBtn.innerHTML = '<ion-icon name="sparkles-outline"></ion-icon> <span>AI Scan</span>';
        }
    }

    async loadPanel(data, seriesId) {
        const { volume, chapter, pageId, panel } = data;
        const selector = panel;
        this.selectedPanelSelector = selector;

        // Context Switch Logic: If a specific pageId is provided in the message, 
        // we must update our internal context to match that page (essential for spreads)
        if (volume && chapter && pageId) {
            this.currentVisualContext = { volume, chapter, pageId };
            this.activeSeriesId = seriesId;
            this.assetManager.setContext(this.currentVisualContext, seriesId);

            const res = await fetchMedia(volume, chapter, pageId, seriesId);
            this.currentVisualMediaData = res.media || [];
            this.assetManager.mediaData = this.currentVisualMediaData;
            this.isSpread = !!res.isSpread;
        }

        const iframe = document.getElementById('pagePreviewFrame');
        let panelNames = (iframe && iframe.contentWindow?.GEMINI_PANELS) ? iframe.contentWindow.GEMINI_PANELS : [];
        
        await this.render(panelNames);
        if (selector) pushPanelSelect(iframe, selector, pageId);
    }

    async render(panelNames) {
        if (this.selectedPanelSelector) {
            this.renderPanelEditor(this.selectedPanelSelector);
        } else {
            this.renderDirectory(panelNames);
        }
    }

    renderDirectory(panelNames) {
        // Tab switching header
        const tabsHtml = `
            <div class="editor-tabs flex-row border-dim-bottom margin-b-15">
                <button class="tab-btn flex-1 padding-y-10 text-center font-weight-bold ${this.activeTab === 'panels' ? 'active' : ''}" data-tab="panels">Panels</button>
                <button class="tab-btn flex-1 padding-y-10 text-center font-weight-bold ${this.activeTab === 'timeline' ? 'active' : ''}" data-tab="timeline">Timeline</button>
            </div>
        `;

        if (this.activeTab === 'panels') {
            const panelsHtml = renderAllPanelsTemplate(
                panelNames,
                this.currentVisualMediaData,
                this.activeSeriesFolder,
                this.activeSeriesId,
                this.currentVisualContext,
                this.isSpread
            );

            this.toolsPane.innerHTML = `
                ${tabsHtml}
                <div class="tab-content fade-in">
                    ${panelsHtml}
                </div>
            `;
            this.bindDirectoryEvents();
        } else {
            this.toolsPane.innerHTML = `
                ${tabsHtml}
                <div class="tab-content fade-in">
                    <div class="flex-row justify-between align-center margin-b-15">
                        <h4 class="margin-0">Timeline</h4>
                        <div class="glass-tooltip-wrap">
                            <button id="addItemBtn" class="glass glass-btn glass-btn--sm glass-btn--primary">+ Add Dialogue</button>
                            <div class="glass glass--dark glass-tooltip">Add SpeechBubble or TextBlock to page</div>
                        </div>
                    </div>
                    <div class="timeline-container">
                        <ul id="sceneTreeList" class="scene-list timeline-list"></ul>
                    </div>
                </div>
            `;

            // Populate timeline data
            if (this.timeline) {
                const sceneData = this.getActiveSceneData();
                this.timeline.setData(sceneData, this.properties?.availableCharacters);
            }

            this.bindTimelineTabEvents();
        }

        this.bindTabClickEvents();
    }

    bindTabClickEvents() {
        const tabs = this.toolsPane.querySelectorAll('.tab-btn');
        tabs.forEach(tab => {
            tab.onclick = () => {
                const selectedTab = tab.dataset.tab;
                if (this.activeTab !== selectedTab) {
                    this.activeTab = selectedTab;
                    const iframe = document.getElementById('pagePreviewFrame');
                    const panelNames = (iframe && iframe.contentWindow?.GEMINI_PANELS) ? iframe.contentWindow.GEMINI_PANELS : [];
                    this.renderDirectory(panelNames);
                }
            };
        });
    }

    bindTimelineTabEvents() {
        const addBtn = document.getElementById('addItemBtn');
        if (addBtn) {
            addBtn.onclick = (e) => {
                e.stopPropagation();
                this.showAddDialoguePopover(addBtn);
            };
        }
    }

    showAddDialoguePopover(anchorEl) {
        let popover = document.getElementById('addDialoguePopover');
        if (popover) {
            popover.remove();
        }

        const popoverHtml = `
            <div id="addDialoguePopover" class="glass glass--dark border-radius-8 padding-10 add-dialogue-popover">
                <div class="text-accent uppercase font-size-07 font-weight-bold margin-b-10 popover-header">Select Dialogue Type</div>
                <div class="popover-options flex-column gap-5">
                    <div class="popover-opt cursor-pointer hover-bright padding-8 border-radius-4 flex-row align-center gap-10" data-type="SpeechBubble">
                        <ion-icon name="chatbubble-outline"></ion-icon>
                        <span>Speech Bubble</span>
                    </div>
                    <div class="popover-opt cursor-pointer hover-bright padding-8 border-radius-4 flex-row align-center gap-10" data-type="Narrator">
                        <ion-icon name="document-text-outline"></ion-icon>
                        <span>TextBlock: Narrator</span>
                    </div>
                    <div class="popover-opt cursor-pointer hover-bright padding-8 border-radius-4 flex-row align-center gap-10" data-type="InternalMonologue">
                        <ion-icon name="help-circle-outline"></ion-icon>
                        <span>TextBlock: Internal</span>
                    </div>
                    <div class="popover-opt cursor-pointer hover-bright padding-8 border-radius-4 flex-row align-center gap-10" data-type="Dialogue">
                        <ion-icon name="chatbubbles-outline"></ion-icon>
                        <span>TextBlock: Dialogue</span>
                    </div>
                    <div class="popover-opt cursor-pointer hover-bright padding-8 border-radius-4 flex-row align-center gap-10" data-type="ActionText">
                        <ion-icon name="flash-outline"></ion-icon>
                        <span>Action Text</span>
                    </div>
                </div>
            </div>
        `;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = popoverHtml.trim();
        popover = tempDiv.firstChild;
        document.body.appendChild(popover);

        const rect = anchorEl.getBoundingClientRect();
        popover.style.top = `${rect.bottom + window.scrollY + 5}px`;
        popover.style.left = `${rect.right - 220 + window.scrollX}px`;

        const outsideClickListener = (e) => {
            if (!popover.contains(e.target) && !anchorEl.contains(e.target)) {
                popover.remove();
                document.removeEventListener('click', outsideClickListener);
            }
        };
        setTimeout(() => document.addEventListener('click', outsideClickListener), 0);

        popover.querySelectorAll('.popover-opt').forEach(opt => {
            opt.onclick = () => {
                const type = opt.dataset.type;
                popover.remove();
                document.removeEventListener('click', outsideClickListener);
                this.createNewDialogueItem(type);
            };
            opt.onmouseenter = () => opt.style.background = 'rgba(255, 255, 255, 0.1)';
            opt.onmouseleave = () => opt.style.background = 'transparent';
        });
    }

    createNewDialogueItem(type) {
        const sceneData = this.getActiveSceneData();
        const generateId = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Math.random().toString(36).substr(2, 9);
        
        let displayType = { type: 'SpeechBubble' };
        if (['Narrator', 'InternalMonologue', 'Dialogue'].includes(type)) {
            displayType = { type: 'TextBlock', style: type };
        } else if (type === 'ActionText') {
            displayType = { type: 'ActionText' };
        }

        const newItem = {
            id: generateId(),
            displayOrder: sceneData.length,
            displayType: displayType,
            character: 'New',
            text: 'Text',
            placement: { panel: '.panel-A', bottom: '2%', left: '2%', right: '2%' },
            mediaAction: []
        };
        
        sceneData.push(newItem);

        // Update Timeline
        if (this.timeline) {
            this.timeline.setData(sceneData, this.properties?.availableCharacters);
            const newIndex = sceneData.length - 1;
            this.selectSceneItem(newIndex);
        }

        // Notify preview iframe
        const iframe = document.getElementById('pagePreviewFrame');
        if (iframe) {
            pushSceneUpdate(iframe, sceneData, this.currentVisualMediaData, this.currentVisualContext.pageId);
        }
    }

    selectSceneItem(index) {
        const sceneData = this.getActiveSceneData();
        const item = sceneData[index];
        if (!item) return;

        if (this.timeline) {
            this.timeline.setSelectedIndex(index);
        }

        this.showDialogueProperties(item, this.properties, async () => {
            await saveSceneData(this.currentVisualContext.volume, this.currentVisualContext.chapter, this.currentVisualContext.pageId, sceneData, this.activeSeriesId);
        }, async (delItem) => {
            const idx = sceneData.findIndex(i => i.id == delItem.id);
            if (idx !== -1) {
                sceneData.splice(idx, 1);
                sceneData.forEach((itm, i) => itm.displayOrder = i);
                await saveSceneData(this.currentVisualContext.volume, this.currentVisualContext.chapter, this.currentVisualContext.pageId, sceneData, this.activeSeriesId);
                this.loadPanel({ panel: null }, this.activeSeriesId);
                const iframe = document.getElementById('pagePreviewFrame');
                if (iframe) {
                    pushSceneUpdate(iframe, sceneData, this.currentVisualMediaData, this.currentVisualContext.pageId);
                }
            }
        });

        const iframe = document.getElementById('pagePreviewFrame');
        if (iframe?.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'dialogueHighlight', id: item.id }, '*');
        }
    }

    get toolsPane() {
        return document.querySelector('.layout-editor .tools-pane');
    }

    renderPanelEditor(panelSelector) {
        const normalizePanel = (p) => p ? p.replace(/^\./, '') : '';
        const normalizedSelector = normalizePanel(panelSelector);
        const entry = this.currentVisualMediaData.find(m => normalizePanel(m.panel) === normalizedSelector) || { panel: panelSelector, type: 'image' };
        
        const style = entry.style || {};
        const isCustom = !!(style.objectPosition && style.objectPosition.includes('%'));

        const getNum = (val) => {
            if (!val) return 50;
            const n = parseFloat(val.replace('%', ''));
            return isNaN(n) ? 50 : n;
        };

        const ptPos = { x: 50, y: 50 };
        if (isCustom) {
            const parts = style.objectPosition.split(' ');
            ptPos.x = getNum(parts[0]);
            ptPos.y = getNum(parts[1]);
        }

        const ptScale = style.transform ? parseFloat(style.transform.match(/scale\((.*?)\)/)?.[1] || 1) : 1;

        this.toolsPane.innerHTML = renderPanelSettings(panelSelector, entry, isCustom, ptPos, ptScale, getNum);
        
        // AI Constraint: Hide analysis tools if disabled in global settings
        const aiBtn = document.getElementById('visual-ai-analyze-btn');
        if (aiBtn && window.AI_CONFIG && !window.AI_CONFIG.visionEnabled) {
            aiBtn.classList.add('hidden');
        }

        this.bindEditorEvents(panelSelector);
    }

    bindDirectoryEvents() {
        const pane = this.toolsPane;
        pane.querySelectorAll('.geometry-item').forEach(el => {
            el.onclick = (e) => {
                if (e.target.closest('.delete-geom-btn')) return;
                this.renderPanelEditor(el.dataset.panel);
            };
        });

        pane.querySelectorAll('.delete-geom-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.handleDeletePanel(btn.closest('.geometry-item').dataset.panel);
            };
        });

        const addFloatingBtn = document.getElementById('addFloatingPanelBtn');
        if (addFloatingBtn) {
            addFloatingBtn.onclick = async () => {
                const name = await this.showGlassPrompt("Floating Panel ID (e.g. .panel-FX):", ".panel-new");
                if (name) {
                    const newEntry = { 
                        panel: name, 
                        type: 'image', 
                        isFloating: true, 
                        style: { position: 'absolute', top: '10%', left: '10%', width: '30%', 'z-index': 100 } 
                    };
                    this.currentVisualMediaData.push(newEntry);
                    
                    // Persist immediately so it appears in the iframe and is saved
                    try {
                        await this.assetManager.saveMedia();
                        this.renderPanelEditor(name);
                        if (window.GlassToast) window.GlassToast.show('success', 'Success', 'Floating panel created.');
                    } catch (err) {
                        if (window.GlassToast) window.GlassToast.show('error', 'Error', "Failed to create floating panel: " + err.message);
                    }
                }
            };
        }

        const syncBtn = document.getElementById('syncPageToDbBtn');
        if (syncBtn) {
            syncBtn.onclick = async () => {
                const originalText = syncBtn.innerHTML;
                syncBtn.disabled = true;
                syncBtn.innerHTML = '<ion-icon name="sync-outline" class="spin"></ion-icon> Syncing...';
                try {
                    const { volume, chapter, pageId } = this.currentVisualContext;
                    const seriesId = this.activeSeriesId;
                    const res = await fetch(`/api/editor/sync-page/${seriesId}/${volume}/${chapter}/${pageId}`, {
                        method: 'POST'
                    });
                    const data = await res.json();
                    if (data.ok) {
                        if (window.GlassToast) window.GlassToast.show('success', 'Synced', 'Page changes pushed to database.');
                    } else {
                        throw new Error(data.message || 'Sync failed');
                    }
                } catch (e) {
                    if (window.GlassToast) window.GlassToast.show('error', 'Sync Failed', e.message);
                } finally {
                    syncBtn.disabled = false;
                    syncBtn.innerHTML = originalText;
                }
            };
        }

        const spreadToggleGroup = document.getElementById('spreadToggleGroup');
        if (spreadToggleGroup) {
            spreadToggleGroup.onclick = async (e) => {
                const opt = e.target.closest('.glass-toggle__opt');
                if (!opt || opt.classList.contains('is-on')) return;

                // UI Update
                spreadToggleGroup.querySelectorAll('.glass-toggle__opt').forEach(el => el.classList.remove('is-on'));
                opt.classList.add('is-on');

                this.isSpread = (opt.dataset.value === 'spread');
                const { volume, chapter, pageId } = this.currentVisualContext;
                const seriesId = this.activeSeriesId;
                
                try {
                    await fetch('/api/editor/toggle-spread', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ seriesId, volumeId: volume, chapterId: chapter, pageId, enabled: this.isSpread })
                    });
                    // Reload iframe to show/hide partner page
                    document.getElementById('pagePreviewFrame').contentWindow.location.reload();
                } catch (e) { console.error(e); }
            };
        }

    }

    bindEditorEvents(panelSelector) {
        const pane = this.toolsPane;
        
        const backBtn = document.getElementById('backToDirectoryBtn');
        if (backBtn) {
            backBtn.onclick = () => {
                this.selectedPanelSelector = null;
                const iframe = document.getElementById('pagePreviewFrame');
                let panelNames = (iframe && iframe.contentWindow?.GEMINI_PANELS) ? iframe.contentWindow.GEMINI_PANELS : [];
                this.renderDirectory(panelNames);
                if (iframe) pushPanelSelect(iframe, null, this.currentVisualContext.pageId);
            };
        }

        const browseBtn = document.getElementById('visual-asset-browse');
        if (browseBtn) {
            browseBtn.onclick = () => {
                const { volume, chapter, pageId } = this.currentVisualContext;
                openFileBrowser('image', volume, chapter, pageId, (file) => {
                    document.getElementById('visual-asset-name').value = file;
                    this.handleLiveSync(panelSelector);
                }, 'page', this.activeSeriesId);
            };
        }

        const overlayBrowseBtn = document.getElementById('visual-overlay-browse');
        if (overlayBrowseBtn) {
            overlayBrowseBtn.onclick = () => {
                const { volume, chapter, pageId } = this.currentVisualContext;
                openFileBrowser('image', volume, chapter, pageId, (file) => {
                    document.getElementById('visual-overlay-name').value = file;
                    this.handleLiveSync(panelSelector);
                }, 'page', this.activeSeriesId);
            };
        }

        const aiBtn = document.getElementById('visual-ai-analyze-btn');
        if (aiBtn) aiBtn.onclick = () => this.handleAiScan(panelSelector);

        const saveBtn = document.getElementById('saveVisualMediaBtn');
        if (saveBtn) saveBtn.onclick = () => this.handleSave(panelSelector);

        const flipHBtn = document.getElementById('visual-flip-h');
        if (flipHBtn) flipHBtn.onclick = () => this.handleFlip(panelSelector, 'horizontal');

        const flipVBtn = document.getElementById('visual-flip-v');
        if (flipVBtn) flipVBtn.onclick = () => this.handleFlip(panelSelector, 'vertical');

        const delBtn = document.getElementById('deleteFloatingPanelBtn');
        if (delBtn) delBtn.onclick = () => this.handleDeletePanel(panelSelector);

        // Inputs for live sync
        ['visual-asset-name', 'visual-overlay-name', 'visual-overlay-opacity', 'visual-portrait-style-object-position', 'visual-pt-scale', 'pt-x-slider', 'pt-y-slider', 'float-left', 'float-top', 'float-width', 'float-height', 'float-aspect', 'float-z'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.oninput = () => {
                    if (id === 'pt-x-slider' || id === 'pt-y-slider') {
                        const select = document.getElementById('visual-portrait-style-object-position');
                        if (select) select.value = 'custom';
                    }
                    this.handleLiveSync(panelSelector);
                };
            }
        });

        // Object Position Toggle
        const objPosSelect = document.getElementById('visual-portrait-style-object-position');
        if (objPosSelect) {
            objPosSelect.onchange = () => {
                document.getElementById('pt-pan-wrapper').style.display = (objPosSelect.value === 'custom') ? 'block' : 'none';
                this.handleLiveSync(panelSelector);
            };
        }

        // Nudge Buttons
        pane.querySelectorAll('.btn-nudge').forEach(btn => {
            btn.onclick = () => {
                const targetId = btn.dataset.target;
                const dir = parseFloat(btn.dataset.dir);
                let input;
                if (targetId === 'pt-scale') input = document.getElementById('visual-pt-scale');
                if (targetId === 'pt-x') {
                    input = document.getElementById('pt-x-slider');
                    const select = document.getElementById('visual-portrait-style-object-position');
                    if (select) select.value = 'custom';
                }
                if (targetId === 'pt-y') {
                    input = document.getElementById('pt-y-slider');
                    const select = document.getElementById('visual-portrait-style-object-position');
                    if (select) select.value = 'custom';
                }
                
                if (input) {
                    input.value = parseFloat(input.value) + dir;
                    this.handleLiveSync(panelSelector);
                }
            };
        });
    }

    handleLiveSync(panelSelector) {
        const getVal = (id) => document.getElementById(id)?.value;
        const alignVal = getVal('visual-portrait-style-object-position');
        const scale = getVal('visual-pt-scale');
        
        const style = {};
        if (alignVal === 'custom') {
            const pos = `${getVal('pt-x-slider')}% ${getVal('pt-y-slider')}%`;
            style.objectPosition = pos;
            style.transformOrigin = pos;
            style.objectFit = 'cover';
        } else {
            style.objectFit = (alignVal === 'contain') ? 'contain' : 'cover';
            if (alignVal !== 'contain' && alignVal !== 'cover') {
                style.objectPosition = alignVal;
                style.transformOrigin = alignVal;
            }
        }

        if (parseFloat(scale) !== 1) style.transform = `scale(${scale})`;

        // Floating specific
        const isFloating = !!document.getElementById('float-left');
        if (isFloating) {
            style.position = 'absolute';
            style.left = getVal('float-left') + '%';
            style.top = getVal('float-top') + '%';
            style.width = getVal('float-width') + '%';
            const h = getVal('float-height');
            style.height = (h.includes('%') || h === 'auto') ? h : (parseFloat(h) ? h + '%' : 'auto');
            const aspect = getVal('float-aspect');
            if (aspect && aspect !== 'none') style.aspectRatio = aspect;
            style.zIndex = getVal('float-z');
        }

        syncPreviewLive(
            document.getElementById('pagePreviewFrame'),
            panelSelector,
            {
                styles: style,
                fileName: getVal('visual-asset-name'),
                overlayImage: getVal('visual-overlay-name'),
                overlayOpacity: getVal('visual-overlay-opacity'),
                pageId: this.currentVisualContext.pageId
            }
        );
    }

    async handleFlip(panelSelector, direction) {
        const btn = document.getElementById(`visual-flip-${direction === 'horizontal' ? 'h' : 'v'}`);
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<ion-icon name="sync-outline" class="spin"></ion-icon>';

        const fileName = document.getElementById('visual-asset-name').value;
        if (!fileName) { 
            if (window.GlassToast) window.GlassToast.show('error', 'Error', "Assign an image first.");
            btn.disabled = false; 
            btn.innerHTML = originalText; 
            return; 
        }

        try {
            await this.assetManager.flipAsset(panelSelector, fileName, direction);
            const iframe = document.getElementById('pagePreviewFrame');
            if (iframe?.contentWindow) {
                iframe.addEventListener('load', () => {
                    if (window.GlassToast) window.GlassToast.show('success', 'Success', `Image flipped ${direction} successfully.`);
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                }, { once: true });
                iframe.contentWindow.location.reload();
            } else {
                if (window.GlassToast) window.GlassToast.show('success', 'Success', `Image flipped ${direction} successfully.`);
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        } catch (err) { 
            if (window.GlassToast) window.GlassToast.show('error', 'Error', err.message);
            btn.disabled = false; 
            btn.innerHTML = originalText; 
        }
    }

    async handleAiScan(panelSelector) {
        const btn = document.getElementById('visual-ai-analyze-btn');
        btn.disabled = true;
        btn.innerHTML = '<ion-icon name="save-outline"></ion-icon> <span>Saving...</span>';
        try {
            await this.handleSave(panelSelector);
            btn.innerHTML = '<ion-icon name="sync-outline" class="spin"></ion-icon> <span>Analyzing...</span>';
            const scope = { seriesId: this.activeSeriesId, volume: this.currentVisualContext.volume, chapter: this.currentVisualContext.chapter, pageId: this.currentVisualContext.pageId, panelId: panelSelector };
            const res = await fetch('/api/vision/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force: true, scope }) });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.message || "AI Scan failed");
            }
        } catch (err) { 
            const msg = err.message ? err.message.toLowerCase() : "";
            if (msg.includes('apikey') || msg.includes('api key') || msg.includes('expired')) {
                if (window.GlassToast) {
                    window.GlassToast.show('error', 'API Key Required', 'Please add your APIKey in the AI settings of the application.');
                } else {
                    alert("Please add your APIKey in the AI settings of the application.");
                }
            } else {
                if (window.GlassToast) {
                    window.GlassToast.show('error', 'Scan Failed', err.message);
                } else {
                    alert(err.message); 
                }
            }
            this.resetAiButtonState(); 
        }
    }

    async handleSave(panelSelector) {
        const getVal = (id) => document.getElementById(id)?.value;
        const idx = this.currentVisualMediaData.findIndex(m => m.panel === panelSelector);
        const entry = idx !== -1 ? this.currentVisualMediaData[idx] : { panel: panelSelector, type: 'image' };

        const updated = {
            ...entry,
            fileName: getVal('visual-asset-name'),
            description: getVal('visual-asset-description'),
            alt: getVal('visual-asset-description'),
            overlayImage: getVal('visual-overlay-name'),
            overlayOpacity: parseFloat(getVal('visual-overlay-opacity')) || 1.0
        };

        const style = { ...entry.style };
        if (entry.isFloating) {
            style.position = 'absolute';
            style.left = getVal('float-left') + '%';
            style.top = getVal('float-top') + '%';
            style.width = getVal('float-width') + '%';
            const h = getVal('float-height');
            style.height = (h.includes('%') || h === 'auto') ? h : (parseFloat(h) ? h + '%' : 'auto');
            const aspect = getVal('float-aspect');
            if (aspect && aspect !== 'none') style['aspect-ratio'] = aspect; else delete style['aspect-ratio'];
            style['z-index'] = getVal('float-z');
        }

        const alignVal = getVal('visual-portrait-style-object-position');
        if (alignVal === 'custom') {
            const pos = `${getVal('pt-x-slider')}% ${getVal('pt-y-slider')}%`;
            style.objectPosition = pos; style.transformOrigin = pos; style.objectFit = 'cover';
        } else {
            style.objectFit = alignVal === 'contain' ? 'contain' : 'cover';
            if (alignVal !== 'contain' && alignVal !== 'cover') { style.objectPosition = alignVal; style.transformOrigin = alignVal; }
            else { delete style.objectPosition; delete style.transformOrigin; }
        }

        const scale = getVal('visual-pt-scale'); 
        if (parseFloat(scale) !== 1) style.transform = `scale(${parseFloat(scale).toFixed(2)})`; else delete style.transform;

        updated.style = style; 
        if (updated.portraitStyle) delete updated.portraitStyle;
        if (updated.landscapeStyle) delete updated.landscapeStyle;
        if (idx !== -1) this.currentVisualMediaData[idx] = updated; else this.currentVisualMediaData.push(updated);

        const btn = document.getElementById('saveVisualMediaBtn');
        btn.disabled = true; btn.textContent = "Saving...";
        try {
            if ((await this.assetManager.saveMedia()).ok) {
                btn.textContent = "Saved!";
                if (window.GlassToast) window.GlassToast.show('success', 'Saved', 'Panel media saved successfully.');
                setTimeout(() => { btn.disabled = false; btn.textContent = "Save Panel Asset"; }, 2000);
                pushMediaPersisted(document.getElementById('pagePreviewFrame'), panelSelector, updated, this.currentVisualContext.pageId);
            }
        } catch (err) { 
            if (window.GlassToast) window.GlassToast.show('error', 'Save Failed', err.message);
            btn.disabled = false; btn.textContent = "Retry Save"; 
        }
    }

    async handleDeletePanel(panelSelector) {
        const confirmed = await this.showGlassConfirm('Delete Panel', `Are you sure you want to delete floating panel ${panelSelector}?`);
        if (!confirmed) return;
        try {
            if (await this.assetManager.deletePanel(panelSelector)) {
                const iframe = document.getElementById('pagePreviewFrame');
                if (iframe?.contentWindow) {
                    iframe.addEventListener('load', () => {
                        this.loadPanel({ panel: null, ...this.currentVisualContext }, this.activeSeriesId);
                        if (window.GlassToast) window.GlassToast.show('success', 'Deleted', `Panel ${panelSelector} removed.`);
                    }, { once: true });
                    iframe.contentWindow.location.reload();
                } else {
                    this.loadPanel({ panel: null, ...this.currentVisualContext }, this.activeSeriesId);
                }
            }
        } catch (err) { 
            if (window.GlassToast) window.GlassToast.show('error', 'Error', err.message);
        }
    }

    showDialogueProperties(item, propertiesManager, onSaveCallback, onDeleteCallback) {
        const toolsPane = document.querySelector('.layout-editor .tools-pane');
        this.selectedPanelSelector = null;
        renderDialogueProperties(toolsPane, item, propertiesManager, this.getActiveSceneData, this.currentVisualMediaData, this.currentVisualContext, onSaveCallback, onDeleteCallback, () => this.loadPanel({ panel: null }, this.activeSeriesId));
    }

    updatePosition(data) {
        const { panel, left, top } = data;
        const idx = this.currentVisualMediaData.findIndex(m => m.panel === panel);
        if (idx !== -1) {
            const entry = this.currentVisualMediaData[idx];
            if (!entry.style) entry.style = {};
            entry.style.left = left + '%'; entry.style.top = top + '%';
            if (this.selectedPanelSelector === panel) {
                if (document.getElementById('float-left')) document.getElementById('float-left').value = left;
                if (document.getElementById('float-top')) document.getElementById('float-top').value = top;
            }
        }
    }

    updateCache(panel, type, fileName) {
        const normalizePanel = (p) => p ? p.replace(/^\./, '') : '';
        const normalizedPanel = normalizePanel(panel);
        const idx = this.currentVisualMediaData.findIndex(m => normalizePanel(m.panel) === normalizedPanel);
        if (idx !== -1) {
            this.currentVisualMediaData[idx] = { ...this.currentVisualMediaData[idx], type, fileName };
        } else {
            this.currentVisualMediaData.push({ panel, type, fileName });
        }

        if (normalizePanel(this.selectedPanelSelector) === normalizedPanel) {
            const iframe = document.getElementById('pagePreviewFrame');
            const panelNames = (iframe && iframe.contentWindow?.GEMINI_PANELS) ? iframe.contentWindow.GEMINI_PANELS : [];
            this.render(panelNames);
        } else if (!this.selectedPanelSelector) {
            const iframe = document.getElementById('pagePreviewFrame');
            const panelNames = (iframe && iframe.contentWindow?.GEMINI_PANELS) ? iframe.contentWindow.GEMINI_PANELS : [];
            this.renderDirectory(panelNames);
        }
    }

    // --- Custom UI Overlays ---

    _createGlassOverlay(innerHTML, onSetup) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'glass-modal-backdrop';
            overlay.innerHTML = innerHTML;
            document.body.appendChild(overlay);

            requestAnimationFrame(() => {
                overlay.classList.add('is-open');
            });
            
            const cleanup = (val) => {
                overlay.classList.remove('is-open');
                overlay.addEventListener('transitionend', (e) => {
                    if (e.target === overlay && overlay.parentNode) {
                        document.body.removeChild(overlay);
                        resolve(val);
                    }
                });
            };

            onSetup(overlay, cleanup);
        });
    }

    showGlassPrompt(title, defaultValue = '') {
        const html = `
            <div class="glass-modal glass-modal--sm">
                <div class="glass-modal__header">
                    <h3 class="margin-0">${title}</h3>
                </div>
                <div class="glass-modal__body">
                    <input type="text" class="glass-input w-full" value="${defaultValue}" />
                </div>
                <div class="glass-modal__footer justify-end">
                    <button class="glass glass-btn" id="gp-cancel">Cancel</button>
                    <button class="glass glass-btn glass-btn--primary" id="gp-ok">OK</button>
                </div>
            </div>
        `;
        return this._createGlassOverlay(html, (overlay, cleanup) => {
            const input = overlay.querySelector('input');
            input.focus();
            
            overlay.querySelector('#gp-cancel').onclick = () => cleanup(null);
            overlay.querySelector('#gp-ok').onclick = () => cleanup(input.value);
            input.onkeydown = (e) => {
                if (e.key === 'Enter') cleanup(input.value);
                if (e.key === 'Escape') cleanup(null);
            };
        });
    }

    showGlassConfirm(title, message) {
        const html = `
            <div class="glass-modal glass-modal--sm">
                <div class="glass-modal__header">
                    <h3 class="margin-0">${title}</h3>
                </div>
                <div class="glass-modal__body">
                    <p class="margin-0 text-muted">${message}</p>
                </div>
                <div class="glass-modal__footer justify-end">
                    <button class="glass glass-btn" id="gc-cancel">Cancel</button>
                    <button class="glass glass-btn glass-btn--primary" id="gc-ok">Confirm</button>
                </div>
            </div>
        `;
        return this._createGlassOverlay(html, (overlay, cleanup) => {
            overlay.querySelector('#gc-cancel').onclick = () => cleanup(false);
            overlay.querySelector('#gc-ok').onclick = () => cleanup(true);
        });
    }
}
