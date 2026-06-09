// views/dashboard/components/SceneEditor/VisualEditorManager.js
import { fetchMedia } from '../../studio/api/StudioClient.js';
import { openFileBrowser } from '../FileBrowser/FileBrowser.js';
import { renderPanelSettings, renderAllPanelsTemplate } from './VisualEditorUI.js';
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

        if (this.selectedPanelSelector === data.panelId || this.selectedPanelSelector === '.' + data.panelId) {
            const descInput = document.getElementById('visual-asset-description');
            if (descInput) {
                descInput.value = data.description;
                descInput.style.borderColor = '#00ccff';
                setTimeout(() => descInput.style.borderColor = '#333', 1500);
            }
            this.resetAiButtonState();
        }
    }

    handleAiError(data) {
        if (!this.isCurrentContext(data)) return;
        if (this.selectedPanelSelector === data.panelId || this.selectedPanelSelector === '.' + data.panelId) {
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
            aiBtn.innerHTML = '<ion-icon name="sparkles-outline"></ion-icon> <span>AI Analyze Image</span>';
        }
    }

    async loadPanel(data, seriesId, propertiesManager = null) {
        if (propertiesManager) {
             const scenePropsPane = document.querySelector('.scene-props-pane');
             if (scenePropsPane) {
                 propertiesManager.container = scenePropsPane;
                 propertiesManager.form = scenePropsPane.querySelector('#sceneItemForm');
             }
        }

        const { panel, volume, chapter, pageId } = data;
        this.currentVisualContext = { volume, chapter, pageId };
        this.selectedPanelSelector = panel;
        this.activeSeriesId = seriesId;

        // Update Asset Manager Context
        this.assetManager.setContext(this.currentVisualContext, seriesId);

        const iframe = document.getElementById('pagePreviewFrame');
        let panelNames = (iframe && iframe.contentWindow?.GEMINI_PANELS) ? iframe.contentWindow.GEMINI_PANELS : [];

        const res = await fetchMedia(volume, chapter, pageId, seriesId);
        this.currentVisualMediaData = Array.isArray(res) ? res : (res.media || []);
        this.isSpread = !!res.isSpread;

        // Sync media data to asset manager
        this.assetManager.setMediaData(this.currentVisualMediaData);

        const container = document.querySelector('.layout-editor .tools-pane');
        if (container) container.removeAttribute('style');

        if (!panel) {
            this.renderAllPanels(panelNames);
            return;
        }

        container.innerHTML = `<h4 style="margin-top:0;">Panel Settings</h4><div id="visualEditorContainer">Loading...</div>`;
        this.render(panel);
    }

    renderAllPanels(panelNames = []) {
        const toolsPane = document.querySelector('.layout-editor .tools-pane');
        toolsPane.innerHTML = renderAllPanelsTemplate(
            panelNames, 
            this.currentVisualMediaData, 
            this.activeSeriesFolder, 
            this.activeSeriesId, 
            this.currentVisualContext,
            this.isSpread
        );

        // Bind Actions
        const addBtn = document.getElementById('addFloatingPanelBtn');
        if (addBtn) addBtn.onclick = async () => {
            try {
                const panelSelector = await this.assetManager.createFloatingPanel();
                document.getElementById('pagePreviewFrame').contentWindow.location.reload();
                this.loadPanel({ ...this.currentVisualContext, panel: panelSelector }, this.activeSeriesId);
            } catch (err) { alert(err.message); }
        };

        toolsPane.querySelectorAll('.geometry-item').forEach(item => {
            item.onclick = (e) => {
                if (e.target.closest('.delete-geom-btn')) return;
                const panel = item.dataset.panel;
                this.loadPanel({ ...this.currentVisualContext, panel }, this.activeSeriesId);
                pushPanelSelect(document.getElementById('pagePreviewFrame'), panel, this.currentVisualContext.pageId);
            };

            const delBtn = item.querySelector('.delete-geom-btn');
            if (delBtn) delBtn.onclick = (e) => {
                e.stopPropagation();
                this.handleDeletePanel(item.dataset.panel);
            };
        });

        // Spread Toggle
        const spreadToggle = document.getElementById('toggleSpreadMode');
        if (spreadToggle) {
            spreadToggle.onchange = async (e) => {
                const enabled = e.target.checked;
                spreadToggle.disabled = true;
                try {
                    await fetch('/api/editor/toggle-spread', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            volumeId: this.currentVisualContext.volumeId || '', 
                            chapterId: this.currentVisualContext.chapter,
                            pageId: this.currentVisualContext.pageId,
                            enabled
                        })
                    });
                    const iframe = document.getElementById('pagePreviewFrame');
                    if (iframe) {
                        const layoutEditor = document.querySelector('.layout-editor');
                        if (layoutEditor) layoutEditor.classList.toggle('is-spread', enabled);
                        
                        // Add cache-busting timestamp to prevent layout loading glitches
                        const currentUrl = new URL(iframe.contentWindow.location.href);
                        currentUrl.searchParams.set('t', Date.now());
                        iframe.src = currentUrl.toString();
                    }
                } catch (err) {
                    alert("Failed to toggle spread mode.");
                    spreadToggle.checked = !enabled;
                } finally { spreadToggle.disabled = false; }
            };
        }
    }

    render(panelSelector) {
        const container = document.getElementById('visualEditorContainer');
        if (!container) return;

        let entry = this.currentVisualMediaData.find(m => m.panel === panelSelector) || { panel: panelSelector, type: 'image', fileName: '' };

        const parsePos = (posStr) => {
            if (!posStr || ['center', 'top center', 'bottom center', 'left center', 'right center'].includes(posStr)) {
                const map = { 'top center': { x: 50, y: 0 }, 'bottom center': { x: 50, y: 100 }, 'left center': { x: 0, y: 50 }, 'right center': { x: 100, y: 50 } };
                return map[posStr] || { x: 50, y: 50 };
            }
            const parts = posStr.split(' ');
            return { x: parseFloat(parts[0]) || 50, y: parseFloat(parts[1]) || 50 };
        };

        const parseScale = (trans) => (trans?.match(/scale\(([^)]+)\)/)?.[1] || 1);
        const isPtCustom = entry.portraitStyle?.objectPosition && !['center', 'top center', 'bottom center', 'left center', 'right center'].includes(entry.portraitStyle.objectPosition);
        const getNum = (val) => (typeof val === 'number' ? val : parseFloat(val) || 0);

        container.innerHTML = renderPanelSettings(panelSelector, entry, false, isPtCustom, {x:50,y:50}, parsePos(entry.portraitStyle?.objectPosition), 1, parseScale(entry.portraitStyle?.transform), getNum);

        this.bindEvents(entry, panelSelector);
    }

    bindEvents(entry, panelSelector) {
        const getEl = (id) => document.getElementById(id);
        const iframe = getEl('pagePreviewFrame');

        getEl('backToDirectoryBtn').onclick = () => this.loadPanel({ ...this.currentVisualContext, panel: null }, this.activeSeriesId);

        const sync = () => syncPreviewLive(iframe, panelSelector, 'portrait', this.currentVisualMediaData, this.currentVisualContext.pageId);
        
        ['visual-portrait-style-object-position', 'visual-asset-name', 'visual-overlay-name'].forEach(id => {
            const el = getEl(id);
            if (el) el.oninput = el.onchange = () => {
                if (id.includes('position')) getEl('pt-pan-wrapper').style.display = el.value === 'custom' ? 'block' : 'none';
                sync();
            };
        });

        ['visual-pt-scale', 'pt-x-slider', 'pt-y-slider', 
         'float-left', 'float-top', 'float-width', 'float-height', 'float-z', 'float-aspect', 'visual-overlay-opacity'].forEach(id => {
            if (getEl(id)) getEl(id).oninput = sync;
        });

        const assetBrowse = getEl('visual-asset-browse');
        if (assetBrowse) assetBrowse.onclick = () => openFileBrowser('image', this.currentVisualContext.volume, this.currentVisualContext.chapter, this.currentVisualContext.pageId, (f) => { getEl('visual-asset-name').value = f; sync(); }, 'page', this.activeSeriesId, this.getActiveAssets());
        
        const overlayBrowse = getEl('visual-overlay-browse');
        if (overlayBrowse) overlayBrowse.onclick = () => openFileBrowser('image', this.currentVisualContext.volume, this.currentVisualContext.chapter, this.currentVisualContext.pageId, (f) => { getEl('visual-overlay-name').value = f; sync(); }, 'page', this.activeSeriesId, this.getActiveAssets());

        document.querySelectorAll('.panel-editor-ui .btn-nudge').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                const el = getEl(btn.dataset.target.includes('scale') ? 'visual-' + btn.dataset.target : btn.dataset.target + '-slider');
                if (el) {
                    let val = parseFloat(el.value) + parseFloat(btn.dataset.dir);
                    val = btn.dataset.target.includes('scale') ? Math.max(1, val).toFixed(1) : Math.min(120, Math.max(-20, Math.round(val)));
                    el.value = val; sync();
                }
            };
        });

        getEl('saveVisualMediaBtn').onclick = () => this.handleSave(panelSelector);
        if (getEl('deleteFloatingPanelBtn')) getEl('deleteFloatingPanelBtn').onclick = () => this.handleDeletePanel(panelSelector);
        if (getEl('visual-ai-analyze-btn')) getEl('visual-ai-analyze-btn').onclick = () => this.handleAiScan(panelSelector);

        const flipH = getEl('visual-flip-h');
        const flipV = getEl('visual-flip-v');
        if (flipH) flipH.onclick = () => this.handleFlip(panelSelector, 'horizontal');
        if (flipV) flipV.onclick = () => this.handleFlip(panelSelector, 'vertical');
    }

    async handleFlip(panelSelector, direction) {
        const fileName = document.getElementById('visual-asset-name')?.value;
        if (!fileName) return alert("No image file specified to flip.");
        const btn = document.getElementById(`visual-flip-${direction === 'horizontal' ? 'h' : 'v'}`);
        const originalText = btn.innerHTML;
        btn.disabled = true; btn.innerText = 'Flipping...';
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
        if (idx !== -1) this.currentVisualMediaData[idx] = { ...this.currentVisualMediaData[idx], type, fileName };
        else this.currentVisualMediaData.push({ panel, type, fileName });
        if (this.selectedPanelSelector === panel) this.render(panel);
        else if (!this.selectedPanelSelector) {
            const iframe = document.getElementById('pagePreviewFrame');
            let panelNames = (iframe && iframe.contentWindow?.GEMINI_PANELS) ? iframe.contentWindow.GEMINI_PANELS : [];
            this.renderAllPanels(panelNames);
        }
    }
}
