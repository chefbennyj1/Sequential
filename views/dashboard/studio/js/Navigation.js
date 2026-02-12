// views/dashboard/js/Navigation.js

import { openSceneEditor } from '../../components/SceneEditor/SceneEditor.js';
import { openVisualEditor } from '../../components/SceneEditor/SceneEditor.js'; // Assuming Visual Editor logic might live here or handled in Main for now
import { populateVolumeSelect, populateLayoutSelect } from './LibraryManager.js';
import { setActivePage } from './PageConfigManager.js';

// We need a way to call functions that might not be imported yet if we have circular deps.
// For now, we will assume the Main Dashboard will handle the "Router" logic or we expose setters.
let _handlers = {};

export function registerNavigationHandlers(handlers) {
    _handlers = { ..._handlers, ...handlers };
}

export function updateUrlState(params) {
    const url = new URL(window.location);
    url.search = '';
    Object.keys(params).forEach(key => {
        if (params[key]) url.searchParams.set(key, params[key]);
    });
    window.history.pushState({}, '', url);
}

export function restoreStateFromUrl(container) {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const vol = params.get('vol');
    const chap = params.get('chap');
    const page = params.get('page');

    if (tab) {
        const li = container.querySelector(`.sidebar li[data-page="${tab}"]`);
        if (li) li.click();

        if (vol && chap && page) {
            setTimeout(() => {
                // Dispatch to registered handlers
                if (tab === 'scene-editor' && _handlers.openSceneEditor) _handlers.openSceneEditor(vol, chap, page);
                else if (tab === 'layout-editor' && _handlers.openVisualEditor) _handlers.openVisualEditor(vol, chap, page);
                if (tab === 'page-builder' && _handlers.setActivePage) _handlers.setActivePage(vol, chap, page);
            }, 100);
        }
    }
}

export function getFolderNameFromPath(vPath) {
    if (!vPath) return 'unknown';
    const parts = vPath.split(/[\\/]/).filter(p => p.length > 0);
    return parts.length > 0 ? parts[parts.length - 1] : 'unknown';
}
