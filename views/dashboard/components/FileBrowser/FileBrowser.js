// views/dashboard/js/FileBrowser.js

import { fetchPageAssets, uploadAsset } from '../../js/ApiService.js';

let fileBrowserCallback = null;
let fileBrowserCurrentType = 'image'; // 'image', 'video', 'audio'
let currentContext = { series: null, volume: null, chapter: null, pageId: null };
let currentActiveFiles = [];
let allFiles = []; // Raw list from server: Array of { name, mtime }

export async function openFileBrowser(type, volume, chapter, pageId, callback, initialScope = 'page', series = null, activeFiles = []) {
    if (!volume || !chapter || !pageId) {
        alert("No active page context.");
        return;
    }

    currentContext = { series, volume, chapter, pageId };
    currentActiveFiles = activeFiles;
    fileBrowserCallback = callback;
    fileBrowserCurrentType = type;

    const modal = document.getElementById('fileBrowserModal');
    const uploadInput = document.getElementById('fileBrowserUploadInput');
    const scopeSelect = document.getElementById('fbScopeSelect');
    const searchInput = document.getElementById('fbSearchInput');

    if (modal) {
        modal.classList.add('active');
        uploadInput.accept = type === 'image' ? 'image/*' : (type === 'audio' ? 'audio/*' : 'video/*');
        
        // Reset filters
        if (searchInput) searchInput.value = '';
        if (scopeSelect) scopeSelect.value = initialScope; // Use initialScope
        
        // Refresh list
        await refreshFileBrowser();
    }
}

async function refreshFileBrowser() {
    const grid = document.getElementById('fileBrowserGrid');
    const status = document.getElementById('fileBrowserStatus');
    const scope = document.getElementById('fbScopeSelect').value;

    grid.innerHTML = '<p class="text-muted">Loading...</p>';
    status.textContent = `Browsing ${fileBrowserCurrentType}s (${scope})...`;

    const data = await fetchPageAssets(
        currentContext.volume, 
        currentContext.chapter, 
        currentContext.pageId, 
        fileBrowserCurrentType,
        scope
    );

    if (data.ok) {
        allFiles = data.files || [];
        applyFiltersAndSort();
    } else {
        grid.innerHTML = `<p class="text-accent">Error: ${data.message}</p>`;
        allFiles = [];
    }
}

function applyFiltersAndSort() {
    const searchInput = document.getElementById('fbSearchInput');
    const sortSelect = document.getElementById('fbSortSelect');
    
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const sortBy = sortSelect ? sortSelect.value : 'date';
    
    let filtered = allFiles.filter(f => f.name.toLowerCase().includes(searchTerm));

    if (sortBy === 'date') {
        filtered.sort((a, b) => b.mtime - a.mtime);
    } else {
        filtered.sort((a, b) => a.name.localeCompare(b.name));
    }

    renderFileBrowserGrid(filtered);
}

function renderFileBrowserGrid(files) {
    const grid = document.getElementById('fileBrowserGrid');
    const scope = document.getElementById('fbScopeSelect').value;
    grid.innerHTML = '';

    if (files.length === 0) {
        grid.innerHTML = '<p class="text-muted">No files found.</p>';
        return;
    }

    files.forEach(file => {
        const div = document.createElement('div');
        div.className = 'file-browser-item';
        if (currentActiveFiles.includes(file.name)) {
            div.classList.add('active');
        }
        div.title = file.name;

        let assetUrl = '';
        let preview = '';
        const series = currentContext.series || 'No_Overflow';

        // Construct URL based on Scope
        if (scope === 'page') {
            if (fileBrowserCurrentType === 'image') {
                assetUrl = `/api/images/${series}/${currentContext.volume}/${currentContext.chapter}/${currentContext.pageId}/assets/${file.name}`;
            } else if (fileBrowserCurrentType === 'video') {
                assetUrl = `/api/thumbnails/video/${series}/${currentContext.volume}/${currentContext.chapter}/${currentContext.pageId}/${file.name}`;
            } else if (fileBrowserCurrentType === 'audio') {
                assetUrl = `/api/audio/${series}/${currentContext.volume}/${currentContext.chapter}/${currentContext.pageId}/assets/${file.name}`;
            }
        } else if (scope === 'series') {
            assetUrl = `/Library/No_Overflow/assets/${fileBrowserCurrentType}/${file.name}`;
        } else if (scope === 'volume') {
             assetUrl = `/Library/No_Overflow/Volumes/${currentContext.volume}/assets/${fileBrowserCurrentType}/${file.name}`;
        } else if (scope === 'global') {
            assetUrl = `/resources/audio/${file.name}`;
        }

        // Preview logic
        if (fileBrowserCurrentType === 'image') {
            preview = `
                <div class="preview-container">
                    <img src="${assetUrl}" onerror="this.classList.add('asset-preview-hidden'); this.nextElementSibling.classList.remove('asset-preview-hidden');">
                    <div class="asset-preview-fallback asset-preview-hidden">
                        <ion-icon name="image-outline" class="asset-preview-icon"></ion-icon>
                    </div>
                </div>`;
        } else if (fileBrowserCurrentType === 'video') {
            preview = `
                <div class="preview-container">
                    <img src="${assetUrl}" 
                         class="asset-preview-video asset-preview-hidden"
                         onload="this.classList.remove('asset-preview-hidden'); this.nextElementSibling.classList.add('asset-preview-hidden');"
                         onerror="this.classList.add('asset-preview-hidden'); this.nextElementSibling.classList.remove('asset-preview-hidden');">
                    <div class="asset-preview-video-container">
                        <ion-icon name="videocam-outline" class="asset-preview-icon"></ion-icon>
                    </div>
                </div>`;
        } else if (fileBrowserCurrentType === 'audio') {
            preview = `<div class="preview-container"><ion-icon name="musical-notes-outline" class="asset-preview-icon"></ion-icon></div>`;
        }

        div.innerHTML = `${preview}<div class="file-name">${file.name}</div>`;
        
        div.onclick = () => { 
            // Return filename with scope prefix if not page scope?
            let returnValue = file.name;
            if (scope === 'series') returnValue = `series://${file.name}`;
            if (scope === 'volume') returnValue = `volume://${file.name}`;
            if (scope === 'global') returnValue = `global://${file.name}`;

            if (fileBrowserCallback) fileBrowserCallback(returnValue); 
            closeFileBrowser(); 
        };
        grid.appendChild(div);
    });
}

export function closeFileBrowser() {
    const modal = document.getElementById('fileBrowserModal');
    if (modal) modal.classList.remove('active');
    fileBrowserCallback = null;
}

export function initFileBrowser() {
    document.getElementById('closeFileBrowserBtn').onclick = closeFileBrowser;
    
    const scopeSelect = document.getElementById('fbScopeSelect');
    const searchInput = document.getElementById('fbSearchInput');
    const sortSelect = document.getElementById('fbSortSelect');

    if (scopeSelect) scopeSelect.onchange = refreshFileBrowser;
    if (searchInput) searchInput.oninput = applyFiltersAndSort;
    if (sortSelect) sortSelect.onchange = applyFiltersAndSort;

    document.getElementById('fileBrowserUploadInput').onchange = async e => {
        const file = e.target.files[0]; 
        if (!file) return; 
        
        const status = document.getElementById('fileBrowserStatus'); 
        status.textContent = "Uploading...";
        
        const currentScope = scopeSelect.value; // Get current scope

        const fd = new FormData(); 
        fd.append('volume', currentContext.volume); 
        fd.append('chapter', currentContext.chapter); 
        fd.append('pageId', currentContext.pageId); 
        fd.append('panel', 'upload'); 
        fd.append('scope', currentScope); // Pass scope to API
        fd.append('asset', file);
        
        const data = await uploadAsset(fd);
        if (data.ok) {
            await refreshFileBrowser();
        } else {
            status.textContent = "Error: " + data.message;
        }
    };
}
