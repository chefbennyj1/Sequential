// views/dashboard/js/MediaEditor.js

import { openFileBrowser } from '../components/FileBrowser/FileBrowser.js';

let _callbacks = {
    onUpdate: null,
    onRemove: null,
    onBrowse: null // (type, callback) => void
};

let _context = null;
let _allSceneData = null;
let _currentCueIndex = -1;

export function renderMediaActions(container, actions, callbacks, context, allSceneData = null, cueIndex = -1) {
    container.innerHTML = '';
    _callbacks = callbacks; 
    _context = context; // Store context
    _allSceneData = allSceneData;
    _currentCueIndex = cueIndex;
    
    const actionList = Array.isArray(actions) ? actions : (actions ? [actions] : []);

    actionList.forEach((action, idx) => {
        try {
            const row = createMediaActionRow(action, idx);
            container.appendChild(row);
        } catch (e) {
            console.error("Error creating media action row:", e, action);
            const errDiv = document.createElement('div');
            errDiv.style.color = 'red';
            errDiv.textContent = "Error rendering item: " + e.message;
            container.appendChild(errDiv);
        }
    });
}

function getThumbnailUrl(type, fileName) {
    if (!fileName || !_context) return '';
    
    // Handle Prefixes
    if (fileName.startsWith('series://')) return `/Library/${_context.series || 'No_Overflow'}/assets/${type}/${fileName.replace('series://', '')}`;
    if (fileName.startsWith('volume://')) return `/Library/${_context.series || 'No_Overflow'}/Volumes/${_context.volume}/assets/${type}/${fileName.replace('volume://', '')}`;
    
    // Page Local
    if (type === 'image') {
        return `/api/images/${_context.series || 'No_Overflow'}/${_context.volume}/${_context.chapter}/${_context.pageId}/assets/${fileName}`;
    } else if (type === 'video') {
        return `/api/thumbnails/video/${_context.series || 'No_Overflow'}/${_context.volume}/${_context.chapter}/${_context.pageId}/${fileName}`;
    }
    return '';
}

function createMediaActionRow(action, idx) {
    const div = document.createElement('div');
    div.className = 'media-action-item';
    
    // 1. Thumbnail
    div.appendChild(createThumbnailColumn(action));

    // 2. Content
    const contentCol = document.createElement('div');
    contentCol.className = 'media-action-content';
    
    // Row 1: Type, Panel, Action
    contentCol.appendChild(createHeaderRow(action, idx));

    // Row 2: File Controls (if Load or Audio Change)
    if (action.type === 'backgroundAudio' || action.type === 'ambientAudio') {
        contentCol.appendChild(createFileControlsRow(action, idx));
        contentCol.appendChild(createAudioVolumeRow(action, idx));
    } else if ((!action.action || action.action === 'load') && action.type !== 'Playlist') {
        contentCol.appendChild(createFileControlsRow(action, idx));
        
        // Poster Control (Video only)
        if (action.type === 'video') {
            contentCol.appendChild(createPosterControlRow(action, idx));
        }

        // Motion Controls (Optional)
        if (action.type === 'image' || action.type === 'video') {
            contentCol.appendChild(createMotionControls(action, idx));
        }
    } else if (action.type !== 'Playlist') {
        console.log("Controls hidden for action:", action, "Action property:", action.action);
    }

    // Row 3: Playlist Controls
    if (action.type === 'Playlist') {
        contentCol.appendChild(createPlaylistControls(action, idx));
    }

    div.appendChild(contentCol);

    // 3. Remove Button
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-remove-action';
    removeBtn.innerHTML = '&times;';
    removeBtn.onclick = () => { if (_callbacks.onRemove) _callbacks.onRemove(idx); };
    div.appendChild(removeBtn);

    return div;
}

function createThumbnailColumn(action) {
    const col = document.createElement('div');
    col.className = 'media-action-thumbnail';
    
    let fName = action.fileName;
    let type = action.type;

    // Handle Play/Pause actions which don't have a fileName
    if (!fName && (action.action === 'play' || action.action === 'pause') && _allSceneData && _currentCueIndex !== -1) {
        // Look back for the source video fileName
        for (let i = _currentCueIndex; i >= 0; i--) {
            const cue = _allSceneData[i];
            if (!cue.mediaAction) continue;
            
            const actions = Array.isArray(cue.mediaAction) ? cue.mediaAction : [cue.mediaAction];
            const sourceAction = actions.find(a => 
                a.panel === action.panel && 
                a.type === 'video' && 
                (!a.action || a.action === 'load')
            );

            if (sourceAction && sourceAction.fileName) {
                fName = sourceAction.fileName;
                type = 'video';
                break;
            }
        }
    }

    if (action.type === 'Playlist' && action.items && action.items.length > 0) {
        fName = action.items[0].fileName;
        type = action.items[0].type;
    }

    let thumbUrl = '';
    if (fName) {
        thumbUrl = getThumbnailUrl(type, fName);
    }

    if (thumbUrl) {
        const img = document.createElement('img');
        img.src = thumbUrl;
        img.onerror = () => { img.style.display = 'none'; col.innerHTML = '<span class="icon-placeholder">?</span>'; };
        col.appendChild(img);
    } else {
        let iconName = 'help-outline';
        if (action.type === 'image') iconName = 'image-outline';
        if (action.type === 'video') iconName = 'videocam-outline';
        if (action.type === 'Playlist') iconName = 'layers-outline';
        if (action.type === 'backgroundAudio' || action.type === 'ambientAudio') iconName = 'musical-notes-outline';
        
        col.innerHTML = `<span class="icon-placeholder flex-center width-100 height-100" style="color:#666; font-size:2rem;"><ion-icon name="${iconName}"></ion-icon></span>`;
    }
    return col;
}

function createHeaderRow(action, idx) {
    const row = document.createElement('div');
    row.className = 'media-action-row';

    // Normalize for UI selection (handle 'playlist' vs 'Playlist')
    let currentType = action.type || 'image';
    if (currentType.toLowerCase() === 'playlist') currentType = 'Playlist';

    // Replace static label with a Select for switching types
    const typeSelect = createSelect(['image', 'video', 'Playlist', 'backgroundAudio', 'ambientAudio'], currentType, (val) => triggerUpdate(idx, 'type', val));
    typeSelect.className = 'media-type-label gov-select'; 
    typeSelect.style.width = '120px'; // Increased width for longer audio names

    const panelInput = document.createElement('input');
    panelInput.type = 'text';
    panelInput.value = action.panel || '';
    panelInput.placeholder = 'Panel Selector';
    panelInput.className = 'flex-1 gov-select'; // Reusing utility class
    panelInput.onchange = (e) => triggerUpdate(idx, 'panel', e.target.value);

    const actionOptions = action.type === 'video' ? ['load', 'play', 'pause'] : ['load'];
    const actionSelect = createSelect(actionOptions, action.action || 'load', (val) => triggerUpdate(idx, 'action', val));
    actionSelect.className = 'flex-1 gov-select';

    row.append(typeSelect, panelInput, actionSelect);
    return row;
}

function createFileControlsRow(action, idx) {
    const row = document.createElement('div');
    row.className = 'media-action-row';

    const fileContainer = document.createElement('div');
    fileContainer.className = 'flex-row flex-1 gap-5';
    
    const fileInput = document.createElement('input');
    fileInput.type = 'text';
    fileInput.value = action.fileName || '';
    fileInput.placeholder = 'File Name';
    fileInput.className = 'flex-1 gov-select';
    fileInput.onchange = (e) => triggerUpdate(idx, 'fileName', e.target.value);
    
    const browseBtn = document.createElement('button');
    browseBtn.type = 'button';
    browseBtn.className = 'btn-browse small';
    browseBtn.textContent = '...';
    browseBtn.onclick = () => {
        if (_callbacks.onBrowse) {
            let browseType = 'image';
            if (action.type === 'video') browseType = 'video';
            if (action.type === 'backgroundAudio' || action.type === 'ambientAudio') browseType = 'audio';
            
            _callbacks.onBrowse(browseType, (val) => {
                fileInput.value = val;
                triggerUpdate(idx, 'fileName', val);
            });
        }
    };

    fileContainer.append(fileInput, browseBtn);
    row.appendChild(fileContainer);

    if (action.type === 'image' || action.type === 'video') {
        row.appendChild(createCheckbox('Crossfade', action.crossfade === true, (val) => triggerUpdate(idx, 'crossfade', val)));
    }

    if (action.type === 'video') {
        row.appendChild(createCheckbox('Loop', action.loop, (val) => triggerUpdate(idx, 'loop', val)));
        row.appendChild(createCheckbox('Sync', action.syncToDialogue, (val) => triggerUpdate(idx, 'syncToDialogue', val)));
    }

    return row;
}

function createPosterControlRow(action, idx) {
    const row = document.createElement('div');
    row.className = 'media-action-row';
    
    // Label
    const label = document.createElement('span');
    label.className = 'media-motion-label';
    label.style.width = '60px'; 
    label.textContent = 'Poster';
    row.appendChild(label);

    const fileContainer = document.createElement('div');
    fileContainer.className = 'flex-row flex-1 gap-5';
    
    const fileInput = document.createElement('input');
    fileInput.type = 'text';
    fileInput.value = action.posterName || '';
    fileInput.placeholder = 'Poster Image...';
    fileInput.className = 'flex-1 gov-select';
    fileInput.onchange = (e) => triggerUpdate(idx, 'posterName', e.target.value);
    
    const browseBtn = document.createElement('button');
    browseBtn.type = 'button';
    browseBtn.className = 'btn-browse small';
    browseBtn.textContent = '...';
    browseBtn.onclick = () => {
        if (_callbacks.onBrowse) {
            _callbacks.onBrowse('image', (val) => {
                fileInput.value = val;
                triggerUpdate(idx, 'posterName', val);
            });
        }
    };

    fileContainer.append(fileInput, browseBtn);
    row.appendChild(fileContainer);

    return row;
}

function createMotionControls(action, idx) {
    const row = document.createElement('div');
    row.className = 'media-motion-row';

    const label = document.createElement('span');
    label.className = 'media-motion-label';
    label.textContent = 'MOTION';
    row.appendChild(label);

    const cam = action.cameraAction || {};
    const camType = createSelect(['none', 'shake', 'zoomIn', 'zoomOut', 'kenBurns', 'pan', 'cinematicPan', 'blurToSharpen', 'breathe'], cam.type || 'none', (val) => {
        if (val === 'none') {
            delete action.cameraAction;
        } else {
            action.cameraAction = { ...cam, type: val };
            if (!action.cameraAction.duration) {
                if (val === 'cinematicPan') action.cameraAction.duration = 10000;
                else if (val === 'blurToSharpen') action.cameraAction.duration = 3000;
                else action.cameraAction.duration = 3000;
            }
        }
        triggerUpdate(idx, 'cameraAction', action.cameraAction);
    });
    camType.style.width = '150px';
    camType.className = 'gov-select';
    row.appendChild(camType);

    if (cam.type && cam.type !== 'none') {
        const durInput = document.createElement('input');
        durInput.type = 'number';
        durInput.value = cam.duration || 1000;
        durInput.placeholder = 'ms';
        durInput.className = 'gov-select';
        durInput.style.width = '80px';
        durInput.onchange = (e) => {
            action.cameraAction.duration = parseInt(e.target.value);
            triggerUpdate(idx, 'cameraAction', action.cameraAction);
        };
        row.appendChild(durInput);

        if (['shake', 'zoomIn', 'zoomOut'].includes(cam.type)) {
            const valInput = document.createElement('input');
            valInput.type = 'number';
            valInput.step = '0.1';
            valInput.value = cam.type === 'shake' ? (cam.intensity || 1.0) : (cam.scale || 1.2);
            valInput.placeholder = cam.type === 'shake' ? 'Int' : 'Scale';
            valInput.className = 'gov-select';
            valInput.style.width = '70px';
            valInput.onchange = (e) => {
                const v = parseFloat(e.target.value);
                if (cam.type === 'shake') action.cameraAction.intensity = v;
                else action.cameraAction.scale = v;
                triggerUpdate(idx, 'cameraAction', action.cameraAction);
            };
            row.appendChild(valInput);
        }

        if (cam.type === 'pan' || cam.type === 'cinematicPan') {
            const dirSelect = createSelect(['right', 'left', 'up', 'down'], cam.direction || 'right', (val) => {
                action.cameraAction.direction = val;
                triggerUpdate(idx, 'cameraAction', action.cameraAction);
            });
            dirSelect.className = 'gov-select';
            dirSelect.style.width = '100px';
            row.appendChild(dirSelect);
        }
    }
    return row;
}

function createPlaylistControls(action, idx) {
    const wrapper = document.createElement('div');
    wrapper.className = 'flex-column gap-10 width-100';

    const row = document.createElement('div');
    row.className = 'media-action-row';
    
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn-edit-playlist small';
    editBtn.textContent = 'Edit Playlist Items';
    editBtn.onclick = () => openPlaylistEditor(action, (updatedAction) => {
         triggerUpdate(idx, 'items', action.items);
    });

    row.appendChild(editBtn);
    row.appendChild(createCheckbox('Wait', action.waitForCompletion, (val) => triggerUpdate(idx, 'waitForCompletion', val)));
    row.appendChild(createCheckbox('Crossfade', action.crossfade === true, (val) => triggerUpdate(idx, 'crossfade', val)));
    wrapper.appendChild(row);

    if (action.items && action.items.length > 0) {
        const summary = document.createElement('div');
        summary.className = 'playlist-summary';
        action.items.forEach((item, i) => {
            const itemDiv = document.createElement('div');
            itemDiv.textContent = `${i + 1}. ${item.fileName}`;
            summary.appendChild(itemDiv);
        });
        wrapper.appendChild(summary);
    }
    return wrapper;
}

function createAudioVolumeRow(action, idx) {
    const row = document.createElement('div');
    row.className = 'media-action-row';
    
    const label = document.createElement('span');
    label.className = 'media-motion-label';
    label.style.width = '60px'; 
    label.textContent = 'Volume';
    row.appendChild(label);

    const volInput = document.createElement('input');
    volInput.type = 'number';
    volInput.min = '0';
    volInput.max = '1';
    volInput.step = '0.1';
    volInput.value = action.volume !== undefined ? action.volume : 1.0;
    volInput.className = 'gov-select';
    volInput.style.width = '80px';
    volInput.onchange = (e) => triggerUpdate(idx, 'volume', parseFloat(e.target.value));
    
    row.appendChild(volInput);
    return row;
}

function triggerUpdate(idx, key, val) {
    if (_callbacks.onUpdate) _callbacks.onUpdate(idx, key, val);
}

function createSelect(options, selected, onChange) {
    const select = document.createElement('select');
    options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt.charAt(0).toUpperCase() + opt.slice(1);
        if (opt === selected) o.selected = true;
        select.appendChild(o);
    });
    select.onchange = (e) => onChange(e.target.value);
    return select;
}

function createCheckbox(label, checked, onChange) {
    const lbl = document.createElement('label');
    lbl.className = 'checkbox-label';
    
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!checked;
    box.onchange = (e) => onChange(e.target.checked);
    
    lbl.appendChild(box);
    lbl.appendChild(document.createTextNode(label));
    return lbl;
}

let currentPlaylistAction = null;
let onPlaylistSave = null;

export function openPlaylistEditor(action, onSave) {
    currentPlaylistAction = action;
    onPlaylistSave = onSave;
    if (!action.items) action.items = [];
    const modal = document.getElementById('playlistEditorModal');
    document.getElementById('playlistGlobalDuration').value = action.globalDuration || 2000;
    renderPlaylistItems();
    if (modal) modal.style.display = 'flex';
}

function renderPlaylistItems() {
    const list = document.getElementById('playlistItemsList');
    list.innerHTML = '';
    const items = currentPlaylistAction.items;
    if (items.length === 0) {
        list.innerHTML = '<li style="color:#666; text-align:center; padding:20px;">No items in playlist</li>';
        return;
    }
    items.forEach((item, idx) => {
        const li = document.createElement('li');
        li.className = 'playlist-item-row';
        li.innerHTML = `
            <span class="playlist-index">${idx + 1}</span>
            <select class="pl-type-select gov-select" style="width:80px;">
                <option value="image" ${item.type === 'image' ? 'selected' : ''}>Image</option>
                <option value="video" ${item.type === 'video' ? 'selected' : ''}>Video</option>
            </select>
            <input type="text" value="${item.fileName || ''}" readonly class="playlist-input">
            <button class="small remove-pl-item" style="background:#d9534f; color:white; border:none; padding:5px 10px; border-radius:3px;">x</button>
        `;
        li.querySelector('.pl-type-select').onchange = (e) => { item.type = e.target.value; };
        li.querySelector('.remove-pl-item').onclick = () => { items.splice(idx, 1); renderPlaylistItems(); };
        list.appendChild(li);
    });
}

export function initMediaEditor() {
    document.getElementById('closePlaylistEditorBtn').onclick = () => {
        const modal = document.getElementById('playlistEditorModal');
        if (modal) modal.style.display = 'none';
        if (currentPlaylistAction) {
            currentPlaylistAction.globalDuration = parseInt(document.getElementById('playlistGlobalDuration').value) || 2000;
            if (onPlaylistSave) onPlaylistSave(currentPlaylistAction);
        }
    };
    const addBtn = document.getElementById('addPlaylistItemBtn');
    // Ensure we don't duplicate buttons if init is called multiple times
    if (addBtn && !document.getElementById('addPlaylistVideoBtn')) {
        addBtn.textContent = "+ Add Image";
        addBtn.onclick = () => {
            if (_callbacks.onBrowse) {
                _callbacks.onBrowse('image', (fileName) => {
                     currentPlaylistAction.items.push({ type: 'image', fileName });
                     renderPlaylistItems();
                });
            }
        };
        const addVideoBtn = addBtn.cloneNode(true);
        addVideoBtn.id = 'addPlaylistVideoBtn';
        addVideoBtn.textContent = "+ Add Video";
        addVideoBtn.style.marginLeft = "10px";
        addVideoBtn.onclick = () => {
            if (_callbacks.onBrowse) {
                _callbacks.onBrowse('video', (fileName) => {
                     currentPlaylistAction.items.push({ type: 'video', fileName });
                     renderPlaylistItems();
                });
            }
        };
        addBtn.parentNode.appendChild(addVideoBtn);
    }
}