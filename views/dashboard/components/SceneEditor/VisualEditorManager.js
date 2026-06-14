// views/dashboard/components/SceneEditor/VisualEditorManager.js
import { fetchMedia } from '../../studio/api/StudioClient.js';
import { openFileBrowser } from '../FileBrowser/FileBrowser.js';
import { renderPanelSettings, renderAllPanelsTemplate, renderReadinessStepperTemplate } from './VisualEditorUI.js';
import { renderDialogueProperties } from './VisualEditorDialogueUI.js';
import { pushPanelSelect, syncPreviewLive, pushMediaPersisted } from './VisualEditorSync.js';
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
        } else {
            // Re-render directory to update AI step in stepper
            const iframe = document.getElementById('pagePreviewFrame');
            let panelNames = (iframe && iframe.contentWindow?.GEMINI_PANELS) ? iframe.contentWindow.GEMINI_PANELS : [];
            if (!this.selectedPanelSelector) this.renderDirectory(panelNames);
        }
    }

    handleAiError(data) {
        if (!this.isCurrentContext(data)) return;
        const cleanSelected = this.selectedPanelSelector ? this.selectedPanelSelector.replace('.', '') : null;
        const cleanIncoming = data.panelId ? data.panelId.replace('.', '') : null;

        if (cleanSelected === cleanIncoming) {
            alert("AI Analysis Failed: " + data.message);
            this.resetAiButtonState();
        }
    }

    isCurrentContext(data) {
        return this.currentVisualContext && 
               this.currentVisualContext.volume === data.volume &&
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

    renderReadinessStepper(panelNames) {
        const stats = {
            assets: { count: 0, total: panelNames.length, complete: false },
            ai: { count: 0, total: panelNames.length, complete: false },
            continuity: { hasScene: false, complete: false }
        };

        // 1. Assets Check
        panelNames.forEach(p => {
            const entry = this.currentVisualMediaData.find(m => m.panel === p);
            if (entry && entry.fileName) stats.assets.count++;
        });
        stats.assets.complete = stats.assets.count >= stats.assets.total && stats.assets.total > 0;

        // 2. AI Check
        panelNames.forEach(p => {
            const entry = this.currentVisualMediaData.find(m => m.panel === p);
            if (entry && entry.description && entry.description.trim().length > 10) stats.ai.count++;
        });
        stats.ai.complete = stats.ai.count >= stats.ai.total && stats.ai.total > 0;

        // 3. Continuity Check
        const sceneData = this.getActiveSceneData ? this.getActiveSceneData() : [];
        stats.continuity.hasScene = sceneData.length > 0;
        stats.continuity.complete = stats.continuity.hasScene && stats.assets.complete && stats.ai.complete;

        return renderReadinessStepperTemplate(stats);
    }

    renderDirectory(panelNames) {
        const stepperHtml = this.renderReadinessStepper(panelNames);
        const panelsHtml = renderAllPanelsTemplate(
            panelNames, 
            this.currentVisualMediaData, 
            this.activeSeriesFolder, 
            this.activeSeriesId, 
            this.currentVisualContext,
            this.isSpread
        );

        // Wrap both stepper and panel list in the scrollable UI container
        this.toolsPane.innerHTML = `
            <div class="panel-editor-ui">
                ${stepperHtml}
                ${panelsHtml}
            </div>
        `;
        this.bindDirectoryEvents();
    }

    get toolsPane() {
        return document.querySelector('.layout-editor .tools-pane');
    }

    renderPanelEditor(panelSelector) {
        const entry = this.currentVisualMediaData.find(m => m.panel === panelSelector) || { panel: panelSelector, type: 'image' };
        
        // Determine object-fit and position for display in UI
        const isLsCustom = !!(entry.landscapeStyle && entry.landscapeStyle.objectPosition && entry.landscapeStyle.objectPosition.includes('%'));
        const isPtCustom = !!(entry.portraitStyle && entry.portraitStyle.objectPosition && entry.portraitStyle.objectPosition.includes('%'));

        const getNum = (val) => {
            if (!val) return 50;
            const n = parseFloat(val.replace('%', ''));
            return isNaN(n) ? 50 : n;
        };

        const ptPos = { x: 50, y: 50 };
        if (isPtCustom) {
            const parts = entry.portraitStyle.objectPosition.split(' ');
            ptPos.x = getNum(parts[0]);
            ptPos.y = getNum(parts[1]);
        }

        const ptScale = entry.portraitStyle?.transform ? parseFloat(entry.portraitStyle.transform.match(/scale\((.*?)\)/)?.[1] || 1) : 1;

        this.toolsPane.innerHTML = renderPanelSettings(panelSelector, entry, isLsCustom, isPtCustom, {}, ptPos, 1, ptScale, getNum);
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
                const name = prompt("Floating Panel ID (e.g. .panel-FX):", ".panel-new");
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
                    } catch (err) {
                        alert("Failed to create floating panel: " + err.message);
                    }
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
        if (!fileName) { alert("Assign an image first."); btn.disabled = false; btn.innerHTML = originalText; return; }

        try {
            await this.assetManager.flipAsset(panelSelector, fileName, direction);
            const iframe = document.getElementById('pagePreviewFrame');
            if (iframe?.contentWindow) iframe.contentWindow.location.reload();
            alert(`Image flipped ${direction} successfully.`);
        } catch (err) { alert(err.message); } finally { btn.disabled = false; btn.innerHTML = originalText; }
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
            if (!res.ok) throw new Error("AI Scan failed");
        } catch (err) { alert(err.message); this.resetAiButtonState(); }
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
        updated.portraitStyle = JSON.parse(JSON.stringify(style));
        if (idx !== -1) this.currentVisualMediaData[idx] = updated; else this.currentVisualMediaData.push(updated);

        const btn = document.getElementById('saveVisualMediaBtn');
        btn.disabled = true; btn.textContent = "Saving...";
        try {
            if ((await this.assetManager.saveMedia()).ok) {
                btn.textContent = "Saved!";
                setTimeout(() => { btn.disabled = false; btn.textContent = "Save Panel Asset"; }, 2000);
                pushMediaPersisted(document.getElementById('pagePreviewFrame'), panelSelector, updated, this.currentVisualContext.pageId);
            }
        } catch (err) { alert(err.message); btn.disabled = false; btn.textContent = "Retry Save"; }
    }

    async handleDeletePanel(panelSelector) {
        if (!confirm(`Delete floating panel ${panelSelector}?`)) return;
        try {
            if (await this.assetManager.deletePanel(panelSelector)) {
                document.getElementById('pagePreviewFrame').contentWindow.location.reload();
                this.loadPanel({ panel: null, ...this.currentVisualContext }, this.activeSeriesId);
            }
        } catch (err) { alert(err.message); }
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
        const idx = this.currentVisualMediaData.findIndex(m => m.panel === panel);
        if (idx !== -1) {
            this.currentVisualMediaData[idx] = { ...this.currentVisualMediaData[idx], type, fileName };
        } else {
            this.currentVisualMediaData.push({ panel, type, fileName });
        }
        
        if (this.selectedPanelSelector === panel) {
            this.render(panel);
        } else if (!this.selectedPanelSelector) {
            const iframe = document.getElementById('pagePreviewFrame');
            let panelNames = (iframe && iframe.contentWindow?.GEMINI_PANELS) ? iframe.contentWindow.GEMINI_PANELS : [];
            this.renderDirectory(panelNames);
        }
    }
}
