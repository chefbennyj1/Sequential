// views/dashboard/components/SceneEditor/SceneEditor.js
/**
 * Sequential Comic Server - SceneEditor (Modular Orchestrator)
 * Entry points: openVisualEditor (layout-editor section)
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
import { activatePageBuilderPane } from '../../studio/js/PageBuilderModes.js';
import { switchToSection } from '../../studio/js/EventHandlers.js';
import { fireEditorHook } from '../../studio/js/PluginHooks.js';

// Sub-Managers
import { TimelineManager } from './TimelineManager.js';
import { PropertyManager } from './PropertyManager.js';
import { VisualEditorManager } from './VisualEditorManager.js';
import { pushSceneUpdate } from './VisualEditorSync.js';

let timeline, properties, visual;

// Page state
let currentSceneData = [];
let currentSceneInfo = {};
let activeSeriesId = null;
let activeSeriesFolder = null;

/**
 * Delete a scene item, persist, and refresh the timeline.
 */
async function handleSceneDelete(item, volume, chapter, pageId, seriesId) {
    const idx = currentSceneData.findIndex(i => i.id == item.id);
    if (idx === -1) return;

    currentSceneData.splice(idx, 1);

    try {
        const res = await saveSceneData(volume, chapter, pageId, currentSceneData, seriesId);
        if (res.ok) {
            timeline.setData(currentSceneData, properties.availableCharacters);
            const iframe = document.getElementById('pagePreviewFrame');
            if (iframe) pushSceneUpdate(iframe, currentSceneData, visual.currentVisualMediaData, pageId);
        } else {
            throw new Error(res.message);
        }
    } catch (err) {
        alert("Delete failed: " + err.message);
    }
}

/**
 * Return from the visual editor back to the page builder.
 */
async function returnToPageEdit() {
    const container = document.getElementById('dashboard');
    if (!container) return;

    await switchToSection('page-builder', container);

    document.querySelector('.layout-editor')?.classList.remove('is-spread');
    activatePageBuilderPane('editPageContainer');
    document.getElementById('activePageToolbar')?.classList.remove('hidden');

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

/**
 * Open the Visual/Layout editor for a given page.
 */
export async function openVisualEditor(volume, chapter, pageId, mode = 'landscape', seriesId = null, seriesFolder = null) {
    if (seriesId) activeSeriesId = seriesId;
    if (seriesFolder) activeSeriesFolder = seriesFolder;

    currentSceneInfo = { volume, chapter, pageId };

    if (visual) {
        visual.activeSeriesId = activeSeriesId;
        visual.activeSeriesFolder = activeSeriesFolder;
    }

    const container = document.getElementById('dashboard');
    if (container) await switchToSection('layout-editor', container);

    // Mirror the open page into the URL so refresh and post-login return land here
    updateUrlState({
        tab: 'layout-editor',
        vol: volume,
        chap: chapter,
        page: pageId,
        series: activeSeriesId,
        seriesFolder: activeSeriesFolder,
        mode
    });

    const layoutEditor = document.querySelector('.layout-editor');
    if (!layoutEditor) {
        console.error("[SceneEditor] .layout-editor not found in DOM");
        return;
    }

    const previewPane = layoutEditor.querySelector('.preview-pane-flex');
    if (previewPane) {
        previewPane.classList.toggle('portrait-mode', mode === 'portrait');
    }

    const iframe = document.getElementById('pagePreviewFrame');
    if (!iframe) {
        console.error("[SceneEditor] #pagePreviewFrame not found");
        return;
    }

    await syncEditorContext(volume, chapter, pageId, seriesId, false);

    const folder = activeSeriesFolder || 'unknown';
    const targetUrl = new URL(`${window.location.origin}/api/editor/preview/${folder}/${volume || 'volume-1'}/${chapter || 'chapter-1'}/${pageId || 'page0'}`);
    targetUrl.searchParams.set('mode', mode);
    iframe.src = targetUrl.href;

    if (visual) visual.loadPanel({ panel: null, volume, chapter, pageId }, activeSeriesId);
}

/**
 * Sync scene data, media, and characters for the current page into all managers.
 */
async function syncEditorContext(volume, chapter, pageId, seriesId, silent = false) {
    currentSceneInfo = { volume, chapter, pageId };

    if (!activeSeriesId || (seriesId && activeSeriesId !== seriesId)) {
        try {
            const seriesList = await fetchSeriesAPI();
            const series = seriesId ? seriesList.find(s => s._id === seriesId) : seriesList[0];
            if (series) {
                activeSeriesId = series._id;
                activeSeriesFolder = series.folderName || 'No_Overflow';
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

        currentSceneData = (scene || []).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

        // Flag orphaned dialogue items
        const panelNames = panelData.panels || [];
        currentSceneData.forEach(item => {
            if (item.displayType.type === 'SpeechBubble' || (item.displayType.type === 'TextBlock' && item.placement?.panel)) {
                item.isOrphaned = !!(item.placement?.panel && !panelNames.includes(item.placement.panel));
            }
        });

        if (visual) {
            visual.currentVisualMediaData = Array.isArray(mediaRes) ? mediaRes : (mediaRes.media || []);
            visual.currentVisualContext = { volume, chapter, pageId };
        }

        if (properties) properties.setAvailableData(characters || [], panelNames);
        if (timeline) timeline.setData(currentSceneData, characters || []);

        // Fire-and-forget: notify subscribed plugins that a page opened
        if (!silent) {
            fireEditorHook('page-open', {
                series: activeSeriesId,
                seriesFolder: activeSeriesFolder,
                volume,
                chapter,
                pageId,
                scene: currentSceneData,
                characters: characters || []
            });
        }

        const layoutEditor = document.querySelector('.layout-editor');
        if (layoutEditor && !silent) {
            layoutEditor.classList.toggle('is-spread', !!panelData.isSpread);
        }

    } catch (err) {
        console.error("[SceneEditor] Failed to sync context", err);
    }
}

/**
 * Collect all asset filenames referenced on the current page.
 */
function getActiveAssets() {
    const activeFiles = new Set();
    currentSceneData.forEach(item => {
        item.mediaAction?.forEach(action => { if (action.fileName) activeFiles.add(action.fileName); });
    });
    visual.currentVisualMediaData?.forEach(entry => { if (entry.fileName) activeFiles.add(entry.fileName); });
    return Array.from(activeFiles);
}

/**
 * Duplicate a scene item and select the copy.
 */
function duplicateSceneItem(index) {
    const original = currentSceneData[index];
    if (!original) return;

    const newItem = JSON.parse(JSON.stringify(original));
    newItem.id = crypto.randomUUID();
    newItem.displayOrder = index + 1;

    currentSceneData.splice(index + 1, 0, newItem);
    currentSceneData.forEach((itm, i) => itm.displayOrder = i);

    timeline.setData(currentSceneData, properties.availableCharacters);
    visual.selectSceneItem(index + 1);
}

/**
 * Initialize all editor sub-systems. Called once when layout-editor fragment loads.
 */
export function initSceneEditor() {
    const layoutEditor = document.querySelector('.layout-editor');
    if (!layoutEditor) return;

    // Already initialized — managers exist and window/DOM listeners are attached.
    // Re-running would stack duplicate 'message' and timeline listeners.
    if (visual) return;

    // Instantiate managers
    timeline = new TimelineManager(
        layoutEditor,
        (index) => visual.selectSceneItem(index),
        (newData, newIndex) => {
            currentSceneData = newData;
            visual.selectSceneItem(newIndex);
            saveSceneData(currentSceneInfo.volume, currentSceneInfo.chapter, currentSceneInfo.pageId, currentSceneData, activeSeriesId).then(() => {
                const iframe = document.getElementById('pagePreviewFrame');
                if (iframe) pushSceneUpdate(iframe, currentSceneData, visual.currentVisualMediaData, currentSceneInfo.pageId);
            });
        },
        (index) => {
            duplicateSceneItem(index);
            saveSceneData(currentSceneInfo.volume, currentSceneInfo.chapter, currentSceneInfo.pageId, currentSceneData, activeSeriesId).then(() => {
                const iframe = document.getElementById('pagePreviewFrame');
                if (iframe) pushSceneUpdate(iframe, currentSceneData, visual.currentVisualMediaData, currentSceneInfo.pageId);
            });
        }
    );

    properties = new PropertyManager(
        document.body,
        () => {}, // overridden by renderDialogueProperties when dialogue editor is open
        (selector) => {
            if (!visual?.currentVisualMediaData) return null;
            const entry = visual.currentVisualMediaData.find(m => m.panel === selector);
            if (!entry?.fileName) return null;
            const { volume, chapter, pageId } = currentSceneInfo;
            return `/api/images/${activeSeriesFolder || activeSeriesId}/${volume}/${chapter}/${pageId}/assets/${entry.fileName}`;
        }
    );

    visual = new VisualEditorManager(
        layoutEditor,
        getActiveAssets,
        activeSeriesId,
        activeSeriesFolder,
        () => currentSceneData
    );

    visual.timeline = timeline;
    visual.properties = properties;

    // Plugin annotations: clicking an entry selects the flagged scene item
    layoutEditor.addEventListener('glass:annotation:select', (e) => {
        const index = currentSceneData.findIndex(item => item.id == e.detail.targetId);
        if (index !== -1) visual.selectSceneItem(index);
    });

    // Close button (visual editor header)
    const closeEditorBtn = document.getElementById('closeEditorBtn');
    if (closeEditorBtn) {
        closeEditorBtn.onclick = async () => {
            if (window.GlassAnnotations) window.GlassAnnotations.clear();
            await returnToPageEdit();
            const toolsPane = document.querySelector('.layout-editor .tools-pane');
            if (toolsPane) toolsPane.innerHTML = '';
        };
    }

    // Iframe / cross-window messaging
    window.addEventListener('message', async (e) => {
        if (e.data.type === 'previewReady') {
            const le = document.querySelector('.layout-editor');
            if (le) le.classList.toggle('is-spread', !!e.data.isSpread);
            if (!visual.selectedPanelSelector) {
                visual.loadPanel({ ...currentSceneInfo, panel: null }, activeSeriesId);
            }
        }

        const { pageId, volume, chapter } = e.data;

        // Spread: context-switch when a partner page fires an interaction
        if (pageId && pageId !== currentSceneInfo.pageId) {
            const needsSwitch = ['panelSelected', 'dialogueSelected', 'assetUploaded', 'panelDragged', 'dialogueDragged'].includes(e.data.type);
            if (needsSwitch) {
                await syncEditorContext(volume || currentSceneInfo.volume, chapter || currentSceneInfo.chapter, pageId, null, true);
            }
        }

        if (e.data.type === 'panelSelected') visual.loadPanel(e.data, activeSeriesId);

        if (e.data.type === 'assetUploaded') visual.updateCache(e.data.panel, e.data.type, e.data.fileName);

        if (e.data.type === 'panelDragged') visual.updatePosition(e.data);

        if (e.data.type === 'dialogueSelected') {
            const index = currentSceneData.findIndex(item => item.id == e.data.id);
            if (index === -1) {
                console.warn(`[SceneEditor] Dialogue ID ${e.data.id} not found on page ${pageId}`);
                return;
            }
            visual.showDialogueProperties(currentSceneData[index], properties,
                async () => {
                    const result = await saveSceneData(currentSceneInfo.volume, currentSceneInfo.chapter, currentSceneInfo.pageId, currentSceneData, activeSeriesId);
                    if (result.ok) {
                        // Fire-and-forget: let subscribed plugins scan the saved dialogue
                        fireEditorHook('scene-saved', {
                            series: activeSeriesId,
                            seriesFolder: activeSeriesFolder,
                            volume: currentSceneInfo.volume,
                            chapter: currentSceneInfo.chapter,
                            pageId: currentSceneInfo.pageId,
                            scene: currentSceneData,
                            characters: properties.availableCharacters || []
                        });
                    }
                    return result;
                },
                async (delItem) => handleSceneDelete(delItem, currentSceneInfo.volume, currentSceneInfo.chapter, currentSceneInfo.pageId, activeSeriesId)
            );
        }

        if (e.data.type === 'dialogueDragged') {
            const { id, placement } = e.data;
            const index = currentSceneData.findIndex(item => item.id == id);
            if (index !== -1) {
                Object.assign(currentSceneData[index].placement, placement);
                // If dialogue properties panel is open, update inputs in real-time
                if (properties.form) properties.populate(currentSceneData[index]);
            }
        }
    });
}
