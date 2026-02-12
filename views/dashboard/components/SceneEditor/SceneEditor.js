// views/dashboard/js/SceneEditor.js
/**
 * Sequential Comic Server - SceneEditor
 * Static-only version. Removed audio and video properties.
 */

import { fetchSceneData, saveSceneData, fetchPagePanels, fetchSeriesAPI, fetchCharactersAPI, saveMediaAPI, fetchAmbientMedia } from '../../studio/js/ApiService.js';
import { updateUrlState } from '../../studio/js/Navigation.js';
import { renderMediaActions, initMediaEditor } from '../../studio/js/MediaEditor.js';
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

export async function openSceneEditor(volume, chapter, pageId) {
    updateUrlState({ tab: 'scene-editor', vol: volume, chap: chapter, page: pageId });
    document.querySelector('.sidebar')?.classList.remove('open');
    document.querySelectorAll('main.main-content .dashboard-section').forEach(s => s.classList.add('hidden'));
    
    const sceneEditor = document.querySelector('.scene-editor');
    if(sceneEditor) sceneEditor.classList.remove('hidden');

    currentSceneInfo = { volume, chapter, pageId };
    const titleEl = document.getElementById('sceneEditorPageTitle');
    if(titleEl) titleEl.textContent = `${volume} / ${chapter} / ${pageId}`;

    try {
        const seriesList = await fetchSeriesAPI();
        const series = seriesList[0]; // Simplified for Sequential
        if (series) {
            activeSeriesId = series._id;
            activeSeriesFolder = series.folderName || "No_Overflow";
        }
    } catch (e) { console.error("Could not resolve series", e); }

    const [panelData, scene, characters, ambientData] = await Promise.all([
        fetchPagePanels(volume, chapter, pageId, activeSeriesId),
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
                    if (action.type === 'Playlist' && Array.isArray(action.items)) {
                        action.items.forEach(plItem => {
                            if (plItem.fileName) activeFiles.add(plItem.fileName);
                        });
                    }
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

        let mediaIcons = '';
        if (item.mediaAction && item.mediaAction.length > 0) {
            const actions = Array.isArray(item.mediaAction) ? item.mediaAction : [item.mediaAction];
            actions.forEach(action => {
                if (action.type === 'image') mediaIcons += '<ion-icon name="image-outline" title="Image Action"></ion-icon>';
                else if (action.type === 'Playlist') mediaIcons += '<ion-icon name="layers-outline" title="Playlist Action"></ion-icon>';
            });
        }

        li.innerHTML = `
            <div class="item-main">
                <div class="item-header">
                    <span class="item-type">${type}</span>
                    <div style="display:flex; align-items:center;">
                        ${avatarHtml}
                        ${char ? `<span class="item-char">${char}</span>` : ''}
                    </div>
                    <div class="item-media-icons" style="margin-left:auto; display:flex; gap:5px; color:var(--accent);">
                        ${mediaIcons}
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
    document.getElementById('prop-tail-skew').value = p.tailSkew || '';
    document.getElementById('prop-tail-height').value = p.tailHeight || '';
    document.getElementById('prop-duration').value = item.duration || '';
    document.getElementById('prop-panel-effect').value = item.panelEffect || '';

    togglePropVisibility(item.displayType?.type);

    const mediaActionContainer = document.getElementById('mediaActionsList');
    const mediaActionCallbacks = {
        onUpdate: (idx, key, val) => {
            const action = currentSceneData[selectedItemIndex].mediaAction[idx];
            action[key] = val;
            if (key === 'type') {
                if (val === 'image') {
                    delete action.items; delete action.loop; delete action.posterName; delete action.syncToDialogue; delete action.action;
                } else if (val === 'Playlist') {
                    delete action.fileName; delete action.loop; delete action.syncToDialogue; delete action.posterName; delete action.action;
                    if (!action.items) action.items = [];
                }
            }
            populateFormWithItem(currentSceneData[selectedItemIndex]);
        },
        onRemove: (idx) => {
            currentSceneData[selectedItemIndex].mediaAction.splice(idx, 1);
            populateFormWithItem(currentSceneData[selectedItemIndex]);
        },
        onBrowse: (type, cb) => {
            const active = getActiveAssets();
            openFileBrowser(type, currentSceneInfo.volume, currentSceneInfo.chapter, currentSceneInfo.pageId, cb, 'page', null, active);
        },
        availablePanels: availablePanels
    };
    renderMediaActions(mediaActionContainer, item.mediaAction, mediaActionCallbacks, { ...currentSceneInfo, series: activeSeriesId }, currentSceneData, selectedItemIndex);

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

    item.placement = {
        panel: document.getElementById('prop-panel').value,
        top: document.getElementById('prop-top').value,
        left: document.getElementById('prop-left').value,
        right: document.getElementById('prop-right').value,
        bottom: document.getElementById('prop-bottom').value,
        tailPosition: document.getElementById('prop-tail').value,
        tailSkew: document.getElementById('prop-tail-skew').value,
        tailHeight: document.getElementById('prop-tail-height').value
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
        place: document.querySelector('.props-group')
    };
    const isPause = type === 'Pause';
    if (groups.char) isPause ? groups.char.classList.add('hidden') : groups.char.classList.remove('hidden');
    if (groups.text) isPause ? groups.text.classList.add('hidden') : groups.text.classList.remove('hidden');
    if (groups.place) isPause ? groups.place.classList.add('hidden') : groups.place.classList.remove('hidden');
    if (groups.dur) isPause ? groups.dur.classList.remove('hidden') : groups.dur.classList.add('hidden');
}

export function initSceneEditor() {
    initMediaEditor(); 

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

    const addAction = (type) => {
        if (selectedItemIndex === -1) return;
        const item = currentSceneData[selectedItemIndex];
        if (!item.mediaAction) item.mediaAction = [];
        const newAction = { type: type, panel: '', fileName: '', action: 'load' };
        item.mediaAction.push(newAction);
        populateFormWithItem(item);
    };

    document.getElementById('addMediaImageBtn').onclick = () => addAction('image');
    document.getElementById('addMediaPlaylistBtn').onclick = () => addAction('Playlist');

    document.getElementById('targetTailTipBtn').onclick = () => {
        const panel = document.getElementById('prop-panel').value;
        if (!panel) return alert("Select a panel first.");
        
        // Switch to Visual Editor tab if not there
        openVisualEditor(currentSceneInfo.volume, currentSceneInfo.chapter, currentSceneInfo.pageId);
        
        const iframe = document.getElementById('pagePreviewFrame');
        if (iframe) {
            iframe.contentWindow.postMessage({ type: 'startTargetingMode', panel }, '*');
        }
    };

    document.getElementById('sceneItemForm').addEventListener('input', (e) => {
        if(e.target.id?.startsWith('prop-')) updateSceneItemFromForm();
    });

    document.getElementById('prop-type').addEventListener('change', (e) => {
        togglePropVisibility(e.target.value);
        updateSceneItemFromForm();
    });
}

export function openVisualEditor(volume, chapter, pageId) {
    document.querySelectorAll('.dashboard-section').forEach(s => s.classList.add('hidden'));
    document.querySelector('.layout-editor').classList.remove('hidden');
    const iframe = document.getElementById('pagePreviewFrame');
    if (iframe) iframe.src = `/api/editor/preview/${activeSeriesId}/${volume}/${chapter}/${pageId}`;
}

export function initVisualEditor() {
    document.getElementById('closeEditorBtn').onclick = () => {
        document.querySelector('.layout-editor').classList.add('hidden');
        document.querySelector('.page-builder').classList.remove('hidden');
    };
    window.addEventListener('message', (e) => {
        if (e.data.type === 'panelSelected') loadPanelEditor(e.data);
        
        if (e.data.type === 'tipTargeted') {
            // Logic to calculate skew and scale
            const xStr = e.data.x; // e.g. "45.50%"
            const yStr = e.data.y; // e.g. "80.20%"
            
            const targetX = parseFloat(xStr);
            const targetY = parseFloat(yStr);
            
            // We need to know where the bubble is positioned to calculate the vector
            const topStr = document.getElementById('prop-top').value || "0%";
            const leftStr = document.getElementById('prop-left').value || "0%";
            const bottomStr = document.getElementById('prop-bottom').value;
            const rightStr = document.getElementById('prop-right').value;
            
            const tailPos = document.getElementById('prop-tail').value || 'bottom-left';
            
            // Heuristic for attachment points (approx center of bubble corners)
            // This is a simplification since we don't have the bubble's actual width/height here.
            // We'll assume the bubble is roughly 30% wide and 15% tall for calculation purposes.
            let baseX = parseFloat(leftStr);
            let baseY = parseFloat(topStr);
            
            if (rightStr) baseX = 100 - parseFloat(rightStr) - 15; // Rough offset
            if (bottomStr) baseY = 100 - parseFloat(bottomStr) - 7;
            
            // Adjust based on tail corner
            if (tailPos.includes('right')) baseX += 25; else baseX += 5;
            if (tailPos.includes('bottom')) baseY += 12; else baseY -= 2;

            const dx = targetX - baseX;
            const dy = targetY - baseY;
            
            // Skew calculation: tan(theta) = dx / dy
            // CSS skewX is inverted relative to vertical
            let skew = 0;
            if (Math.abs(dy) > 0.1) {
                const rad = Math.atan2(dx, Math.abs(dy));
                skew = (rad * 180 / Math.PI);
                // Flip for top tails because they grow "up"
                if (tailPos.includes('top')) skew = -skew;
            }
            
            // Scale calculation: distance based on standard tail size (30px)
            // 1% of a standard 1080p height is ~10px. 30px is ~3%.
            const dist = Math.sqrt(dx*dx + dy*dy);
            const scale = (dist / 3).toFixed(2);
            
            document.getElementById('prop-tail-skew').value = skew.toFixed(1) + "deg";
            document.getElementById('prop-tail-height').value = scale;
            
            // Return to Scene Editor tab
            document.querySelectorAll('.dashboard-section').forEach(s => s.classList.add('hidden'));
            document.querySelector('.scene-editor').classList.remove('hidden');
            
            updateSceneItemFromForm();
        }
    });
}

async function loadPanelEditor(data) {
    const { panel, volume, chapter, pageId } = data;
    currentVisualContext = { volume, chapter, pageId };
    const toolsPane = document.querySelector('.layout-editor .tools-pane');
    toolsPane.innerHTML = `<h4 style="margin-top:0;">Panel Settings</h4><div id="visualEditorContainer">Loading...</div>`;
    const res = await fetchAmbientMedia(volume, chapter, pageId, activeSeriesId);
    currentVisualMediaData = (res.ok && res.media && Array.isArray(res.media.media)) ? res.media.media : [];
    renderVisualEditor(panel);
}

function renderVisualEditor(panelSelector) {
    const container = document.getElementById('visualEditorContainer');
    if (!container) return;
    let entryIndex = currentVisualMediaData.findIndex(m => m.panel === panelSelector);
    let entry = entryIndex !== -1 ? currentVisualMediaData[entryIndex] : { panel: panelSelector, type: 'image', fileName: '' };
    const actions = [entry];
    const callbacks = {
        onUpdate: (idx, key, val) => {
            entry[key] = val;
            if (key === 'type' && val === 'image') entry.action = 'load';
            if (entryIndex === -1) { currentVisualMediaData.push(entry); entryIndex = currentVisualMediaData.length - 1; }
            else { currentVisualMediaData[entryIndex] = entry; }
            if (key === 'type') renderVisualEditor(panelSelector);
        },
        onRemove: (idx) => {
             if (entryIndex !== -1) { currentVisualMediaData.splice(entryIndex, 1); entryIndex = -1; }
             entry = { panel: panelSelector, type: 'image', fileName: '' };
             renderVisualEditor(panelSelector);
        },
        onBrowse: (type, cb) => {
            openFileBrowser(type, currentVisualContext.volume, currentVisualContext.chapter, currentVisualContext.pageId, cb, 'page', null, getActiveAssets());
        }
    };
    renderMediaActions(container, actions, callbacks, { ...currentVisualContext, series: activeSeriesId });
    const btn = document.createElement('button');
    btn.className = 'update__btn width-100 margin-t-20';
    btn.textContent = 'Save Changes';
    btn.onclick = async () => {
        const res = await saveMediaAPI(currentVisualContext.volume, currentVisualContext.chapter, currentVisualContext.pageId, currentVisualMediaData, activeSeriesId);
        if (res.ok) document.getElementById('pagePreviewFrame').contentWindow.location.reload();
    };
    container.appendChild(btn);
}

function sanitizeScene(sceneData) {
    sceneData.forEach(item => {
        delete item.audioSrc;
        if (item.mediaAction) {
            const actions = Array.isArray(item.mediaAction) ? item.mediaAction : [item.mediaAction];
            actions.forEach(action => {
                if (action.type === 'image') {
                    delete action.items; delete action.loop; delete action.posterName; delete action.syncToDialogue; delete action.action;
                } else if (action.type === 'Playlist') {
                    delete action.fileName; delete action.loop; delete action.syncToDialogue; delete action.posterName; delete action.action;
                }
            });
        }
    });
}