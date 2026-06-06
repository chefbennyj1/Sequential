// views/dashboard/js/PageConfigManager.js
import {
    fetchSingleVolumeWithChapters,
    fetchSceneData,
    fetchPagePanels,
    fetchMedia
} from '../api/StudioClient.js';
import { renderLayoutBrowser } from '../../components/LayoutBrowser/LayoutBrowser.js';

export let currentDesignMode = 'portrait';

/**
 * Checks for orphaned dialogue items and displays a warning banner.
 */
async function checkOrphanDialogue(vol, chap, page, seriesId) {
    const alertsContainer = document.getElementById('pageBuilderAlerts');
    if (!alertsContainer) return 0;

    // Use a dedicated sub-container for orphan alerts to avoid wiping other alerts
    let orphanBox = alertsContainer.querySelector('.orphan-alert-box');
    if (!orphanBox) {
        orphanBox = document.createElement('div');
        orphanBox.className = 'orphan-alert-box';
        alertsContainer.prepend(orphanBox);
    }

    try {
        const [scene, panelData] = await Promise.all([
            fetchSceneData(vol, chap, page, seriesId),
            fetchPagePanels(vol, chap, page, 'portrait', seriesId)
        ]);

        const panels = panelData.panels || [];
        const orphans = scene.filter(item => {
            // Check ANY item with a panel placement (SpeechBubble, TextBlock, ActionText, SoundEffect)
            if (item.placement?.panel) {
                const target = item.placement.panel;
                return target && !panels.includes(target);
            }
            return false;
        });

        if (orphans.length > 0) {
            orphanBox.innerHTML = `
                <div class="alert alert-danger border-dim padding-15 border-radius-8 bg-black-20 flex-row align-center gap-15 margin-b-10">
                    <ion-icon name="warning-outline" class="text-danger font-size-2"></ion-icon>
                    <div class="flex-1">
                        <h5 class="text-danger margin-b-5">Orphaned Dialogue Detected</h5>
                        <p class="text-muted font-size-08">There are ${orphans.length} items targeting panels that do not exist in the current layout. These will not appear in the viewer until re-assigned.</p>
                    </div>
                    <button class="small btn-danger-outline" onclick="document.getElementById('openSceneEditorBtn').click()">Fix in Scene Editor</button>
                </div>
            `;
        } else {
            orphanBox.innerHTML = '';
        }
        return orphans.length;
    } catch (err) {
        console.error("Orphan check failed:", err);
        return 0;
    }
}

/**
 * Manages the "Active Page" tools (Layout, etc)
 */
export async function setActivePage(vol, chap, page, seriesId = null, seriesFolder = null) {
    const toolbar = document.getElementById('activePageToolbar');
    const display = document.getElementById('activePageDisplay');
    const layoutBtn = document.getElementById('openLayoutEditorBtn');
    const sceneBtn = document.getElementById('openSceneEditorBtn');
    const layoutBrowser = document.getElementById('activePageLayoutBrowser');
    const layoutValue = document.getElementById('activePageLayoutValue');
    const applyLayoutBtn = document.getElementById('applyLayoutBtn');

    if (!toolbar || !display) return;

    toolbar.classList.remove('hidden');
    display.textContent = `${vol} / ${chap} / ${page}`;

    // Link context to buttons
    [layoutBtn, sceneBtn].forEach(btn => {
        if (btn) {
            btn.dataset.vol = vol;
            btn.dataset.chap = chap;
            btn.dataset.page = page;
            if (seriesId) btn.dataset.series = seriesId;
            if (seriesFolder) btn.dataset.seriesFolder = seriesFolder;
        }
    });

    const alertsContainer = document.getElementById('pageBuilderAlerts');
    if (alertsContainer) alertsContainer.innerHTML = ''; // Clear all on start

    // Run orphan check
    if (seriesId) await checkOrphanDialogue(vol, chap, page, seriesId);

    // --- SPREAD OPPORTUNITY ALERT ---
    const pageMatch = page.match(/page(\d+)/i);
    const pageNum = pageMatch ? parseInt(pageMatch[1], 10) : 0;
    const isEven = pageNum % 2 === 0; // Page 2, 4, 6... are Left-hand pages

    const refreshLayoutDisplay = async (pageEntry) => {
        let lid = "";
        if (pageEntry?.layouts) {
            lid = pageEntry.layouts.portrait || pageEntry.layout?.id || 'Standard_Page';
            if (typeof lid === 'object' && lid !== null) lid = lid.id;
        } else {
            lid = pageEntry?.portraitLayoutId || pageEntry?.layoutId || "";
        }
        await renderLayoutBrowser('activePageLayoutBrowser', 'activePageLayoutValue', lid);

        if (seriesId) await checkOrphanDialogue(vol, chap, page, seriesId);

        // --- SPREAD STATUS & TOGGLE ---
        const spreadData = pageEntry?.header?.spread || { type: 'none', isBroken: false };
        const isSpreadEnabled = spreadData.type !== 'none';

        if ((isEven || isSpreadEnabled) && alertsContainer) {
            const spreadAlert = document.createElement('div');
            spreadAlert.className = `alert border-dim padding-15 border-radius-8 bg-black-10 flex-row align-center gap-15 margin-t-10`;
            spreadAlert.innerHTML = `
                <ion-icon name="bulb-outline" class="text-accent font-size-2"></ion-icon>
                <div class="flex-1">
                    <h5 class="text-accent margin-b-5">Two-Page Spread</h5>
                    <p class="text-muted font-size-08">
                        Page ${pageNum} is a <strong>${isEven ? 'Left-Hand' : 'Right-Hand'}</strong> page. Spreads pair even pages with the following odd page.
                    </p>
                </div>
                <div class="flex-row align-center gap-10">
                    <span class="text-muted font-size-07">${isSpreadEnabled ? 'Spread Active' : 'Enable Spread'}</span>
                    <label class="switch">
                        <input type="checkbox" id="pageSpreadToggle" ${isSpreadEnabled ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                </div>
            `;
            alertsContainer.appendChild(spreadAlert);

            const toggle = document.getElementById('pageSpreadToggle');
            toggle.onclick = async () => {
                const enabled = toggle.checked;
                try {
                    const volumeObj = await fetchSingleVolumeWithChapters(vol, seriesId);
                    const res = await fetch('/api/editor/toggle-spread', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            volumeId: volumeObj._id,
                            chapterId: chap,
                            pageId: page,
                            enabled
                        })
                    });
                    
                    const text = await res.text();
                    let result;
                    try {
                        result = JSON.parse(text);
                    } catch (e) {
                        console.error("Server returned non-JSON:", text);
                        throw new Error(`Server Error (${res.status}): Invalid Response Format`);
                    }

                    if (result.ok) {
                        // Refresh to show updated state
                        await setActivePage(vol, chap, page, seriesId, seriesFolder);
                    } else {
                        alert("Error: " + result.message);
                        toggle.checked = !enabled;
                    }
                } catch (err) {
                    console.error(err);
                    toggle.checked = !enabled;
                }
            };
        }
    };

    // 1. --- LAYOUT CONFIG ---
    if (layoutBrowser) {
        // Fetch full page data (including header/spread info) from the direct media API
        const pageData = await fetchMedia(vol, chap, page, seriesId);
        const volumeObj = await fetchSingleVolumeWithChapters(vol, seriesId);
        const chapter = volumeObj?.chapters?.find(c => `chapter-${c.chapterNumber}` === chap);
        const pageEntry = chapter?.pages?.find(p => `page${p.index}` === page || p.path.includes(page));

        // Merge spread data from page.json into the entry for display
        if (pageEntry && pageData.header) {
            pageEntry.header = pageData.header;
        }

        await refreshLayoutDisplay(pageEntry);

        if (applyLayoutBtn) {
            applyLayoutBtn.onclick = async () => {
                const newLayoutFile = layoutValue.value;
                if (!newLayoutFile || !volumeObj) return;

                const oldText = applyLayoutBtn.textContent;
                applyLayoutBtn.disabled = true;
                applyLayoutBtn.textContent = "Applying...";

                try {
                    const res = await fetch('/api/editor/change-layout', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            volumeId: volumeObj._id,
                            chapterId: chap,
                            pageId: page,
                            layout: newLayoutFile,
                            mode: 'portrait'
                        })
                    });
                    const result = await res.json();
                    if (result.ok) {
                        applyLayoutBtn.textContent = "Applied!";
                        setTimeout(() => { applyLayoutBtn.textContent = oldText; applyLayoutBtn.disabled = false; }, 2000);
                    } else {
                        alert("Error: " + result.message);
                        applyLayoutBtn.textContent = oldText;
                        applyLayoutBtn.disabled = false;
                    }
                } catch (e) {
                    console.error(e);
                    applyLayoutBtn.textContent = oldText;
                    applyLayoutBtn.disabled = false;
                }
            };
        }
    }
}