// views/dashboard/js/MediaEditor.js
/**
 * Sequential Comic Server - MediaEditor
 * Static-only version. Removed audio and video properties.
 */

import { openFileBrowser } from '../components/FileBrowser/FileBrowser.js';

let _callbacks = {
    onUpdate: null,
    onRemove: null,
    onBrowse: null 
};

let _context = null;
let _allSceneData = null;
let _currentCueIndex = -1;

export function renderMediaActions(container, actions, callbacks, context, allSceneData = null, cueIndex = -1) {
    container.innerHTML = '';
    _callbacks = callbacks; 
    _context = context; 
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
    if (fileName.startsWith('series://')) return `/Library/${_context.series || 'No_Overflow'}/assets/${type}/${fileName.replace('series://', '')}`;
    if (fileName.startsWith('volume://')) return `/Library/${_context.series || 'No_Overflow'}/Volumes/${_context.volume}/assets/${type}/${fileName.replace('volume://', '')}`;
    
    if (type === 'image') {
        return `/api/images/${_context.series || 'No_Overflow'}/${_context.volume}/${_context.chapter}/${_context.pageId}/assets/${fileName}`;
    }
    return '';
}

function createMediaActionRow(action, idx) {
    const div = document.createElement('div');
    div.className = 'media-action-item';
    
    div.appendChild(createThumbnailColumn(action));

    const contentCol = document.createElement('div');
    contentCol.className = 'media-action-content';
    contentCol.appendChild(createHeaderRow(action, idx));

    if ((!action.action || action.action === 'load') && action.type !== 'Playlist') {
        contentCol.appendChild(createFileControlsRow(action, idx));
        if (action.type === 'image') {
            contentCol.appendChild(createMotionControls(action, idx));
        }
    }

    if (action.type === 'Playlist') {
        contentCol.appendChild(createPlaylistControls(action, idx));
    }

    div.appendChild(contentCol);

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

    if (action.type === 'Playlist' && action.items && action.items.length > 0) {
        fName = action.items[0].fileName;
        type = action.items[0].type;
    }

    let thumbUrl = fName ? getThumbnailUrl(type, fName) : '';

    if (thumbUrl) {
        const img = document.createElement('img');
        img.src = thumbUrl;
        img.onerror = () => { img.style.display = 'none'; col.innerHTML = '<span class="icon-placeholder">?</span>'; };
        col.appendChild(img);
    } else {
        let iconName = 'image-outline';
        if (action.type === 'Playlist') iconName = 'layers-outline';
        col.innerHTML = `<span class="icon-placeholder flex-center width-100 height-100" style="color:#666; font-size:2rem;"><ion-icon name="${iconName}"></ion-icon></span>`;
    }
    return col;
}

function createHeaderRow(action, idx) {
    const row = document.createElement('div');
    row.className = 'media-action-row';

    let currentType = action.type || 'image';
    if (currentType.toLowerCase() === 'playlist') currentType = 'Playlist';

    const typeSelect = createSelect(['image', 'Playlist'], currentType, (val) => triggerUpdate(idx, 'type', val));
    typeSelect.className = 'media-type-label gov-select'; 
    typeSelect.style.width = '120px';

    const panelInput = document.createElement('input');
    panelInput.type = 'text';
    panelInput.value = action.panel || '';
    panelInput.placeholder = 'Panel Selector';
    panelInput.className = 'flex-1 gov-select';
    panelInput.onchange = (e) => triggerUpdate(idx, 'panel', e.target.value);

    const actionSelect = createSelect(['load'], 'load', (val) => triggerUpdate(idx, 'action', val));
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
            _callbacks.onBrowse('image', (val) => {
                fileInput.value = val;
                triggerUpdate(idx, 'fileName', val);
            });
        }
    };

    fileContainer.append(fileInput, browseBtn);
    row.appendChild(fileContainer);

    if (action.type === 'image') {
        row.appendChild(createCheckbox('Crossfade', action.crossfade === true, (val) => triggerUpdate(idx, 'crossfade', val)));
    }
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
                action.cameraAction.duration = 3000;
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
            <input type="text" value="${item.fileName || ''}" readonly class="playlist-input">
            <button class="small remove-pl-item" style="background:#d9534f; color:white; border:none; padding:5px 10px; border-radius:3px;">x</button>
        `;
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
    if (addBtn) {
        addBtn.textContent = "+ Add Image";
        addBtn.onclick = () => {
            if (_callbacks.onBrowse) {
                _callbacks.onBrowse('image', (fileName) => {
                     currentPlaylistAction.items.push({ type: 'image', fileName });
                     renderPlaylistItems();
                });
            }
        };
    }
}