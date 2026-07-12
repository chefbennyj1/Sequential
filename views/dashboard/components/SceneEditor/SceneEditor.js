// views/dashboard/components/SceneEditor/SceneEditor.js
/**
 * Sequential Comic Server - SceneEditor (Modular Orchestrator)
 * Entry points: openVisualEditor (layout-editor section)
 */

import {
    fetchSceneData,
    saveSceneData,
    adoptServerScene,
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
 * Takes the scene array and page context as a captured pair so the delete
 * always writes the array back to the page it belongs to, even if the editor
 * has context-switched (spread partner click, page navigation) since the
 * dialogue form opened.
 */
async function handleSceneDelete(item, sceneArr, info) {
    const idx = sceneArr.findIndex(i => i.id == item.id);
    if (idx === -1) return;

    sceneArr.splice(idx, 1);
    sceneArr.forEach((itm, i) => itm.displayOrder = i);

    try {
        const res = await saveSceneData(info.volume, info.chapter, info.pageId, sceneArr, info.seriesId);
        if (res.ok) {
            if (res.scene) adoptServerScene(sceneArr, res.scene);
            if (sceneArr === currentSceneData) {
                timeline.setData(currentSceneData, properties.availableCharacters);
                const iframe = document.getElementById('pagePreviewFrame');
                if (iframe) pushSceneUpdate(iframe, currentSceneData, visual.currentVisualMediaData, info.pageId);
            }
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

        // Build everything locally first, then commit in one block below.
        // A throw between partial assignments used to leave the editor
        // split-brained: context pointing at the new page while the timeline
        // still held the old page's items — the next save then wrote the old
        // page's dialogue into the new page's file.
        const newSceneData = (scene || []).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

        // Flag orphaned dialogue items (guard displayType: items written by
        // external scripts may not have one)
        const panelNames = panelData.panels || [];
        newSceneData.forEach(item => {
            const type = item.displayType?.type;
            if (type === 'SpeechBubble' || (type === 'TextBlock' && item.placement?.panel)) {
                item.isOrphaned = !!(item.placement?.panel && !panelNames.includes(item.placement.panel));
            }
        });

        // --- Atomic commit ---
        currentSceneData = newSceneData;

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
        // Fail safe: never leave the previous page's items where a save could
        // write them into this page's file.
        currentSceneData = [];
        if (visual) {
            visual.currentVisualMediaData = [];
            visual.currentVisualContext = { volume, chapter, pageId };
        }
        if (timeline) timeline.setData(currentSceneData, properties?.availableCharacters || []);
        if (window.GlassToast) {
            window.GlassToast.show('error', 'Page Sync Failed', 'Could not load this page\'s dialogue. Reopen the page before editing.');
        }
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
    // Persist the given scene array to the given page, adopt the canonical ids
    // the server returns, and refresh the preview. Array and context travel as a
    // captured pair so a mid-flight context switch cannot redirect the write.
    const persistScene = (sceneArr, info) => {
        return saveSceneData(info.volume, info.chapter, info.pageId, sceneArr, activeSeriesId).then((res) => {
            if (res?.ok && res.scene) adoptServerScene(sceneArr, res.scene);
            const iframe = document.getElementById('pagePreviewFrame');
            if (iframe) pushSceneUpdate(iframe, sceneArr, visual.currentVisualMediaData, info.pageId);
            return res;
        });
    };

    timeline = new TimelineManager(
        layoutEditor,
        (index) => visual.selectSceneItem(index),
        (newData, newIndex) => {
            currentSceneData = newData;
            visual.selectSceneItem(newIndex);
            persistScene(currentSceneData, { ...currentSceneInfo });
        },
        (index) => {
            duplicateSceneItem(index);
            persistScene(currentSceneData, { ...currentSceneInfo });
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
            // Capture array + context as one pair: the form may stay open across
            // a context switch, and its save must target the page it came from.
            const sceneArr = currentSceneData;
            const info = { ...currentSceneInfo, seriesId: activeSeriesId };
            const index = sceneArr.findIndex(item => item.id == e.data.id);
            if (index === -1) {
                console.warn(`[SceneEditor] Dialogue ID ${e.data.id} not found on page ${pageId}`);
                return;
            }
            visual.showDialogueProperties(sceneArr[index], properties,
                async () => {
                    const result = await saveSceneData(info.volume, info.chapter, info.pageId, sceneArr, info.seriesId);
                    if (result.ok) {
                        if (result.scene) adoptServerScene(sceneArr, result.scene);
                        // Fire-and-forget: let subscribed plugins scan the saved dialogue
                        fireEditorHook('scene-saved', {
                            series: activeSeriesId,
                            seriesFolder: activeSeriesFolder,
                            volume: info.volume,
                            chapter: info.chapter,
                            pageId: info.pageId,
                            scene: sceneArr,
                            characters: properties.availableCharacters || []
                        });
                    }
                    return result;
                },
                async (delItem) => handleSceneDelete(delItem, sceneArr, info)
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
