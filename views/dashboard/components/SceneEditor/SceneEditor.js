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
import { pushSceneUpdate } from './VisualEditorSync.js';

let timeline, properties, visual;

// State
let currentSceneData = [];
let currentSceneInfo = {};
let activeSeriesId = null;
let activeSeriesFolder = null;
let selectedItemIndex = -1;

/**
 * Centralized Save Logic for Page Scenes.
 */
async function handleSceneSave(btn, volume, chapter, pageId, seriesId) {
    if (!btn) return;
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    try {
        const res = await saveSceneData(volume, chapter, pageId, currentSceneData, seriesId);
        if (res.ok) {
            btn.textContent = 'Saved!';
            
            // Show Success Toast
            if (window.GlassToast) {
                window.GlassToast.show('success', 'Saved', 'Scene changes successfully updated.');
            }

            // Notify preview iframe to refresh scene if it's visible
            const iframe = document.getElementById('pagePreviewFrame');
            if (iframe) {
                pushSceneUpdate(iframe, currentSceneData, visual.currentVisualMediaData, pageId);
            }

            setTimeout(() => {
                btn.disabled = false;
                btn.textContent = originalText === 'Saving...' ? 'Save Page Scene' : originalText;
            }, 2000);
        } else {
            throw new Error(res.message);
        }
    } catch (err) {
        alert("Failed to save: " + err.message);
        btn.disabled = false;
        btn.textContent = 'Retry Save';
    }
}


/**
 * Centralized Delete Logic for Page Scene Items.
 */
async function handleSceneDelete(item, volume, chapter, pageId, seriesId) {
    const idx = currentSceneData.findIndex(i => i.id == item.id);
    if (idx === -1) return;

    currentSceneData.splice(idx, 1);
    
    try {
        const res = await saveSceneData(volume, chapter, pageId, currentSceneData, seriesId);
        if (res.ok) {
            // Update Timeline UI
            timeline.setData(currentSceneData, properties.availableCharacters);
            selectedItemIndex = -1;
            document.getElementById('sceneItemEditor')?.classList.add('hidden');
            document.getElementById('sceneItemPlaceholder')?.classList.remove('hidden');

            // Notify preview iframe
            const iframe = document.getElementById('pagePreviewFrame');
            if (iframe) {
                pushSceneUpdate(iframe, currentSceneData, visual.currentVisualMediaData, pageId);
            }
        } else {
            throw new Error(res.message);
        }
    } catch (err) {
        alert("Delete failed: " + err.message);
    }
}

/**
 * Shared helper to return from any editor view back to the active page tools.
 */
async function returnToPageEdit() {
    console.log("[Navigation] Returning to Page Edit...");
    const container = document.getElementById('dashboard');
    if (!container) return;

    // Use the centralized switcher to handle .is-active and .hidden correctly
    await switchToSection('page-builder', container);

    // Clean up spread state
    document.querySelector('.layout-editor')?.classList.remove('is-spread');
    
    // Show specific sub-containers for the "Edit" context within Page Builder
    document.getElementById('editPageContainer')?.classList.remove('hidden');
    document.getElementById('activePageToolbar')?.classList.remove('hidden');
    
    // Hide the top-level mode selection if it's visible
    document.getElementById('pageBuilderModeSelection')?.classList.add('hidden');
    
    // Restore URL state
    if (currentSceneInfo.volume) {
        updateUrlState({ 
            tab: 'page-builder', 
            vol: currentSceneInfo.volume, 
            chap: currentSceneInfo.chapter, 
            page: currentSceneInfo.pageId,
            series: activeSeriesId,
            seriesFolder: activeSeriesFolder
        });
    }
}

import { switchToSection } from '../../studio/js/EventHandlers.js';

/**
 * Main entry point to open the Dialogue/Scene editor.
 */
export async function openSceneEditor(volume, chapter, pageId, mode = 'landscape', seriesId = null) {
    updateUrlState({ tab: 'scene-editor', vol: volume, chap: chapter, page: pageId });

    const container = document.getElementById('dashboard');
    if (container) {
        await switchToSection('scene-editor', container);
    }

    const sceneEditor = document.querySelector('.scene-editor');
    if (sceneEditor) {
        // CRITICAL FIX: Ensure properties manager is pointing to the correct DOM elements

        // in case it was detached by the Visual Editor.
        if (properties) {
            properties.container = sceneEditor;
            properties.form = sceneEditor.querySelector('#sceneItemForm');
        }

        // Setup Header with Save/Close buttons if not present
        const propsPane = sceneEditor.querySelector('.scene-props-pane');
        if (propsPane) {
            let header = propsPane.querySelector('.scene-editor-header');
            if (!header) {
                header = document.createElement('div');
                header.className = 'scene-editor-header';
                propsPane.prepend(header);
            }
            header.innerHTML = `
                <div class="flex-row align-center gap-10">
                    <h4 class="margin-0">Dialogue & Timing</h4>
                    <span class="text-muted font-size-08 uppercase border-dim padding-x-5 border-radius-4">${pageId}</span>
                </div>
                <div class="flex-row gap-10">
                    <button id="saveSceneBtn" class="glass glass-btn glass-btn--primary glass-btn--sm">Save Page Scene</button>
                    <button id="closeSceneEditorBtn" class="glass glass-btn glass-btn--sm glass-btn--ghost">Close &rarr;</button>
                </div>
            `;

            document.getElementById('closeSceneEditorBtn').onclick = returnToPageEdit;

            const saveBtn = document.getElementById('saveSceneBtn');
            saveBtn.onclick = () => handleSceneSave(saveBtn, volume, chapter, pageId, activeSeriesId || seriesId);
        }
    }

    await syncEditorContext(volume, chapter, pageId, seriesId, false);
}

/**
 * Main entry point to open the Visual/Layout editor.
 */
export async function openVisualEditor(volume, chapter, pageId, mode = 'landscape', seriesId = null, seriesFolder = null) {
    if (seriesId) activeSeriesId = seriesId;
    if (seriesFolder) activeSeriesFolder = seriesFolder;

    currentSceneInfo = { volume, chapter, pageId };

    // Sync visual manager context
    if (visual) {
        visual.activeSeriesId = activeSeriesId;
        visual.activeSeriesFolder = activeSeriesFolder;
    }

    const container = document.getElementById('dashboard');
    if (container) {
        await switchToSection('layout-editor', container);
    }

    const layoutEditor = document.querySelector('.layout-editor');
    if (!layoutEditor) {
        console.error("[SceneEditor] CRITICAL: .layout-editor section not found in the DOM!");
        return;
    }

    const previewPane = layoutEditor.querySelector('.preview-pane-flex');
    if (previewPane) {
        if (mode === 'portrait') previewPane.classList.add('portrait-mode');
        else previewPane.classList.remove('portrait-mode');
    }

    const iframe = document.getElementById('pagePreviewFrame');
    if (!iframe) {
        console.error("[SceneEditor] CRITICAL: #pagePreviewFrame not found!");
        return;
    }

    // Load initial data
    await syncEditorContext(volume, chapter, pageId, seriesId, false);

    // Build the URL safely
    const folder = activeSeriesFolder || 'unknown';
    const vol = volume || 'volume-1';
    const chap = chapter || 'chapter-1';
    const pid = pageId || 'page0';
    
    // Use URL object for robust construction
    const targetUrl = new URL(`${window.location.origin}/api/editor/preview/${folder}/${vol}/${chap}/${pid}`);
    targetUrl.searchParams.set('mode', mode);
    
    const targetSrc = targetUrl.href;
    console.log(`[VisualEditor] Loading Preview: ${targetSrc}`);
    iframe.src = targetSrc;

    // Reset visual editor sidebar to "Layout Tools" view
    if (visual) visual.loadPanel({ panel: null, volume, chapter, pageId }, activeSeriesId);
}

/**
 * Syncs all manager data (Scene, Media, Characters) for a specific page.
 * Handles both full loads and silent context switching (spreads).
 */
async function syncEditorContext(volume, chapter, pageId, seriesId, silent = false) {
    console.log(`[SceneEditor] Syncing context for ${pageId}... (Silent: ${silent})`);
    currentSceneInfo = { volume, chapter, pageId };
    
    if (!silent) {
        const titleEl = document.getElementById('sceneEditorPageTitle');
        if (titleEl) titleEl.textContent = `${volume} / ${chapter} / ${pageId} (PORTRAIT)`;
    }

    // Resolve Series Context if needed
    if (!activeSeriesId || (seriesId && activeSeriesId !== seriesId)) {
        try {
            const seriesList = await fetchSeriesAPI();
            let series = seriesId ? seriesList.find(s => s._id === seriesId) : seriesList[0];
            if (series) {
                activeSeriesId = series._id;
                activeSeriesFolder = series.folderName || "No_Overflow";
                if (visual) {
                    visual.activeSeriesId = activeSeriesId;
                    visual.activeSeriesFolder = activeSeriesFolder;
                }
            }
        } catch (e) { console.error("Could not resolve series", e); }
    }

    try {
        const [panelData, scene, characters, mediaRes] = await Promise.all([
            fetchPagePanels(volume, chapter, pageId, activeSeriesId),
            fetchSceneData(volume, chapter, pageId, activeSeriesId),
            activeSeriesId ? fetchCharactersAPI(activeSeriesId) : Promise.resolve([]),
            fetchMedia(volume, chapter, pageId, activeSeriesId)
        ]);

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

        if (visual) {
            visual.currentVisualMediaData = Array.isArray(mediaRes) ? mediaRes : (mediaRes.media || []);
            // Also update visual's internal context to prevent immediate re-sync loops
            visual.currentVisualContext = { volume, chapter, pageId };
        }
        
        // Sync Property Manager
        if (properties) properties.setAvailableData(characters || [], panelData.panels || []);
        
        // Sync Timeline
        if (timeline) timeline.setData(currentSceneData, characters || []);

        const layoutEditor = document.querySelector('.layout-editor');
        if (layoutEditor && !silent) {
            // Use the isSpread boolean from the API response
            const isSpread = !!panelData.isSpread;
            console.log(`[SceneEditor] syncEditorContext: Is Spread: ${isSpread}`);
            layoutEditor.classList.toggle('is-spread', isSpread);
        }

        if (!silent) {
            selectedItemIndex = -1;
            const itemEditor = document.getElementById('sceneItemEditor');
            const itemPlaceholder = document.getElementById('sceneItemPlaceholder');
            if (itemEditor) itemEditor.classList.add('hidden');
            if (itemPlaceholder) itemPlaceholder.classList.remove('hidden');
        }

    } catch (err) {
        console.error("[SceneEditor] Failed to sync data context", err);
    }
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
        activeSeriesFolder,
        () => currentSceneData // getActiveSceneData callback
    );

    // 2. Global Button Handlers
    const closeSceneBtn = document.getElementById('closeSceneEditorBtn');
    if (closeSceneBtn) {
        closeSceneBtn.onclick = async () => await returnToPageEdit();
    }

    const closeEditorBtn = document.getElementById('closeEditorBtn');
    if (closeEditorBtn) {
        closeEditorBtn.onclick = async () => {
            await returnToPageEdit();
            
            // Clean up the tools pane to destroy any cloned dialogue forms and prevent ID conflicts
            const toolsPane = document.querySelector('.layout-editor .tools-pane');
            if (toolsPane) toolsPane.innerHTML = '';
        };
    }

    const addItemBtn = document.getElementById('addItemBtn');
    if (addItemBtn) {
        addItemBtn.onclick = () => {
            const generateId = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Math.random().toString(36).substr(2, 9);
            const newItem = {
                id: generateId(),
                displayOrder: currentSceneData.length,
                displayType: { type: 'SpeechBubble' },
                character: 'New',
                text: 'Text',
                placement: { panel: '.panel-A', bottom: '2%', left: '2%', right: '2%' },
                mediaAction: []
            };
            currentSceneData.push(newItem);
            
            // Update UI list before selecting
            timeline.setData(currentSceneData, properties.availableCharacters);
            selectSceneItem(currentSceneData.length - 1);

            // Notify preview iframe to refresh scene
            const iframe = document.getElementById('pagePreviewFrame');
            if (iframe) {
                pushSceneUpdate(iframe, currentSceneData, visual.currentVisualMediaData, currentSceneInfo.pageId);
            }
        };
    }

    const deleteItemBtn = document.getElementById('deleteItemBtn');
    if (deleteItemBtn) {
        deleteItemBtn.onclick = () => {
            if (selectedItemIndex !== -1 && confirm("Are you sure?")) {
                handleSceneDelete(currentSceneData[selectedItemIndex], currentSceneInfo.volume, currentSceneInfo.chapter, currentSceneInfo.pageId, activeSeriesId);
            }
        };
    }

    const saveSceneBtn = document.getElementById('saveSceneBtn');
    if (saveSceneBtn) {
        saveSceneBtn.onclick = (e) => handleSceneSave(e.target, currentSceneInfo.volume, currentSceneInfo.chapter, currentSceneInfo.pageId, activeSeriesId);
    }

    // 3. Form Input Listening
    const sceneItemForm = document.getElementById('sceneItemForm');
    if (sceneItemForm) {
        sceneItemForm.addEventListener('input', (e) => {
            if (e.target.id?.startsWith('prop-')) {
                if (selectedItemIndex !== -1) {
                    properties.updateItem(currentSceneData[selectedItemIndex]);
                    timeline.render();
                }
            }
        });
    }

    const propType = document.getElementById('prop-type');
    if (propType) {
        propType.addEventListener('change', (e) => {
            if (selectedItemIndex !== -1) {
                properties.toggleVisibility(e.target.value);
                properties.updateItem(currentSceneData[selectedItemIndex]);
                timeline.render();
            }
        });
    }

    // 4. Iframe / Cross-Window Messaging
    window.addEventListener('message', async (e) => {
        if (e.data.type === 'previewReady') {
            const layoutEditor = document.querySelector('.layout-editor');
            if (layoutEditor) {
                console.log(`[SceneEditor] previewReady: Is Spread: ${e.data.isSpread}`);
                layoutEditor.classList.toggle('is-spread', !!e.data.isSpread);
            }

            // Layout is loaded in iframe, refresh directory to catch new panels
            // But if we are currently editing a panel, don't navigate away!
            if (!visual.selectedPanelSelector) {
                visual.loadPanel({ ...currentSceneInfo, panel: null }, activeSeriesId);
            }
        }

        const { pageId, volume, chapter } = e.data;
        
        // --- SPREAD CONTEXT SWITCHING ---
        // If an interaction happens on a partner page, we must switch the global editor context
        if (pageId && pageId !== currentSceneInfo.pageId) {
            const needsSwitch = ['panelSelected', 'dialogueSelected', 'assetUploaded', 'panelDragged', 'dialogueDragged'].includes(e.data.type);
            if (needsSwitch) {
                console.log(`[SceneEditor] Context switch detected: ${currentSceneInfo.pageId} -> ${pageId}`);
                
                // Pass true for 'silent' to prevent the UI from reloading and breaking the spread view
                await syncEditorContext(volume || currentSceneInfo.volume, chapter || currentSceneInfo.chapter, pageId, null, true);
            }
        }

        if (e.data.type === 'panelSelected') {
            // Context switch is already handled by the global spread context checker above
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
            // Use loose equality to handle string/number ID differences
            const index = currentSceneData.findIndex(item => item.id == id);
            if (index === -1) {
                console.warn(`[SceneEditor] Dialogue ID ${id} not found on page ${pageId}`);
                return;
            }

            const item = currentSceneData[index];
            selectedItemIndex = index;

            const layoutEditor = document.querySelector('.layout-editor');
            if (layoutEditor && !layoutEditor.classList.contains('hidden')) {
                visual.showDialogueProperties(item, properties, async () => {
                    await saveSceneData(currentSceneInfo.volume, currentSceneInfo.chapter, currentSceneInfo.pageId, currentSceneData, activeSeriesId);
                }, async (delItem) => {
                    await handleSceneDelete(delItem, currentSceneInfo.volume, currentSceneInfo.chapter, currentSceneInfo.pageId, activeSeriesId);
                });
            } else {
                selectSceneItem(index);
            }
        }

        if (e.data.type === 'dialogueDragged') {
            const { id, placement } = e.data;
            const index = currentSceneData.findIndex(item => item.id == id);
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

    // CRITICAL FIX: Ensure properties manager points to the real Scene Editor form
    // before populating, in case it was detached by the Visual Editor.
    const sceneEditorContainer = document.querySelector('.scene-editor');
    if (properties && sceneEditorContainer && !sceneEditorContainer.classList.contains('hidden')) {
        properties.container = sceneEditorContainer;
        properties.form = sceneEditorContainer.querySelector('#sceneItemForm');
    }

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

