// views/dashboard/js/SceneEditor.js

import { fetchSceneData, saveSceneData, fetchPagePanels, fetchSeriesAPI, fetchCharactersAPI, saveMediaAPI, fetchAmbientMedia } from '../../js/ApiService.js';
import { updateUrlState, getFolderNameFromPath } from '../../js/Navigation.js';
import { renderMediaActions, initMediaEditor } from '../../js/MediaEditor.js';
import { openFileBrowser } from '../FileBrowser/FileBrowser.js';

let currentSceneData = [];
let currentSceneInfo = {};
let selectedItemIndex = -1;
let dragSrcIndex = -1;
let availablePanels = [];
let availableCharacters = [];
let activeSeriesId = "No_Overflow"; // Default fallback
let activeSeriesFolder = "No_Overflow";

// --- VISUAL EDITOR STATE ---
let currentVisualMediaData = [];
let currentVisualContext = {};

export async function openSceneEditor(volume, chapter, pageId) {
    updateUrlState({ tab: 'scene-editor', vol: volume, chap: chapter, page: pageId });
    document.querySelector('.sidebar')?.classList.remove('open');
    document.querySelectorAll('main.main-content .dashboard-section').forEach(s => s.style.display = 'none');
    
    const sceneEditor = document.querySelector('.scene-editor');
    if(sceneEditor) sceneEditor.style.display = 'block';

    currentSceneInfo = { volume, chapter, pageId };
    const titleEl = document.getElementById('sceneEditorPageTitle');
    if(titleEl) titleEl.textContent = `${volume} / ${chapter} / ${pageId}`;

    // 1. Resolve Series ID from Volume Folder Name
    try {
        const seriesList = await fetchSeriesAPI();
        // Simple matching: find series that has a volume with volumePath ending in our folder name
        const series = seriesList.find(s => {
             // Logic to match volume to series. 
             // We'll rely on the API to give us the series list.
             // Ideally we'd have volume -> series mapping, but for now we'll assume "No_Overflow" or the first available series if we can't determine.
             // If we had the volume ID, we could fetch details.
             return true; 
        });
        if (series) {
            activeSeriesId = series._id;
            activeSeriesFolder = series.folderName || "No_Overflow";
        }
    } catch (e) { console.error("Could not resolve series", e); }

    // 2. Fetch Data
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
    
    // Load ambient data into visual editor state so we can check for active files immediately
    if (ambientData.ok && ambientData.media && Array.isArray(ambientData.media.media)) {
        currentVisualMediaData = ambientData.media.media;
    } else {
        currentVisualMediaData = [];
    }

    selectedItemIndex = -1;
    
    // Inject Character Select UI into Form if not already there
    setupCharacterInputUI();

    renderSceneTree();
    
    document.getElementById('sceneItemEditor').style.display = 'none';
    document.getElementById('sceneItemPlaceholder').style.display = 'block';
}

function getActiveAssets() {
    const activeFiles = new Set();

    // 1. Scan Narrative (Scene Data)
    if (currentSceneData) {
        currentSceneData.forEach(item => {
            // Audio Src
            if (item.audioSrc) {
                // Extract filename from path if possible, or just add the whole thing
                // Usually audioSrc is a path like /api/audio/.../filename.mp3
                const parts = item.audioSrc.split('/');
                const filename = parts[parts.length - 1];
                if (filename) activeFiles.add(filename);
            }

            // Media Actions
            if (item.mediaAction && Array.isArray(item.mediaAction)) {
                item.mediaAction.forEach(action => {
                    if (action.fileName) activeFiles.add(action.fileName);
                    if (action.posterName) activeFiles.add(action.posterName);
                    
                    if (action.type === 'Playlist' && Array.isArray(action.items)) {
                        action.items.forEach(plItem => {
                            if (plItem.fileName) activeFiles.add(plItem.fileName);
                        });
                    }
                });
            }
        });
    }

    // 2. Scan Ambient (Visual Data)
    if (currentVisualMediaData) {
        currentVisualMediaData.forEach(entry => {
            if (entry.fileName) activeFiles.add(entry.fileName);
            if (entry.posterName) activeFiles.add(entry.posterName);
        });
    }

    return Array.from(activeFiles);
}

function setupCharacterInputUI() {
    const container = document.querySelector('.prop-group-character');
    if (!container) return;
    
    container.innerHTML = `
        <label>Character</label>
        <div style="display:flex; gap:10px; align-items:center;">
            <div style="flex:1;">
                <select id="prop-character-select" style="width:100%; display:none; padding:8px; border-radius:4px; background:#222; color:white; border:1px solid #555;">
                    <option value="">-- Select Character --</option>
                </select>
                <input type="text" id="prop-character" placeholder="Character Name" style="width:100%;">
            </div>
            <img id="prop-character-avatar" src="" style="width:40px; height:40px; border-radius:50%; object-fit:cover; border:1px solid #555; display:none; background:#000;">
        </div>
        <div style="text-align:right; font-size:0.75rem; margin-top:2px;">
            <a href="#" id="toggleCharInputMode" style="color:var(--accent);">Toggle Input Mode</a>
        </div>
    `;

    const select = document.getElementById('prop-character-select');
    const input = document.getElementById('prop-character');
    const avatar = document.getElementById('prop-character-avatar');
    const toggle = document.getElementById('toggleCharInputMode');

    // Populate Select
    if (availableCharacters.length > 0) {
        availableCharacters.forEach(char => {
            const opt = document.createElement('option');
            opt.value = char._id;
            opt.textContent = char.name;
            opt.dataset.image = char.image || '';
            select.appendChild(opt);
        });
        // Default to select mode if chars exist
        input.style.display = 'none';
        select.style.display = 'block';
    } else {
        // Force text mode
        input.style.display = 'block';
        select.style.display = 'none';
        toggle.style.display = 'none';
    }

    toggle.onclick = (e) => {
        e.preventDefault();
        if (input.style.display === 'none') {
            input.style.display = 'block';
            select.style.display = 'none';
            avatar.style.display = 'none';
            // Clear selection
            select.value = "";
        } else {
            input.style.display = 'none';
            select.style.display = 'block';
            if (select.value) avatar.style.display = 'block';
        }
    };

    select.onchange = () => {
        const opt = select.options[select.selectedIndex];
        if (opt && opt.value) {
            const img = opt.dataset.image;
            if (img) {
                avatar.src = img;
                avatar.style.display = 'block';
            } else {
                avatar.style.display = 'none';
            }
            updateSceneItemFromForm();
        } else {
            avatar.style.display = 'none';
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

        // Try to find avatar
        let avatarHtml = '';
        if (item.characterId && availableCharacters.length > 0) {
            const charObj = availableCharacters.find(c => c._id === item.characterId);
            if (charObj && charObj.image) {
                avatarHtml = `<img src="${charObj.image}" style="width:20px; height:20px; border-radius:50%; object-fit:cover; margin-right:5px; border:1px solid #555;">`;
            }
        }

        let mediaIcons = '';
        if (item.mediaAction && item.mediaAction.length > 0) {
            const actions = Array.isArray(item.mediaAction) ? item.mediaAction : [item.mediaAction];
            actions.forEach(action => {
                if (action.type === 'image') mediaIcons += '<ion-icon name="image-outline" title="Image Action"></ion-icon>';
                else if (action.type === 'video') mediaIcons += '<ion-icon name="videocam-outline" title="Video Action"></ion-icon>';
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
                <button class="small icon-only copy-id-btn" title="Copy Full ID" style="padding:2px 5px; height:auto; background:transparent; border:none; color:var(--accent); opacity:0.8; cursor:pointer;">
                    <ion-icon name="copy-outline"></ion-icon>
                </button>
            </div>
        `;

        const copyBtn = li.querySelector('.copy-id-btn');
        if (copyBtn) {
            copyBtn.onclick = (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(item.id || '').then(() => {
                    const icon = e.currentTarget.querySelector('ion-icon');
                    if(icon) {
                        icon.name = 'checkmark-outline';
                        icon.style.color = '#4caf50';
                        setTimeout(() => {
                            icon.name = 'copy-outline';
                            icon.style.color = '';
                        }, 1500);
                    }
                }).catch(err => console.error('Failed to copy ID:', err));
            };
        }

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
    
    document.getElementById('sceneItemEditor').style.display = 'block';
    document.getElementById('sceneItemPlaceholder').style.display = 'none';
    
    populateFormWithItem(currentSceneData[index]);
}

function populateFormWithItem(item) {
    if (!item) return;
    
    const idInput = document.getElementById('prop-id');
    idInput.value = item.id || '';
    
    // Copy ID Button logic (re-attach if needed or ensure existing)
    // ... (Same as before)

    let type = item.displayType?.type || 'SpeechBubble';
    if (type === 'Sound Effect') type = 'SoundEffect'; 
    
    // Support TextBlock Styles in Dropdown
    if (type === 'TextBlock' && item.displayType?.style) {
        type = item.displayType.style;
    }
    
    document.getElementById('prop-type').value = type;
    
    // --- CHARACTER LOGIC ---
    const select = document.getElementById('prop-character-select');
    const input = document.getElementById('prop-character');
    const avatar = document.getElementById('prop-character-avatar');

    if (select && input) {
        if (item.characterId && availableCharacters.some(c => c._id === item.characterId)) {
            // Mode: Select
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
        } else if (item.character && availableCharacters.some(c => c.name === item.character)) {
             // Fallback: Match by name if ID missing
             const char = availableCharacters.find(c => c.name === item.character);
             select.value = char._id;
             select.style.display = 'block';
             input.style.display = 'none';
             if (char.image) {
                 avatar.src = char.image;
                 avatar.style.display = 'block';
             } else {
                 avatar.style.display = 'none';
             }
        } else {
            // Mode: Text Input (Legacy or manual)
            input.value = item.character || '';
            select.value = "";
            select.style.display = (availableCharacters.length > 0) ? 'none' : 'none'; // Only hide if we have chars
            // If we have characters, we usually prefer select mode, but if the value isn't in the list, fallback to text
            if (availableCharacters.length > 0) {
                 input.style.display = 'block';
                 select.style.display = 'none';
            } else {
                 input.style.display = 'block';
            }
            avatar.style.display = 'none';
        }
    }

    const textInput = document.getElementById('prop-text');
    textInput.value = item.text || '';

    // Copy Text Button logic
    // ... (Same as before)

    const p = item.placement || {};
    document.getElementById('prop-panel').value = p.panel || '';
    document.getElementById('prop-top').value = p.top || '';
    document.getElementById('prop-left').value = p.left || '';
    document.getElementById('prop-right').value = p.right || '';
    document.getElementById('prop-bottom').value = p.bottom || '';
    document.getElementById('prop-tail').value = p.tailPosition || '';
    document.getElementById('prop-duration').value = item.duration || '';

    const audioInput = document.getElementById('prop-audio-src');
    const audioPlayer = document.getElementById('prop-audio-player');
    audioInput.value = item.audioSrc || '';
    if (item.audioSrc) {
        audioPlayer.src = item.audioSrc;
        audioPlayer.style.display = 'block';
    } else {
        audioPlayer.src = '';
        audioPlayer.style.display = 'none';
    }
    
    togglePropVisibility(item.displayType?.type);

    const mediaActionContainer = document.getElementById('mediaActionsList');
    const mediaActionCallbacks = {
        onUpdate: (idx, key, val) => {
            const action = currentSceneData[selectedItemIndex].mediaAction[idx];
            action[key] = val;
            if (key === 'type') {
                if (val === 'image') {
                    delete action.items; delete action.loop; delete action.posterName; delete action.syncToDialogue; delete action.action;
                } else if (val === 'video') {
                    delete action.items;
                } else if (val === 'Playlist') {
                    delete action.fileName; delete action.loop; delete action.syncToDialogue; delete action.posterName; delete action.action;
                    if (!action.items) action.items = [];
                }
            }
                        if (key === 'type' || key === 'action' || key === 'items' || key === 'fileName' || key === 'cameraAction') { 
                             populateFormWithItem(currentSceneData[selectedItemIndex]);
                        }        },
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

    // Update the main panel input to use a datalist
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
    if (type === 'Sound Effect') type = 'SoundEffect'; // Safeguard
    
    if (['Narrator', 'InternalMonologue', 'Dialogue'].includes(type)) {
        item.displayType = { type: 'TextBlock', style: type };
    } else {
        item.displayType = { type: type };
    }
    
    // Character Logic
    const select = document.getElementById('prop-character-select');
    const input = document.getElementById('prop-character');
    if (select && select.style.display !== 'none' && select.value) {
        // Selected from list
        item.characterId = select.value;
        item.character = select.options[select.selectedIndex].text;
    } else {
        // Manual input
        item.character = input.value;
        item.characterId = null; // Clear ID if switched to manual
    }

    item.text = document.getElementById('prop-text').value;
    item.audioSrc = document.getElementById('prop-audio-src').value;
    
    item.placement = {
        panel: document.getElementById('prop-panel').value,
        top: document.getElementById('prop-top').value,
        left: document.getElementById('prop-left').value,
        right: document.getElementById('prop-right').value,
        bottom: document.getElementById('prop-bottom').value,
        tailPosition: document.getElementById('prop-tail').value
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
        place: document.querySelector('.prop-group-placement')
    };
    const isPause = type === 'Pause';
    if (groups.char) groups.char.style.display = isPause ? 'none' : 'block';
    if (groups.text) groups.text.style.display = isPause ? 'none' : 'block';
    if (groups.place) groups.place.style.display = isPause ? 'none' : 'block';
    if (groups.dur) groups.dur.style.display = isPause ? 'block' : 'none';
}

function createAudioGroup() {
    const parent = document.getElementById('sceneItemForm');
    if (parent.querySelector('.prop-group-audio')) return;

    const group = document.createElement('div');
    group.className = 'input-field prop-group-audio';
    group.style.borderTop = '1px solid #555';
    group.style.paddingTop = '15px';
    group.style.marginTop = '15px';

    group.innerHTML = `
        <label>Cue Audio</label>
        <div style="display:flex; gap:10px; margin-bottom:10px;">
            <input type="text" id="prop-audio-src" readonly style="flex:1; background:#222;" placeholder="No audio linked">
            <button type="button" class="small" id="browseAudioBtn">...</button>
        </div>
        <audio id="prop-audio-player" controls style="width:100%; height:30px; display:none;"></audio>
    `;

    const deleteBtn = document.getElementById('deleteItemBtn');
    parent.insertBefore(group, deleteBtn);

    document.getElementById('browseAudioBtn').onclick = () => {
        const active = getActiveAssets();
        openFileBrowser('audio', currentSceneInfo.volume, currentSceneInfo.chapter, currentSceneInfo.pageId, (val) => {
            const cue = currentSceneData[selectedItemIndex];
            let fullPath = '';
            const series = activeSeriesFolder || 'No_Overflow'; 
            
            if (val.startsWith('series://')) {
                fullPath = `/Library/${series}/assets/audio/${val.replace('series://', '')}`;
            } else if (val.startsWith('global://')) {
                fullPath = `/resources/audio/${val.replace('global://', '')}`;
            } else if (val.startsWith('volume://')) {
                fullPath = `/Library/${series}/Volumes/${currentSceneInfo.volume}/assets/audio/${val.replace('volume://', '')}`;
            } else {
                // Page Local via API
                fullPath = `/api/audio/${series}/${currentSceneInfo.volume}/${currentSceneInfo.chapter}/${currentSceneInfo.pageId}/assets/${val}`;
            }

            document.getElementById('prop-audio-src').value = fullPath;
            const cacheBustedPath = `${fullPath}?t=${Date.now()}`;
            document.getElementById('prop-audio-player').src = cacheBustedPath;
            document.getElementById('prop-audio-player').style.display = 'block';
            cue.audioSrc = fullPath; // Store the clean path, play the busted one
        }, 'page', null, active);
    };
}


export function initSceneEditor() {
    initMediaEditor(); 

    document.getElementById('closeSceneEditorBtn').onclick = () => {
        document.querySelector('.scene-editor').style.display = 'none';
        document.querySelector('.page-builder').style.display = 'block';
        updateUrlState({ tab: 'page-builder', ...currentSceneInfo });
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
        const oldText = btn.textContent;
        const overlay = document.getElementById('savingOverlay');
        
        btn.disabled = true;
        btn.textContent = "Saving...";
        if (overlay) overlay.style.display = 'flex';
        
        try {
            sanitizeScene(currentSceneData);
            const result = await saveSceneData(currentSceneInfo.volume, currentSceneInfo.chapter, currentSceneInfo.pageId, currentSceneData, activeSeriesId);
            
            if (result.ok) {
                btn.textContent = "Saved!";
                if (result.scene) {
                    currentSceneData = result.scene;
                    renderSceneTree();
                }
                setTimeout(() => {
                    btn.textContent = oldText;
                    btn.disabled = false;
                }, 2000);
            } else {
                alert("Error saving: " + result.message);
                btn.textContent = oldText;
                btn.disabled = false;
            }
        } catch (err) {
            console.error(err);
            alert("Save failed due to network error.");
            btn.textContent = oldText;
            btn.disabled = false;
        } finally {
            if (overlay) overlay.style.display = 'none';
        }
    };
    
    document.getElementById('deleteItemBtn').onclick = () => {
        if (selectedItemIndex !== -1 && confirm("Are you sure you want to delete this item?")) {
            currentSceneData.splice(selectedItemIndex, 1);
            selectedItemIndex = -1;
            document.getElementById('sceneItemEditor').style.display = 'none';
            document.getElementById('sceneItemPlaceholder').style.display = 'block';
            renderSceneTree();
        }
    };

    const addAction = (type) => {
        if (selectedItemIndex === -1) return;
        const item = currentSceneData[selectedItemIndex];
        if (!item.mediaAction) item.mediaAction = [];
        
        const newAction = { type: type, panel: '', fileName: '', action: 'load' };
        if (type === 'video') { newAction.loop = true; newAction.crossfade = false; }
        if (type === 'Playlist') { 
            delete newAction.fileName; 
            newAction.items = []; 
            newAction.globalDuration = 2000;
            newAction.waitForCompletion = true;
        }
        
        item.mediaAction.push(newAction);
        populateFormWithItem(item);
    };

    document.getElementById('addMediaImageBtn').onclick = () => addAction('image');
    document.getElementById('addMediaPlaylistBtn').onclick = () => addAction('Playlist');

    document.getElementById('sceneItemForm').addEventListener('input', (e) => {
        if(e.target.id?.startsWith('prop-')) {
            updateSceneItemFromForm();
        }
    });

    document.getElementById('prop-type').addEventListener('change', (e) => {
        togglePropVisibility(e.target.value);
        updateSceneItemFromForm();
    });
}

export function openVisualEditor(volume, chapter, pageId) {
    updateUrlState({ tab: 'layout-editor', vol: volume, chap: chapter, page: pageId });
    document.querySelectorAll('.dashboard-section').forEach(s => s.style.display = 'none');
    document.querySelector('.layout-editor').style.display = 'block';
    document.getElementById('editorPageTitle').textContent = `${volume} / ${chapter} / ${pageId}`;
    const iframe = document.getElementById('pagePreviewFrame');
if (iframe) {
    // Pass Active Series ID (or default)
    iframe.src = `/api/editor/preview/${activeSeriesId || 'No_Overflow'}/${volume}/${chapter}/${pageId}`;
}
}
export function initVisualEditor() {
    document.getElementById('closeEditorBtn').onclick = () => {
        document.querySelector('.layout-editor').style.display = 'none';
        document.querySelector('.page-builder').style.display = 'block';
        const iframe = document.getElementById('pagePreviewFrame');
        if (iframe) {
            iframe.src = '';
        }
        updateUrlState({ tab: 'page-builder', ...currentSceneInfo });
    };

    window.addEventListener('message', (e) => {
        if (e.data.type === 'panelSelected') {
            loadPanelEditor(e.data);
        }
    });
}

async function loadPanelEditor(data) {
    const { panel, volume, chapter, pageId } = data;
    currentVisualContext = { volume, chapter, pageId };

    const toolsPane = document.querySelector('.layout-editor .tools-pane');
    toolsPane.innerHTML = `
        <h4 style="margin-top:0;">Panel Settings</h4>
        <div style="margin-bottom:15px; color:#aaa; font-family:monospace;">${panel}</div>
        <div id="visualEditorContainer">Loading...</div>
    `;

    // Fetch Media Data
    // Note: API returns { ok: true, media: { header, media: [], scene: [] } }
    const res = await fetchAmbientMedia(volume, chapter, pageId, activeSeriesId);
    if (res.ok && res.media && Array.isArray(res.media.media)) {
        currentVisualMediaData = res.media.media;
    } else {
        currentVisualMediaData = [];
    }

    renderVisualEditor(panel);
}

function renderVisualEditor(panelSelector) {
    const container = document.getElementById('visualEditorContainer');
    if (!container) return;

    // Find existing entry or create mock one
    let entryIndex = currentVisualMediaData.findIndex(m => m.panel === panelSelector);
    let entry = entryIndex !== -1 ? currentVisualMediaData[entryIndex] : { panel: panelSelector, type: 'image', fileName: '' };

    // FORCE FIX: Visual Editor entries should never have 'play' or 'pause' actions.
    // They define the initial state, which is always a load.
    if (entry.action === 'play' || entry.action === 'pause') {
        delete entry.action; // Reset to default (load)
    }

    // Wrap in array for renderMediaActions
    const actions = [entry];
    
    const callbacks = {
        onUpdate: (idx, key, val) => {
            entry[key] = val;
            
            // Clean up dependent fields if type changes
            if (key === 'type') {
                if (val === 'image') { 
                    delete entry.posterName; 
                    delete entry.loop; 
                    delete entry.syncToDialogue; 
                    entry.action = 'load'; // Force load action for images
                }
                if (val === 'video') { 
                    delete entry.items; 
                    if (!entry.posterName) entry.posterName = ''; 
                }
            }

            // Update Master List
            if (entryIndex === -1) {
                currentVisualMediaData.push(entry);
                entryIndex = currentVisualMediaData.length - 1;
            } else {
                currentVisualMediaData[entryIndex] = entry;
            }
            
            // Re-render to show new fields (like poster) if type changed
            if (key === 'type') renderVisualEditor(panelSelector);
        },
        onRemove: (idx) => {
             // Clear this panel's media
             if (entryIndex !== -1) {
                 currentVisualMediaData.splice(entryIndex, 1);
                 entryIndex = -1;
             }
             // Reset entry
             entry = { panel: panelSelector, type: 'image', fileName: '' };
             renderVisualEditor(panelSelector);
        },
        onBrowse: (type, cb) => {
            const active = getActiveAssets();
            openFileBrowser(type, currentVisualContext.volume, currentVisualContext.chapter, currentVisualContext.pageId, cb, 'page', null, active);
        }
    };

    renderMediaActions(container, actions, callbacks, { ...currentVisualContext, series: activeSeriesId });

    // Append Save Button
    const btnContainer = document.createElement('div');
    btnContainer.className = 'margin-t-20';
    
    const saveBtn = document.createElement('button');
    saveBtn.className = 'update__btn width-100';
    saveBtn.textContent = 'Save Changes';
    saveBtn.onclick = async () => {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        const res = await saveMediaAPI(currentVisualContext.volume, currentVisualContext.chapter, currentVisualContext.pageId, currentVisualMediaData, activeSeriesId);
        if (res.ok) {
            saveBtn.textContent = 'Saved!';
            
            // Reload Iframe to show changes
            const iframe = document.getElementById('pagePreviewFrame');
            if (iframe) iframe.contentWindow.location.reload();
            
            setTimeout(() => { 
                saveBtn.disabled = false; 
                saveBtn.textContent = 'Save Changes'; 
            }, 1000);
        } else {
            alert('Save failed: ' + res.message);
            saveBtn.disabled = false; 
            saveBtn.textContent = 'Save Changes';
        }
    };
    btnContainer.appendChild(saveBtn);
    container.appendChild(btnContainer);
}

function sanitizeScene(sceneData) {
    sceneData.forEach(item => {
        if (!item.audioSrc) item.audioSrc = "";
        
        if (item.mediaAction) {
            const actions = Array.isArray(item.mediaAction) ? item.mediaAction : [item.mediaAction];
            actions.forEach(action => {
                if (action.type === 'video') {
                    if (action.action === 'play' || action.action === 'pause') {
                        delete action.fileName;
                        delete action.posterName;
                        delete action.loop;
                    }
                    delete action.items; 
                } else if (action.type === 'image') {
                    delete action.items;
                    delete action.loop;
                    delete action.posterName;
                    delete action.syncToDialogue;
                    delete action.action;
                } else if (action.type === 'Playlist') {
                    delete action.fileName;
                    delete action.loop;
                    delete action.syncToDialogue;
                    delete action.posterName;
                    delete action.action;
                }
            });
        }
    });
}