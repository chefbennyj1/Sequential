// views/dashboard/js/Navigation.js

import { openSceneEditor } from '../../components/SceneEditor/SceneEditor.js';
import { openVisualEditor } from '../../components/SceneEditor/SceneEditor.js'; // Assuming Visual Editor logic might live here or handled in Main for now
import { populateVolumeSelect, populateLayoutSelect } from './LibraryManager.js';
import { setActivePage } from './PageConfigManager.js';
import { switchToSection } from './EventHandlers.js';

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

export async function restoreStateFromUrl(container) {
    const params = new URLSearchParams(window.location.search);
    let tab = params.get('tab');
    const vol = params.get('vol');
    const chap = params.get('chap');
    const page = params.get('page');
    const series = params.get('series');
    const seriesFolder = params.get('seriesFolder');

    // If no tab in URL, check for the active item in the navigation (default state)
    if (!tab) {
        const activeItem = container.querySelector('.glass-nav__item--active');
        if (activeItem) tab = activeItem.dataset.page;
    }

    if (tab) {
        const item = container.querySelector(`.glass-tab[data-page="${tab}"]`);

        if (item) {
            // Update active state in UI to match current tab
            const nav = item.closest('#main-navigation');
            if (nav) {
                nav.querySelectorAll('.glass-tab').forEach(i => i.classList.remove('glass-nav__item--active'));
                item.classList.add('glass-nav__item--active');
            }
        }

        // Use the centralized switcher (Async/Event-Driven)
        await switchToSection(tab, container);

        // --- Deep Link State Restoration ---
        if (vol && chap && page) {
            console.log(`[Navigation] Deep-linking into: ${tab} (${vol}/${chap}/${page})`);
            
            // Dispatch to registered handlers immediately (The UI is now ready)
            if (tab === 'scene-editor') {
                openSceneEditor(vol, chap, page, 'portrait', series);
            } else if (tab === 'layout-editor') {
                openVisualEditor(vol, chap, page, 'portrait', series, seriesFolder);
            } else if (tab === 'page-builder' && _handlers.setActivePage) {
                _handlers.setActivePage(vol, chap, page, series, seriesFolder);
            }
        }
    }
}

export function getFolderNameFromPath(vPath) {
    if (!vPath) return 'unknown';
    const parts = vPath.split(/[\\/]/).filter(p => p.length > 0);
    return parts.length > 0 ? parts[parts.length - 1] : 'unknown';
}
