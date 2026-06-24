// views/dashboard/js/PageConfigManager.js
import {
    fetchSingleVolumeWithChapters,
    fetchSceneData,
    fetchPagePanels,
    fetchMedia
} from '../api/StudioClient.js';
import { renderLayoutBrowser } from '../../components/LayoutBrowser/LayoutBrowser.js';

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
            fetchPagePanels(vol, chap, page, seriesId)
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
                    <button class="small btn-danger-outline" onclick="document.getElementById('openLayoutEditorBtn').click()">Fix in Editor</button>
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
    const layoutBrowser = document.getElementById('activePageLayoutBrowser');
    const layoutValue = document.getElementById('activePageLayoutValue');
    const applyLayoutBtn = document.getElementById('applyLayoutBtn');

    if (!toolbar || !display) return;

    toolbar.classList.remove('hidden');
    display.textContent = `${vol} / ${chap} / ${page}`;

    // PERSISTENCE: Save this context so we can restore it on reload
    localStorage.setItem('sequential_last_active_page', JSON.stringify({ vol, chap, page, seriesId, seriesFolder }));

    // Link context to buttons
    [layoutBtn].forEach(btn => {
        if (btn) {
            btn.dataset.vol = vol;
            btn.dataset.chap = chap;
            btn.dataset.page = page;
            if (seriesId) btn.dataset.series = seriesId;
            if (seriesFolder) btn.dataset.seriesFolder = seriesFolder;
        }
    });

    const alertsContainer = document.getElementById('pageBuilderAlerts');
    if (alertsContainer) {
        alertsContainer.innerHTML = ''; // Clear all on start
        alertsContainer.classList.add('hidden');
    }

    // Run orphan check
    if (seriesId) {
        const orphanCount = await checkOrphanDialogue(vol, chap, page, seriesId);
        if (orphanCount > 0 && alertsContainer) alertsContainer.classList.remove('hidden');
    }

    const refreshLayoutDisplay = async (pageEntry) => {
        const lid = pageEntry?.layout?.id ?? "";
        await renderLayoutBrowser('activePageLayoutBrowser', 'activePageLayoutValue', lid);

        if (seriesId) await checkOrphanDialogue(vol, chap, page, seriesId);
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
                        if (window.GlassToast) {
                            window.GlassToast.show('success', 'Layout Updated', `Page structure changed to ${newLayoutFile}.`);
                        }
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

/**
 * Restore the last active page from localStorage on dashboard load.
 */
export async function restoreLastActivePage() {
    const saved = localStorage.getItem('sequential_last_active_page');
    if (!saved) return;

    try {
        const { vol, chap, page, seriesId, seriesFolder } = JSON.parse(saved);
        if (vol && chap && page) {
            console.log(`[Persistence] Restoring last active page: ${vol}/${chap}/${page}`);
            await setActivePage(vol, chap, page, seriesId, seriesFolder);
        }
    } catch (e) {
        console.error("Failed to restore last active page", e);
        localStorage.removeItem('sequential_last_active_page');
    }
}