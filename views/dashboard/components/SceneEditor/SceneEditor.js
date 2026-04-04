// views/dashboard/components/SceneEditor/SceneEditor.js
/**
 * Sequential Comic Server - SceneEditor (Modular Orchestrator)
 */

import { 
    fetchSceneData, 
    saveSceneData, 
    fetchPagePanels, 
    fetchSeriesAPI, 
    fetchCharactersAPI, 
    fetchMedia 
} from '../../studio/js/ApiService.js';
import { updateUrlState } from '../../studio/js/Navigation.js';

// Import Sub-Managers
import { TimelineManager } from './TimelineManager.js';
import { PropertyManager } from './PropertyManager.js';
import { VisualEditorManager } from './VisualEditorManager.js';

let timeline, properties, visual;

// State
let currentSceneData = [];
let currentSceneInfo = {};
let activeSeriesId = null;
let activeSeriesFolder = null;
let selectedItemIndex = -1;

/**
 * Main entry point to open the Scene/Dialogue editor.
 */
export async function openSceneEditor(volume, chapter, pageId, mode = 'landscape', seriesId = null) {
    updateUrlState({ tab: 'scene-editor', vol: volume, chap: chapter, page: pageId });
    document.querySelector('.sidebar')?.classList.remove('open');
    document.querySelectorAll('main.main-content .dashboard-section').forEach(s => s.classList.add('hidden'));

    const sceneEditor = document.querySelector('.scene-editor');
    if (sceneEditor) sceneEditor.classList.remove('hidden');

    currentSceneInfo = { volume, chapter, pageId };
    const titleEl = document.getElementById('sceneEditorPageTitle');
    if (titleEl) titleEl.textContent = `${volume} / ${chapter} / ${pageId} (${mode.toUpperCase()})`;

    // Resolve Series Context
    try {
        const seriesList = await fetchSeriesAPI();
        let series;
        if (seriesId) {
            series = seriesList.find(s => s._id === seriesId);
        } else {
            series = seriesList[0];
        }
        if (series) {
            activeSeriesId = series._id;
            activeSeriesFolder = series.folderName || "No_Overflow";
        }
    } catch (e) { console.error("Could not resolve series", e); }

    // Fetch Data
    const [panelData, scene, characters] = await Promise.all([
        fetchPagePanels(volume, chapter, pageId, mode, activeSeriesId),
        fetchSceneData(volume, chapter, pageId, activeSeriesId),
        activeSeriesId ? fetchCharactersAPI(activeSeriesId) : Promise.resolve([])
    ]);

    currentSceneData = scene || [];
    currentSceneData.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

    // Initialize/Update Managers
    timeline.setData(currentSceneData, characters || []);
    properties.setAvailableData(characters || [], panelData.panels || []);

    selectedItemIndex = -1;
    document.getElementById('sceneItemEditor').classList.add('hidden');
    document.getElementById('sceneItemPlaceholder').classList.remove('hidden');
}

/**
 * Main entry point to open the Visual/Layout editor.
 */
export function openVisualEditor(volume, chapter, pageId, mode = 'landscape', seriesId = null, seriesFolder = null) {
    if (seriesId) activeSeriesId = seriesId;
    if (seriesFolder) activeSeriesFolder = seriesFolder;

    document.querySelectorAll('.dashboard-section').forEach(s => s.classList.add('hidden'));
    document.querySelector('.layout-editor').classList.remove('hidden');

    const previewPane = document.querySelector('.layout-editor .preview-pane-flex');
    if (previewPane) {
        if (mode === 'portrait') previewPane.classList.add('portrait-mode');
        else previewPane.classList.remove('portrait-mode');
    }

    const iframe = document.getElementById('pagePreviewFrame');
    if (!iframe) return;

    const targetSrc = `/api/editor/preview/${activeSeriesFolder}/${volume}/${chapter}/${pageId}?mode=${mode}`;
    iframe.src = targetSrc;
}

/**
 * Internal helper to gather all filenames used on the page.
 */
function getActiveAssets() {
    const activeFiles = new Set();
    currentSceneData.forEach(item => {
        if (item.mediaAction) {
            item.mediaAction.forEach(action => { if (action.fileName) activeFiles.add(action.fileName); });
        }
    });
    if (visual.currentVisualMediaData) {
        visual.currentVisualMediaData.forEach(entry => { if (entry.fileName) activeFiles.add(entry.fileName); });
    }
    return Array.from(activeFiles);
}

/**
 * Initialize all editor sub-systems and global event listeners.
 */
export function initSceneEditor() {
    const container = document.querySelector('.scene-editor');
    if (!container) return;

    // 1. Instantiate Managers
    timeline = new TimelineManager(
        container, 
        (index) => selectSceneItem(index), // onSelect
        (newData, newIndex) => { // onReorder
            currentSceneData = newData;
            selectSceneItem(newIndex);
        }
    );

    properties = new PropertyManager(
        container,
        () => { // onUpdate
            if (selectedItemIndex !== -1) {
                properties.updateItem(currentSceneData[selectedItemIndex]);
                timeline.render();
            }
        }
    );

    visual = new VisualEditorManager(
        document.querySelector('.layout-editor'),
        getActiveAssets,
        activeSeriesId
    );

    // 2. Global Button Handlers
    document.getElementById('closeSceneEditorBtn').onclick = () => {
        container.classList.add('hidden');
        document.querySelector('.page-builder').classList.remove('hidden');
    };

    document.getElementById('closeEditorBtn').onclick = () => {
        document.querySelector('.layout-editor').classList.add('hidden');
        document.querySelector('.page-builder').classList.remove('hidden');
    };

    document.getElementById('addItemBtn').onclick = () => {
        const newItem = {
            id: crypto.randomUUID(),
            displayOrder: currentSceneData.length,
            displayType: { type: 'SpeechBubble' },
            character: 'New',
            text: 'Text',
            placement: { panel: '.panel-A', top: '10%', left: '10%' },
            mediaAction: []
        };
        currentSceneData.push(newItem);
        selectSceneItem(currentSceneData.length - 1);
    };

    document.getElementById('deleteItemBtn').onclick = () => {
        if (selectedItemIndex !== -1 && confirm("Are you sure?")) {
            currentSceneData.splice(selectedItemIndex, 1);
            selectedItemIndex = -1;
            document.getElementById('sceneItemEditor').classList.add('hidden');
            document.getElementById('sceneItemPlaceholder').classList.remove('hidden');
            timeline.setData(currentSceneData, properties.availableCharacters);
        }
    };

    document.getElementById('saveSceneBtn').onclick = async (e) => {
        const btn = e.target;
        btn.disabled = true;
        btn.textContent = "Saving...";
        try {
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

    // 3. Form Input Listening
    document.getElementById('sceneItemForm').addEventListener('input', (e) => {
        if (e.target.id?.startsWith('prop-')) {
            if (selectedItemIndex !== -1) {
                properties.updateItem(currentSceneData[selectedItemIndex]);
                timeline.render();
            }
        }
    });

    document.getElementById('prop-type').addEventListener('change', (e) => {
        if (selectedItemIndex !== -1) {
            properties.toggleVisibility(e.target.value);
            properties.updateItem(currentSceneData[selectedItemIndex]);
            timeline.render();
        }
    });

    // 4. Iframe / Cross-Window Messaging
    window.addEventListener('message', (e) => {
        if (e.data.type === 'panelSelected') {
            visual.loadPanel(e.data, activeSeriesId);
        }

        if (e.data.type === 'assetUploaded') {
            const { panel, type, fileName } = e.data;
            visual.updateCache(panel, type, fileName);
        }
    });
}

function selectSceneItem(index) {
    selectedItemIndex = index;
    timeline.setSelectedIndex(index);
    document.getElementById('sceneItemEditor').classList.remove('hidden');
    document.getElementById('sceneItemPlaceholder').classList.add('hidden');
    properties.populate(currentSceneData[index]);
}

// Keeping initVisualEditor for external dashboard call
export function initVisualEditor() {
    // Shared with initSceneEditor but kept for compatibility
}
