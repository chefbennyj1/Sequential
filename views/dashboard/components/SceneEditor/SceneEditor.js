// views/dashboard/js/SceneEditor.js
/**
 * Sequential Comic Server - SceneEditor
 * Static-only version. Removed audio and video properties.
 */

import { fetchSceneData, saveSceneData, fetchPagePanels, fetchSeriesAPI, fetchCharactersAPI, saveMediaAPI, fetchAmbientMedia } from '../../studio/js/ApiService.js';
import { updateUrlState } from '../../studio/js/Navigation.js';
import { openFileBrowser } from '../FileBrowser/FileBrowser.js';

let currentSceneData = [];
let currentSceneInfo = {};
let selectedItemIndex = -1;
let dragSrcIndex = -1;
let availablePanels = [];
let availableCharacters = [];
let activeSeriesId = "No_Overflow"; 
let activeSeriesFolder = "No_Overflow";

let currentVisualMediaData = [];
let currentVisualContext = {};

export async function openSceneEditor(volume, chapter, pageId, mode = 'landscape') {
    updateUrlState({ tab: 'scene-editor', vol: volume, chap: chapter, page: pageId });
    document.querySelector('.sidebar')?.classList.remove('open');
    document.querySelectorAll('main.main-content .dashboard-section').forEach(s => s.classList.add('hidden'));

    const sceneEditor = document.querySelector('.scene-editor');
    if(sceneEditor) sceneEditor.classList.remove('hidden');

    currentSceneInfo = { volume, chapter, pageId };
    const titleEl = document.getElementById('sceneEditorPageTitle');
    if(titleEl) titleEl.textContent = `${volume} / ${chapter} / ${pageId} (${mode.toUpperCase()})`;

    try {
        const seriesList = await fetchSeriesAPI();
        const series = seriesList[0]; // Simplified for Sequential
        if (series) {
            activeSeriesId = series._id;
            activeSeriesFolder = series.folderName || "No_Overflow";
        }
    } catch (e) { console.error("Could not resolve series", e); }

    const [panelData, scene, characters, ambientData] = await Promise.all([
        fetchPagePanels(volume, chapter, pageId, mode, activeSeriesId),
        fetchSceneData(volume, chapter, pageId, activeSeriesId),
        activeSeriesId ? fetchCharactersAPI(activeSeriesId) : Promise.resolve([]),
        fetchAmbientMedia(volume, chapter, pageId, activeSeriesId)
    ]);
    availablePanels = panelData.panels || [];
    availableCharacters = characters || [];
    currentSceneData = scene || [];
    currentSceneData.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    
    if (ambientData.ok && ambientData.media && Array.isArray(ambientData.media.media)) {
        currentVisualMediaData = ambientData.media.media;
    } else {
        currentVisualMediaData = [];
    }

    selectedItemIndex = -1;
    setupCharacterInputUI();
    renderSceneTree();
    
    document.getElementById('sceneItemEditor').classList.add('hidden');
    document.getElementById('sceneItemPlaceholder').classList.remove('hidden');
}

function getActiveAssets() {
    const activeFiles = new Set();
    if (currentSceneData) {
        currentSceneData.forEach(item => {
            if (item.mediaAction && Array.isArray(item.mediaAction)) {
                item.mediaAction.forEach(action => {
                    if (action.fileName) activeFiles.add(action.fileName);
                });
            }
        });
    }
    if (currentVisualMediaData) {
        currentVisualMediaData.forEach(entry => {
            if (entry.fileName) activeFiles.add(entry.fileName);
        });
    }
    return Array.from(activeFiles);
}

function setupCharacterInputUI() {
    const container = document.querySelector('.prop-group-character');
    if (!container) return;
    
    container.innerHTML = `
        <label>Character</label>
        <div class="char-input-group">
            <div class="flex-1">
                <select id="prop-character-select" class="char-select-custom hidden">
                    <option value="">-- Select Character --</option>
                </select>
                <input type="text" id="prop-character" placeholder="Character Name" class="width-100">
            </div>
            <img id="prop-character-avatar" src="" class="char-avatar-small hidden">
        </div>
        <div class="toggle-input-link-wrapper">
            <a href="#" id="toggleCharInputMode" class="text-accent">Toggle Input Mode</a>
        </div>
    `;

    const select = document.getElementById('prop-character-select');
    const input = document.getElementById('prop-character');
    const avatar = document.getElementById('prop-character-avatar');
    const toggle = document.getElementById('toggleCharInputMode');

    if (availableCharacters.length > 0) {
        availableCharacters.forEach(char => {
            const opt = document.createElement('option');
            opt.value = char._id;
            opt.textContent = char.name;
            opt.dataset.image = char.image || '';
            select.appendChild(opt);
        });
        input.classList.add('hidden');
        select.classList.remove('hidden');
    } else {
        input.classList.remove('hidden');
        select.classList.add('hidden');
        toggle.classList.add('hidden');
    }

    toggle.onclick = (e) => {
        e.preventDefault();
        if (input.classList.contains('hidden')) {
            input.classList.remove('hidden');
            select.classList.add('hidden');
            avatar.classList.add('hidden');
            select.value = "";
        } else {
            input.classList.add('hidden');
            select.classList.remove('hidden');
            if (select.value) avatar.classList.remove('hidden');
        }
    };

    select.onchange = () => {
        const opt = select.options[select.selectedIndex];
        if (opt && opt.value) {
            const img = opt.dataset.image;
            if (img) {
                avatar.src = img;
                avatar.classList.remove('hidden');
            } else {
                avatar.classList.add('hidden');
            }
            updateSceneItemFromForm();
        } else {
            avatar.classList.add('hidden');
        }
    };
}

function renderSceneTree() {
    const list = document.getElementById('sceneTreeList');
    if (!list) return;
    list.innerHTML = '';
    currentSceneData.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = `scene-item ${index === selectedItemIndex ? 'selected' : ''}`;
        li.draggable = true;
        li.dataset.index = index;

        const type = item.displayType?.type || 'Unknown';
        const char = item.character || '';
        const previewText = item.text ? `"${item.text.substring(0, 30)}${item.text.length > 30 ? '...' : ''}"` : '';
        const shortId = item.id?.substring(0, 4) || '----';

        let avatarHtml = '';
        if (item.characterId && availableCharacters.length > 0) {
            const charObj = availableCharacters.find(c => c._id === item.characterId);
            if (charObj && charObj.image) {
                avatarHtml = `<img src="${charObj.image}" class="char-avatar-mini">`;
            }
        }

        li.innerHTML = `
            <div class="item-main">
                <div class="item-header">
                    <span class="item-type">${type}</span>
                    <div style="display:flex; align-items:center;">
                        ${avatarHtml}
                        ${char ? `<span class="item-char">${char}</span>` : ''}
                    </div>
                </div>
                ${previewText ? `<div class="item-text">${previewText}</div>` : ''}
            </div>
            <div class="item-meta" style="display:flex; align-items:center; gap:5px;">
                ID: ${shortId}
            </div>
        `;

        li.onclick = () => selectSceneItem(index);
        li.addEventListener('dragstart', e => { dragSrcIndex = index; e.dataTransfer.effectAllowed = 'move'; li.style.opacity = '0.4'; });
        li.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
        li.addEventListener('drop', handleDrop);
        li.addEventListener('dragend', () => { li.style.opacity = '1'; document.querySelectorAll('.scene-item').forEach(i => i.classList.remove('over')); });

        list.appendChild(li);
    });
}

function handleDrop(e) {
    e.stopPropagation();
    const dragDestIndex = Number(this.dataset.index);
    if (dragSrcIndex !== dragDestIndex) {
        const item = currentSceneData[dragSrcIndex];
        currentSceneData.splice(dragSrcIndex, 1);
        currentSceneData.splice(dragDestIndex, 0, item);
        currentSceneData.forEach((itm, i) => itm.displayOrder = i);
        selectedItemIndex = dragDestIndex;
        renderSceneTree();
    }
}

function selectSceneItem(index) {
    selectedItemIndex = index;
    renderSceneTree();
    document.getElementById('sceneItemEditor').classList.remove('hidden');
    document.getElementById('sceneItemPlaceholder').classList.add('hidden');
    populateFormWithItem(currentSceneData[index]);
}

function populateFormWithItem(item) {
    if (!item) return;
    
    document.getElementById('prop-id').value = item.id || '';
    
    let type = item.displayType?.type || 'SpeechBubble';
    if (type === 'TextBlock' && item.displayType?.style) {
        type = item.displayType.style;
    }
    
    document.getElementById('prop-type').value = type;
    
    const select = document.getElementById('prop-character-select');
    const input = document.getElementById('prop-character');
    const avatar = document.getElementById('prop-character-avatar');

    if (select && input) {
        if (item.characterId && availableCharacters.some(c => c._id === item.characterId)) {
            select.value = item.characterId;
            select.style.display = 'block';
            input.style.display = 'none';
            const char = availableCharacters.find(c => c._id === item.characterId);
            if (char && char.image) {
                avatar.src = char.image;
                avatar.style.display = 'block';
            } else {
                avatar.style.display = 'none';
            }
        } else {
            input.value = item.character || '';
            select.value = "";
            input.style.display = 'block';
            select.style.display = 'none';
            avatar.style.display = 'none';
        }
    }

    document.getElementById('prop-text').value = item.text || '';
    const p = item.placement || {};
    document.getElementById('prop-panel').value = p.panel || '';
    document.getElementById('prop-top').value = p.top || '';
    document.getElementById('prop-left').value = p.left || '';
    document.getElementById('prop-right').value = p.right || '';
    document.getElementById('prop-bottom').value = p.bottom || '';
    document.getElementById('prop-tail').value = p.tailPosition || '';
    document.getElementById('prop-tail-skew').value = (p.tailSkew || '').replace('deg', '');
    document.getElementById('prop-tail-scale').value = p.tailScale || '';
    document.getElementById('prop-curve').value = item.curve || '';
    document.getElementById('prop-curve-w').value = item.curveWidth || '';
    document.getElementById('prop-curve-h').value = item.curveHeight || '';
    document.getElementById('prop-rotation').value = item.rotation || '';
    document.getElementById('prop-font-size').value = item.fontSize || '';
    document.getElementById('prop-action-color').value = item.color || '#000000';
    document.getElementById('prop-outline-enabled').checked = !!item.outlineEnabled;
    document.getElementById('prop-outline-color').value = item.outlineColor || '#000000';
    document.getElementById('prop-outline-size').value = item.outlineSize || '1.0';
    document.getElementById('prop-duration').value = item.duration || '';
    document.getElementById('prop-panel-effect').value = item.panelEffect || '';

    togglePropVisibility(item.displayType?.type);

    const mainPanelInput = document.getElementById('prop-panel');
    if (mainPanelInput) {
        mainPanelInput.setAttribute('list', 'availablePanelsList');
        let datalist = document.getElementById('availablePanelsList');
        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = 'availablePanelsList';
            document.body.appendChild(datalist);
        }
        datalist.innerHTML = availablePanels.map(p => `<option value="${p}">`).join('');
    }
}

function updateSceneItemFromForm() {
    if (selectedItemIndex === -1) return;
    const item = currentSceneData[selectedItemIndex];
    if (!item) return;

    item.id = document.getElementById('prop-id').value;
    let type = document.getElementById('prop-type').value;
    if (['Narrator', 'InternalMonologue', 'Dialogue'].includes(type)) {
        item.displayType = { type: 'TextBlock', style: type };
    } else {
        item.displayType = { type: type };
    }
    
    const select = document.getElementById('prop-character-select');
    const input = document.getElementById('prop-character');
    if (select && !select.classList.contains('hidden') && select.value) {
        item.characterId = select.value;
        item.character = select.options[select.selectedIndex].text;
    } else {
        item.character = input.value;
        item.characterId = null;
    }

    item.text = document.getElementById('prop-text').value;
    item.panelEffect = document.getElementById('prop-panel-effect').value;
    item.curve = document.getElementById('prop-curve').value;
    item.curveWidth = document.getElementById('prop-curve-w').value;
    item.curveHeight = document.getElementById('prop-curve-h').value;
    item.rotation = document.getElementById('prop-rotation').value;
    item.fontSize = document.getElementById('prop-font-size').value;
    item.color = document.getElementById('prop-action-color').value;
    item.outlineEnabled = document.getElementById('prop-outline-enabled').checked;
    item.outlineColor = document.getElementById('prop-outline-color').value;
    item.outlineSize = document.getElementById('prop-outline-size').value;

    item.placement = {
        panel: document.getElementById('prop-panel').value,
        top: document.getElementById('prop-top').value,
        left: document.getElementById('prop-left').value,
        right: document.getElementById('prop-right').value,
        bottom: document.getElementById('prop-bottom').value,
        tailPosition: document.getElementById('prop-tail').value,
        tailSkew: document.getElementById('prop-tail-skew').value ? document.getElementById('prop-tail-skew').value + 'deg' : '',
        tailScale: document.getElementById('prop-tail-scale').value
    };
    if (item.displayType.type === 'Pause') {
        item.duration = parseInt(document.getElementById('prop-duration').value) || 1000;
    }
    renderSceneTree();
}

function togglePropVisibility(type) {
    const groups = {
        char: document.querySelector('.prop-group-character'),
        text: document.querySelector('.prop-group-text'),
        dur: document.querySelector('.prop-group-duration'),
        place: document.querySelector('.props-group'),
        curve: document.querySelector('.prop-group-curve')
    };
    const isPause = type === 'Pause';
    const isActionText = type === 'ActionText';

    if (groups.char) isPause ? groups.char.classList.add('hidden') : groups.char.classList.remove('hidden');
    if (groups.text) isPause ? groups.text.classList.add('hidden') : groups.text.classList.remove('hidden');
    if (groups.place) isPause ? groups.place.classList.add('hidden') : groups.place.classList.remove('hidden');
    if (groups.dur) isPause ? groups.dur.classList.remove('hidden') : groups.dur.classList.add('hidden');
    if (groups.curve) isActionText ? groups.curve.classList.remove('hidden') : groups.curve.classList.add('hidden');
}

export function initSceneEditor() {
    document.getElementById('closeSceneEditorBtn').onclick = () => {
        document.querySelector('.scene-editor').classList.add('hidden');
        document.querySelector('.page-builder').classList.remove('hidden');
    };

    document.getElementById('addItemBtn').onclick = () => {
        const newItem = { 
            id: crypto.randomUUID(), 
            displayOrder: currentSceneData.length, 
            displayType: { type: 'SpeechBubble' }, 
            character: 'New', 
            text: 'Text', 
            placement: { panel: '.panel-1a', top: '10%', left: '10%' },
            mediaAction: []
        };
        currentSceneData.push(newItem);
        selectSceneItem(currentSceneData.length - 1);
    };

    document.getElementById('saveSceneBtn').onclick = async (e) => {
        const btn = e.target;
        btn.disabled = true;
        btn.textContent = "Saving...";
        try {
            sanitizeScene(currentSceneData);
            const result = await saveSceneData(currentSceneInfo.volume, currentSceneInfo.chapter, currentSceneInfo.pageId, currentSceneData, activeSeriesId);
            if (result.ok) {
                btn.textContent = "Saved!";
                setTimeout(() => { btn.textContent = "Save Changes"; btn.disabled = false; }, 2000);
            } else {
                alert("Error saving: " + result.message);
                btn.disabled = false;
            }
        } catch (err) {
            alert("Save failed.");
            btn.disabled = false;
        }
    };
    
    document.getElementById('deleteItemBtn').onclick = () => {
        if (selectedItemIndex !== -1 && confirm("Are you sure?")) {
            currentSceneData.splice(selectedItemIndex, 1);
            selectedItemIndex = -1;
            document.getElementById('sceneItemEditor').classList.add('hidden');
            document.getElementById('sceneItemPlaceholder').classList.remove('hidden');
            renderSceneTree();
        }
    };

    document.getElementById('sceneItemForm').addEventListener('input', (e) => {
        if(e.target.id?.startsWith('prop-')) updateSceneItemFromForm();
    });

    document.getElementById('prop-type').addEventListener('change', (e) => {
        togglePropVisibility(e.target.value);
        updateSceneItemFromForm();
    });

    window.addEventListener('message', (e) => {
        if (e.data.type === 'panelSelected') loadPanelEditor(e.data);
        
        if (e.data.type === 'assetUploaded') {
            const { panel, type, fileName } = e.data;
            // Update local cache so switching back to this panel shows the new file
            const idx = currentVisualMediaData.findIndex(m => m.panel === panel);
            const updatedEntry = { panel, type, fileName };
            if (idx !== -1) {
                currentVisualMediaData[idx] = updatedEntry;
            } else {
                currentVisualMediaData.push(updatedEntry);
            }
            // If this is the currently edited panel, refresh the editor UI
            if (selectedPanelSelector === panel) {
                renderVisualEditor(panel);
            }
        }
    });
}

export function openVisualEditor(volume, chapter, pageId, mode = 'landscape') {
    document.querySelectorAll('.dashboard-section').forEach(s => s.classList.add('hidden'));
    document.querySelector('.layout-editor').classList.remove('hidden');
    const iframe = document.getElementById('pagePreviewFrame');
    if (!iframe) return;

    const targetSrc = `/api/editor/preview/${activeSeriesFolder}/${volume}/${chapter}/${pageId}?mode=${mode}`;
    iframe.src = targetSrc;
}

export function initVisualEditor() {
    document.getElementById('closeEditorBtn').onclick = () => {
        document.querySelector('.layout-editor').classList.add('hidden');
        document.querySelector('.page-builder').classList.remove('hidden');
    };
}

let selectedPanelSelector = null;

async function loadPanelEditor(data) {
    const { panel, volume, chapter, pageId } = data;
    currentVisualContext = { volume, chapter, pageId };
    selectedPanelSelector = panel;

    const toolsPane = document.querySelector('.layout-editor .tools-pane');
    toolsPane.innerHTML = `<h4 style="margin-top:0;">Panel Settings</h4><div id="visualEditorContainer">Loading...</div>`;
    
    // Always fetch the latest to avoid being "caught up" with old state
    const res = await fetchAmbientMedia(volume, chapter, pageId, activeSeriesId);
    
    if (res.ok && res.media) {
        if (res.media.media && Array.isArray(res.media.media)) {
            currentVisualMediaData = res.media.media;
        } else if (Array.isArray(res.media)) {
            currentVisualMediaData = res.media;
        } else {
            currentVisualMediaData = [];
        }
    } else {
        currentVisualMediaData = [];
    }
    
    renderVisualEditor(panel);
}

function renderVisualEditor(panelSelector) {
    const container = document.getElementById('visualEditorContainer');
    if (!container) return;

    let entry = currentVisualMediaData.find(m => m.panel === panelSelector);
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
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        return { 
            x: isNaN(x) ? 50 : x, 
            y: isNaN(y) ? 50 : y 
        };
    };

    const isLsCustom = entry.style?.objectPosition && !['center', 'top center', 'bottom center', 'left center', 'right center'].includes(entry.style.objectPosition);
    const isPtCustom = entry.portraitStyle?.objectPosition && !['center', 'top center', 'bottom center', 'left center', 'right center'].includes(entry.portraitStyle.objectPosition);

    const lsPos = parsePos(entry.style?.objectPosition);
    const ptPos = parsePos(entry.portraitStyle?.objectPosition);

    container.innerHTML = `
        <div class="panel-editor-ui">
            <div class="form-group margin-b-15">
                <label>Asset Type</label>
                <select id="visual-asset-type" class="gov-select width-100">
                    <option value="image" ${entry.type === 'image' ? 'selected' : ''}>Image</option>
                    <option value="playlist" ${entry.type === 'playlist' ? 'selected' : ''}>Playlist</option>
                </select>
            </div>
            <div class="form-group margin-b-15">
                <label>File Name</label>
                <div class="flex-row gap-5">
                    <input type="text" id="visual-asset-name" class="gov-select flex-1" value="${entry.fileName || ''}" placeholder="e.g. background.png">
                    <button id="visual-asset-browse" class="small btn-browse">...</button>
                </div>
            </div>
            <div class="form-group margin-b-15">
                <label>Panel Mask (Repeatable GIF)</label>
                <div class="flex-row gap-5">
                    <input type="text" id="visual-mask-name" class="gov-select flex-1" value="${entry.maskGif || ''}" placeholder="e.g. memory_mask.gif">
                    <button id="visual-mask-browse" class="small btn-browse">...</button>
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

    // Handlers
    const typeSelect = document.getElementById('visual-asset-type');
    const nameInput = document.getElementById('visual-asset-name');
    const maskInput = document.getElementById('visual-mask-name');
    const browseBtn = document.getElementById('visual-asset-browse');
    const maskBrowseBtn = document.getElementById('visual-mask-browse');
    const maskBgInput = document.getElementById('visual-mask-bg');
    const maskBgText = document.getElementById('visual-mask-bg-text');
    const saveBtn = document.getElementById('saveVisualMediaBtn');
    
    const lsAlignSelect = document.getElementById('visual-style-object-position');
    const ptAlignSelect = document.getElementById('visual-portrait-style-object-position');
    const lsPanWrapper = document.getElementById('ls-pan-wrapper');
    const ptPanWrapper = document.getElementById('pt-pan-wrapper');

    if (lsAlignSelect && lsPanWrapper) {
        lsAlignSelect.addEventListener('change', () => {
            lsPanWrapper.style.display = lsAlignSelect.value === 'custom' ? 'block' : 'none';
        });
    }

    if (ptAlignSelect && ptPanWrapper) {
        ptAlignSelect.addEventListener('change', () => {
            ptPanWrapper.style.display = ptAlignSelect.value === 'custom' ? 'block' : 'none';
        });
    }

    if (maskBgInput && maskBgText) {
        maskBgInput.oninput = () => maskBgText.value = maskBgInput.value;
        maskBgText.oninput = () => maskBgInput.value = maskBgText.value;
    }

    browseBtn.onclick = () => {
        const type = typeSelect ? typeSelect.value : 'image';
        openFileBrowser(type, currentVisualContext.volume, currentVisualContext.chapter, currentVisualContext.pageId, (fileName) => {
            nameInput.value = fileName;
        }, 'page', null, getActiveAssets());
    };

    maskBrowseBtn.onclick = () => {
        openFileBrowser('image', currentVisualContext.volume, currentVisualContext.chapter, currentVisualContext.pageId, (fileName) => {
            maskInput.value = fileName;
        }, 'page', null, getActiveAssets());
    };

    container.querySelectorAll('.btn-nudge').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            const targetId = btn.getAttribute('data-target') + '-slider';
            const dir = parseInt(btn.getAttribute('data-dir'));
            const slider = document.getElementById(targetId);
            if (slider) {
                let val = parseInt(slider.value) + dir;
                if(val < 0) val = 0;
                if(val > 100) val = 100;
                slider.value = val;
            }
        };
    });

        saveBtn.onclick = async () => {
        const landscapeAlignment = document.getElementById('visual-style-object-position')?.value || 'center';
        const portraitAlignment = document.getElementById('visual-portrait-style-object-position')?.value || 'center';
        
        const lsX = document.getElementById('ls-x-slider')?.value || '50';
        const lsY = document.getElementById('ls-y-slider')?.value || '50';
        const landscapeCustomPosition = (lsX === '50' && lsY === '50') ? '' : `${lsX}% ${lsY}%`;

        const ptX = document.getElementById('pt-x-slider')?.value || '50';
        const ptY = document.getElementById('pt-y-slider')?.value || '50';
        const portraitCustomPosition = (ptX === '50' && ptY === '50') ? '' : `${ptX}% ${ptY}%`;

        const updatedEntry = {
            panel: panelSelector,
            type: typeSelect ? typeSelect.value : 'image',
            fileName: nameInput.value,
            maskGif: maskInput.value,
            maskBg: document.getElementById('visual-mask-bg-text')?.value || '#000000'
        };

        // Preserve existing style objects but update objectPosition
        const idx = currentVisualMediaData.findIndex(m => m.panel === panelSelector);
        
        let existingStyle = {};
        let existingPortraitStyle = {};
        
        if (idx !== -1) {
            if (currentVisualMediaData[idx].style) existingStyle = { ...currentVisualMediaData[idx].style };
            if (currentVisualMediaData[idx].portraitStyle) existingPortraitStyle = { ...currentVisualMediaData[idx].portraitStyle };
            
            // Clean up old transform/padding properties if they exist
            delete existingStyle.padding;
            delete existingStyle.transform;
            delete existingPortraitStyle.padding;
            delete existingPortraitStyle.transform;
        }

        // Handle Landscape Alignment
        if (landscapeAlignment === 'contain') {
            existingStyle.objectFit = 'contain';
            delete existingStyle.objectPosition;
        } else if (landscapeAlignment === 'cover' || landscapeAlignment === 'center') {
            existingStyle.objectFit = 'cover';
            delete existingStyle.objectPosition; // Center is default
        } else if (landscapeAlignment === 'custom') {
            existingStyle.objectFit = 'cover';
            const lsX = document.getElementById('ls-x-slider')?.value || '50';
            const lsY = document.getElementById('ls-y-slider')?.value || '50';
            if (lsX === '50' && lsY === '50') {
                 delete existingStyle.objectPosition;
            } else {
                 existingStyle.objectPosition = `${lsX}% ${lsY}%`;
            }
        } else {
            existingStyle.objectFit = 'cover';
            existingStyle.objectPosition = landscapeAlignment;
        }

        // Handle Portrait Alignment
        if (portraitAlignment === 'contain') {
            existingPortraitStyle.objectFit = 'contain';
            delete existingPortraitStyle.objectPosition;
        } else if (portraitAlignment === 'cover' || portraitAlignment === 'center') {
            existingPortraitStyle.objectFit = 'cover';
            delete existingPortraitStyle.objectPosition; // Center is default
        } else if (portraitAlignment === 'custom') {
            existingPortraitStyle.objectFit = 'cover';
            const ptX = document.getElementById('pt-x-slider')?.value || '50';
            const ptY = document.getElementById('pt-y-slider')?.value || '50';
            if (ptX === '50' && ptY === '50') {
                 delete existingPortraitStyle.objectPosition;
            } else {
                 existingPortraitStyle.objectPosition = `${ptX}% ${ptY}%`;
            }
        } else {
            existingPortraitStyle.objectFit = 'cover';
            existingPortraitStyle.objectPosition = portraitAlignment;
        }

        if (Object.keys(existingStyle).length > 0) updatedEntry.style = existingStyle;
        if (Object.keys(existingPortraitStyle).length > 0) updatedEntry.portraitStyle = existingPortraitStyle;

        // 1. Update our local cache array - CRITICAL: Find index correctly
        if (idx !== -1) {
            currentVisualMediaData[idx] = updatedEntry;
        } else {
            currentVisualMediaData.push(updatedEntry);
        }

        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";

        try {
            const res = await saveMediaAPI(
                currentVisualContext.volume, 
                currentVisualContext.chapter, 
                currentVisualContext.pageId, 
                currentVisualMediaData, 
                activeSeriesId
            );

            if (res.ok) {
                saveBtn.textContent = "Saved!";
                // Reload preview to show the new image
                const iframe = document.getElementById('pagePreviewFrame');
                if (iframe) iframe.contentWindow.location.reload();
                
                setTimeout(() => {
                    saveBtn.disabled = false;
                    saveBtn.textContent = "Save Panel Asset";
                }, 2000);
            } else {
                throw new Error(res.message || "Unknown error");
            }
        } catch (err) {
            alert("Error: " + err.message);
            saveBtn.disabled = false;
            saveBtn.textContent = "Retry Save";
        }
    };
}

function sanitizeScene(sceneData) {
    sceneData.forEach(item => {
        delete item.audioSrc;
    });
}