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
} from '../../studio/api/StudioClient.js';
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
    const [panelData, scene, characters, mediaRes] = await Promise.all([
        fetchPagePanels(volume, chapter, pageId, mode, activeSeriesId),
        fetchSceneData(volume, chapter, pageId, activeSeriesId),
        activeSeriesId ? fetchCharactersAPI(activeSeriesId) : Promise.resolve([]),
        fetchMedia(volume, chapter, pageId, activeSeriesId)
    ]);

    // Sync Visual Manager Cache for Palette Tool
    if (visual) {
        visual.currentVisualMediaData = Array.isArray(mediaRes) ? mediaRes : (mediaRes.media || []);
    }

    currentSceneData = scene || [];
    currentSceneData.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

    // Detect Orphans
    const panelNames = panelData.panels || [];
    currentSceneData.forEach(item => {
        if (item.displayType.type === 'SpeechBubble' || (item.displayType.type === 'TextBlock' && item.placement?.panel)) {
            const target = item.placement?.panel;
            item.isOrphaned = target && !panelNames.includes(target);
        }
    });

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
export async function openVisualEditor(volume, chapter, pageId, mode = 'landscape', seriesId = null, seriesFolder = null) {
    if (seriesId) activeSeriesId = seriesId;
    if (seriesFolder) activeSeriesFolder = seriesFolder;

    const previousPageId = currentSceneInfo.pageId;
    currentSceneInfo = { volume, chapter, pageId };

    // Sync visual manager context
    if (visual) {
        visual.activeSeriesId = activeSeriesId;
        visual.activeSeriesFolder = activeSeriesFolder;
    }

    document.querySelectorAll('.dashboard-section').forEach(s => s.classList.add('hidden'));
    document.querySelector('.layout-editor').classList.remove('hidden');

    const previewPane = document.querySelector('.layout-editor .preview-pane-flex');
    if (previewPane) {
        if (mode === 'portrait') previewPane.classList.add('portrait-mode');
        else previewPane.classList.remove('portrait-mode');
    }

    const iframe = document.getElementById('pagePreviewFrame');
    if (!iframe) return;

    // --- NEW: Load Data for the Visual Editor if it's not already cached or if the page changed ---
    if (currentSceneData.length === 0 || previousPageId !== pageId) {
        console.log(`[VisualEditor] Fetching fresh data for ${pageId}...`);
        try {
            const [panelData, scene, characters, mediaRes] = await Promise.all([
                fetchPagePanels(volume, chapter, pageId, mode, activeSeriesId),
                fetchSceneData(volume, chapter, pageId, activeSeriesId),
                activeSeriesId ? fetchCharactersAPI(activeSeriesId) : Promise.resolve([]),
                fetchMedia(volume, chapter, pageId, activeSeriesId)
            ]);

            currentSceneData = scene || [];
            if (visual) visual.currentVisualMediaData = Array.isArray(mediaRes) ? mediaRes : (mediaRes.media || []);
            
            // Sync Property Manager
            if (properties) properties.setAvailableData(characters || [], panelData.panels || []);
            
            // Sync Timeline (even though hidden, it's the data source)
            if (timeline) timeline.setData(currentSceneData, characters || []);

        } catch (err) {
            console.error("[VisualEditor] Failed to load data context", err);
        }
    }

    const targetSrc = `/api/editor/preview/${activeSeriesFolder}/${volume}/${chapter}/${pageId}?mode=${mode}`;
    iframe.src = targetSrc;

    // Reset visual editor sidebar to "Layout Tools" view
    visual.loadPanel({ panel: null, volume, chapter, pageId }, activeSeriesId);
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
        },
        (index) => duplicateSceneItem(index) // onDuplicate
    );

    properties = new PropertyManager(
        container,
        () => { // onUpdate
            if (selectedItemIndex !== -1) {
                properties.updateItem(currentSceneData[selectedItemIndex]);
                timeline.render();
            }
        },
        (selector) => {
            if (!visual.currentVisualMediaData) return null;
            const entry = visual.currentVisualMediaData.find(m => m.panel === selector);
            if (!entry || !entry.fileName) return null;
            const { volume, chapter, pageId } = currentSceneInfo;
            const series = activeSeriesFolder || activeSeriesId;
            return `/api/images/${series}/${volume}/${chapter}/${pageId}/assets/${entry.fileName}`;
        }
    );

    visual = new VisualEditorManager(
        document.querySelector('.layout-editor'),
        getActiveAssets,
        activeSeriesId,
        activeSeriesFolder
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
            placement: { panel: '.panel-A', bottom: '2%', left: '2%', right: '2%' },
            mediaAction: []
        };
        currentSceneData.push(newItem);
        selectSceneItem(currentSceneData.length - 1);

        // Notify preview iframe to refresh scene
        const iframe = document.getElementById('pagePreviewFrame');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'refreshScene' }, '*');
        }
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

                // Notify preview iframe to refresh scene
                const iframe = document.getElementById('pagePreviewFrame');
                if (iframe && iframe.contentWindow) {
                    iframe.contentWindow.postMessage({ type: 'refreshScene' }, '*');
                }

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
        if (e.data.type === 'previewReady') {
            // Layout is loaded in iframe, refresh directory to catch new panels
            // But if we are currently editing a panel, don't navigate away!
            if (!visual.selectedPanelSelector) {
                visual.loadPanel({ ...currentSceneInfo, panel: null }, activeSeriesId);
            }
        }

        if (e.data.type === 'panelSelected') {
            visual.loadPanel(e.data, activeSeriesId);
        }

        if (e.data.type === 'assetUploaded') {
            const { panel, type, fileName } = e.data;
            visual.updateCache(panel, type, fileName);
        }

        if (e.data.type === 'panelDragged') {
            visual.updatePosition(e.data);
        }

        if (e.data.type === 'dialogueSelected') {
            const id = e.data.id;
            const index = currentSceneData.findIndex(item => item.id === id);
            if (index === -1) return;

            const item = currentSceneData[index];
            selectedItemIndex = index; // CRITICAL: Update the selection state

            // If we are currently in the Visual/Layout editor, show properties IN the visual sidebar
            const layoutEditor = document.querySelector('.layout-editor');
            if (layoutEditor && !layoutEditor.classList.contains('hidden')) {
                visual.showDialogueProperties(item, properties, async () => {
                    // Logic to save the scene data from within the visual editor context
                    await saveSceneData(currentSceneInfo.volume, currentSceneInfo.chapter, currentSceneInfo.pageId, currentSceneData, activeSeriesId);
                });
            } else {
                // Otherwise, perform the standard scene editor selection
                selectSceneItem(index);
            }
        }

        if (e.data.type === 'dialogueDragged') {
            const { id, placement } = e.data;
            const index = currentSceneData.findIndex(item => item.id === id);
            if (index !== -1) {
                Object.assign(currentSceneData[index].placement, placement);
                // If the dragged item is currently selected, update the property inputs in real-time
                if (selectedItemIndex === index) {
                    properties.populate(currentSceneData[index]);
                }
            }
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

function duplicateSceneItem(index) {
    const original = currentSceneData[index];
    if (!original) return;

    // Deep clone the item
    const newItem = JSON.parse(JSON.stringify(original));
    
    // Assign new unique ID and adjust display order
    newItem.id = crypto.randomUUID();
    newItem.displayOrder = index + 1;
    
    // Insert after the original
    currentSceneData.splice(index + 1, 0, newItem);
    
    // Re-index display orders
    currentSceneData.forEach((itm, i) => itm.displayOrder = i);
    
    // Update UI
    timeline.setData(currentSceneData, properties.availableCharacters);
    selectSceneItem(index + 1);
}

// Keeping initVisualEditor for external dashboard call
export function initVisualEditor() {
    // Shared with initSceneEditor but kept for compatibility
}
