// views/dashboard/components/SceneEditor/VisualEditorManager.js
import { saveMediaAPI, fetchMedia, fetchNextPanelId } from '../../studio/api/StudioClient.js';
import { openFileBrowser } from '../FileBrowser/FileBrowser.js';
import { extractPalette } from '/libs/Utility.js';
import { renderPanelSettings } from './VisualEditorUI.js';
import { pushSceneUpdate, pushPanelSelect, pushMediaPersisted, syncPreviewLive } from './VisualEditorSync.js';

export class VisualEditorManager {
    constructor(container, getActiveAssets, activeSeriesId, activeSeriesFolder, getActiveSceneData) {
        this.container = container;
        this.getActiveAssets = getActiveAssets;
        this.activeSeriesId = activeSeriesId;
        this.activeSeriesFolder = activeSeriesFolder;
        this.getActiveSceneData = getActiveSceneData; 
        this.currentVisualMediaData = [];
        this.currentVisualContext = {};
        this.selectedPanelSelector = null;
        this.activeMode = 'landscape';
        this.activeDialogueId = null;

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
            if (e.data.type === 'assetUploaded') {
                const { panel, type, fileName } = e.data;
                this.updateCache(panel, type, fileName);
            }
            if (e.data.type === 'panelDragged') {
                this.updatePosition(e.data);
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

        const iframe = document.getElementById('pagePreviewFrame');
        let panelNames = (iframe && iframe.contentWindow?.GEMINI_PANELS) ? iframe.contentWindow.GEMINI_PANELS : [];

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

    renderAllPanels(panelNames = []) {
        const toolsPane = document.querySelector('.layout-editor .tools-pane');
        const allUniqueSelectors = new Set([...panelNames, ...this.currentVisualMediaData.map(m => m.panel)]);
        const allItems = Array.from(allUniqueSelectors).map(p => {
            const entry = this.currentVisualMediaData.find(m => m.panel === p);
            return { panel: p, isFloating: entry?.isFloating || false, fileName: entry?.fileName || '', type: entry?.type || 'image' };
        }).sort((a, b) => a.isFloating !== b.isFloating ? (a.isFloating ? 1 : -1) : a.panel.localeCompare(b.panel));

        toolsPane.innerHTML = `
            <div class="flex-row justify-between align-center margin-b-15">
                <h4 class="margin-0">Page Panels</h4>
                <button id="addFloatingPanelBtn" class="small btn-accent">+ Add Floating</button>
            </div>
            <div class="panel-editor-ui">
                <p class="text-muted margin-b-15">Select any element to edit its asset and alignment.</p>
                <div class="geometry-list margin-b-20"></div>
            </div>
        `;

        document.getElementById('addFloatingPanelBtn').onclick = () => this.createFloatingPanel();
        const geoList = toolsPane.querySelector('.geometry-list');

        allItems.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = `geometry-item ${item.isFloating ? 'bg-black-20 border-accent' : 'bg-black-10 border-dim'} padding-10 border-radius-8 margin-b-10 flex-row align-center cursor-pointer hover-bright`;
            
            const series = this.activeSeriesFolder || this.activeSeriesId;
            const { volume, chapter, pageId } = this.currentVisualContext;
            const thumbSrc = item.fileName ? `/api/images/${series}/${volume}/${chapter}/${pageId}/assets/${item.fileName}` : null;

            itemDiv.innerHTML = `
                <div class="flex-row align-center gap-10 flex-1">
                    <div class="geometry-thumb border-dim border-radius-4" style="width:40px; height:40px; background:#000; display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0;">
                        ${thumbSrc ? `<img src="${thumbSrc}" style="width:100%; height:100%; object-fit:cover;">` : `<ion-icon name="image-outline" class="text-muted"></ion-icon>`}
                    </div>
                    <div style="min-width:0;">
                        <div class="text-accent font-weight-bold font-size-09 flex-row align-center gap-5">
                            ${item.panel.replace('.', '')} ${item.isFloating ? `<span class="text-muted font-size-06 uppercase border-dim padding-x-5 border-radius-4">Floating</span>` : ''}
                        </div>
                        <div class="text-muted font-size-07 truncate">${item.fileName || 'No asset assigned'}</div>
                    </div>
                </div>
                ${item.isFloating ? `<button class="small btn-danger-outline delete-geom-btn margin-l-10" title="Delete Geometry"><ion-icon name="trash-outline"></ion-icon></button>` : ''}
            `;

            itemDiv.onclick = (e) => {
                if (e.target.closest('.delete-geom-btn')) return;
                this.loadPanel({ ...this.currentVisualContext, panel: item.panel }, this.activeSeriesId);
                pushPanelSelect(document.getElementById('pagePreviewFrame'), item.panel);
            };

            if (item.isFloating) {
                itemDiv.querySelector('.delete-geom-btn').onclick = (e) => {
                    e.stopPropagation();
                    this.handleDeletePanel(item.panel);
                };
            }
            geoList.appendChild(itemDiv);
        });
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
        const isLsCustom = entry.style?.objectPosition && !['center', 'top center', 'bottom center', 'left center', 'right center'].includes(entry.style.objectPosition);
        const isPtCustom = entry.portraitStyle?.objectPosition && !['center', 'top center', 'bottom center', 'left center', 'right center'].includes(entry.portraitStyle.objectPosition);
        const getNum = (val) => (typeof val === 'number' ? val : parseFloat(val) || 0);

        container.innerHTML = renderPanelSettings(panelSelector, entry, isLsCustom, isPtCustom, parsePos(entry.style?.objectPosition), parsePos(entry.portraitStyle?.objectPosition), parseScale(entry.style?.transform), parseScale(entry.portraitStyle?.transform), getNum);

        this.bindEvents(entry, panelSelector);
    }

    bindEvents(entry, panelSelector) {
        const getEl = (id) => document.getElementById(id);
        const iframe = getEl('pagePreviewFrame');

        getEl('backToDirectoryBtn').onclick = () => this.loadPanel({ ...this.currentVisualContext, panel: null }, this.activeSeriesId);

        document.querySelectorAll('.mode-tab-btn').forEach(btn => {
            btn.onclick = () => {
                const mode = btn.dataset.mode;
                this.activeMode = mode;
                document.querySelectorAll('.mode-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
                getEl('landscape-controls').style.display = mode === 'landscape' ? 'block' : 'none';
                getEl('portrait-controls').style.display = mode === 'portrait' ? 'block' : 'none';
            };
        });

        const sync = () => syncPreviewLive(iframe, panelSelector, this.activeMode, this.currentVisualMediaData);
        
        ['visual-style-object-position', 'visual-portrait-style-object-position', 'visual-asset-name'].forEach(id => {
            const el = getEl(id);
            if (el) el.oninput = el.onchange = () => {
                if (id.includes('position')) {
                    getEl(id.includes('portrait') ? 'pt-pan-wrapper' : 'ls-pan-wrapper').style.display = el.value === 'custom' ? 'block' : 'none';
                }
                sync();
            };
        });

        ['visual-ls-scale', 'ls-x-slider', 'ls-y-slider', 'visual-pt-scale', 'pt-x-slider', 'pt-y-slider', 'float-left', 'float-top', 'float-width', 'float-height', 'float-z'].forEach(id => {
            if (getEl(id)) getEl(id).oninput = sync;
        });

        getEl('visual-asset-browse').onclick = () => openFileBrowser('image', this.currentVisualContext.volume, this.currentVisualContext.chapter, this.currentVisualContext.pageId, (f) => { getEl('visual-asset-name').value = f; sync(); }, 'page', this.activeSeriesId, this.getActiveAssets());
        getEl('visual-overlay-browse').onclick = () => openFileBrowser('image', this.currentVisualContext.volume, this.currentVisualContext.chapter, this.currentVisualContext.pageId, (f) => { getEl('visual-overlay-name').value = f; sync(); }, 'page', this.activeSeriesId, this.getActiveAssets());

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
            if (!(await res.json()).ok) throw new Error("AI Scan failed");
        } catch (err) {
            alert(err.message);
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

        const style = { ...entry.style, position: entry.isFloating ? 'absolute' : entry.style?.position };
        const ptStyle = { ...entry.portraitStyle };

        if (entry.isFloating) {
            style.left = getVal('float-left') + '%';
            style.top = getVal('float-top') + '%';
            style.width = getVal('float-width') + '%';
            const h = getVal('float-height');
            style.height = (h.includes('%') || h === 'auto') ? h : (parseFloat(h) ? h + '%' : 'auto');
            const aspect = getVal('float-aspect');
            if (aspect && aspect !== 'none') style['aspect-ratio'] = aspect; else delete style['aspect-ratio'];
            style['z-index'] = getVal('float-z');
        }

        const applyAlign = (id, target) => {
            const val = getVal(id);
            if (val === 'custom') {
                const pos = `${getVal(id.includes('portrait') ? 'pt-x-slider' : 'ls-x-slider')}% ${getVal(id.includes('portrait') ? 'pt-y-slider' : 'ls-y-slider')}%`;
                target.objectPosition = pos; target.transformOrigin = pos; target.objectFit = 'cover';
            } else {
                target.objectFit = val === 'contain' ? 'contain' : 'cover';
                if (val !== 'contain' && val !== 'cover') { target.objectPosition = val; target.transformOrigin = val; }
                else { delete target.objectPosition; delete target.transformOrigin; }
            }
        };
        applyAlign('visual-style-object-position', style);
        applyAlign('visual-portrait-style-object-position', ptStyle);

        const lsS = getVal('visual-ls-scale'); if (parseFloat(lsS) !== 1) style.transform = `scale(${parseFloat(lsS).toFixed(2)})`; else delete style.transform;
        const ptS = getVal('visual-pt-scale'); if (parseFloat(ptS) !== 1) ptStyle.transform = `scale(${parseFloat(ptS).toFixed(2)})`; else delete ptStyle.transform;

        updated.style = style; updated.portraitStyle = ptStyle;
        if (idx !== -1) this.currentVisualMediaData[idx] = updated; else this.currentVisualMediaData.push(updated);

        const btn = document.getElementById('saveVisualMediaBtn');
        btn.disabled = true; btn.textContent = "Saving...";
        try {
            const res = await saveMediaAPI(this.currentVisualContext.volume, this.currentVisualContext.chapter, this.currentVisualContext.pageId, this.currentVisualMediaData, this.activeSeriesId);
            if (res.ok) {
                btn.textContent = "Saved!";
                setTimeout(() => { btn.disabled = false; btn.textContent = "Save Panel Asset"; }, 2000);
                pushMediaPersisted(document.getElementById('pagePreviewFrame'), panelSelector, updated);
            } else throw new Error(res.message);
        } catch (err) { alert(err.message); btn.disabled = false; btn.textContent = "Retry Save"; }
    }

    async handleDeletePanel(panelSelector) {
        if (!confirm(`Delete floating panel ${panelSelector}?`)) return;
        const idx = this.currentVisualMediaData.findIndex(m => m.panel === panelSelector);
        if (idx === -1) return;
        this.currentVisualMediaData.splice(idx, 1);
        try {
            if ((await saveMediaAPI(this.currentVisualContext.volume, this.currentVisualContext.chapter, this.currentVisualContext.pageId, this.currentVisualMediaData, this.activeSeriesId)).ok) {
                document.getElementById('pagePreviewFrame').contentWindow.location.reload();
                this.loadPanel({ panel: null, ...this.currentVisualContext }, this.activeSeriesId);
            }
        } catch (err) { alert(err.message); }
    }

    showDialogueProperties(item, propertiesManager, onSaveCallback) {
        const toolsPane = document.querySelector('.layout-editor .tools-pane');
        toolsPane.innerHTML = '';
        Object.assign(toolsPane.style, { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', boxSizing: 'border-box' });
        this.selectedPanelSelector = null;

        const header = document.createElement('div');
        header.className = 'flex-row justify-between align-center margin-b-15 padding-x-10';
        header.innerHTML = `<h4>Dialogue Properties</h4><button class="small">&larr; Layout Tools</button>`;
        header.querySelector('button').onclick = () => this.loadPanel({ panel: null }, this.activeSeriesId);
        toolsPane.appendChild(header);

        const scroll = document.createElement('div');
        Object.assign(scroll.style, { overflowY: 'auto', padding: '0 10px', flex: '1' });
        toolsPane.appendChild(scroll);

        const originalForm = document.getElementById('sceneItemEditor');
        if (originalForm) {
            const clone = originalForm.cloneNode(true);
            clone.id = 'visual-dialogue-editor';
            clone.classList.remove('hidden');
            scroll.appendChild(clone);
            
            propertiesManager.container = scroll;
            propertiesManager.form = clone.querySelector('#sceneItemForm');
            
            const originalOnUpdate = propertiesManager.onUpdate;
            propertiesManager.onUpdate = () => {
                propertiesManager.updateItem(item);
                pushSceneUpdate(document.getElementById('pagePreviewFrame'), this.getActiveSceneData(), this.currentVisualMediaData);
            };

            propertiesManager.populate(item);
            clone.querySelectorAll('input, select, textarea').forEach(i => i.addEventListener('input', () => propertiesManager.onUpdate()));

            const footer = document.createElement('div');
            footer.className = 'tools-footer-sticky margin-t-20';
            footer.style.padding = '10px';
            footer.innerHTML = `<button class="update__btn w-full">Save Dialogue Changes</button>`;
            footer.querySelector('button').onclick = async (e) => {
                const b = e.target; b.disabled = true; b.textContent = 'Saving...';
                propertiesManager.updateItem(item);
                await onSaveCallback();
                b.textContent = 'Saved!';
                setTimeout(() => { b.textContent = 'Save Dialogue Changes'; b.disabled = false; }, 2000);
            };
            scroll.appendChild(footer);
        }
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
    }

    async createFloatingPanel() {
        const { volume, chapter, pageId } = this.currentVisualContext;
        const mode = document.querySelector('.layout-editor .preview-pane-flex').classList.contains('portrait-mode') ? 'portrait' : 'landscape';
        const nextId = await fetchNextPanelId(this.activeSeriesId, volume, chapter, pageId, mode);
        if (!nextId) return;

        const panelSelector = `.panel-${nextId}`;
        this.currentVisualMediaData.push({ panel: panelSelector, isFloating: true, type: 'image', fileName: '', style: { position: 'absolute', top: '10%', left: '10%', width: '30%', height: 'auto', 'aspect-ratio': '1 / 1', 'z-index': '10' } });
        await saveMediaAPI(volume, chapter, pageId, this.currentVisualMediaData, this.activeSeriesId);
        document.getElementById('pagePreviewFrame').contentWindow.location.reload();
        this.loadPanel({ ...this.currentVisualContext, panel: panelSelector }, this.activeSeriesId);
    }
}
