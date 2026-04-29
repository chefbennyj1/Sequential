// views/dashboard/js/PageConfigManager.js
import {
    fetchSingleVolumeWithChapters,
    fetchSceneData,
    fetchPagePanels
} from './ApiService.js';
import { renderLayoutBrowser } from '../../components/LayoutBrowser/LayoutBrowser.js';

export let currentDesignMode = 'landscape';

/**
 * Checks for orphaned dialogue items and displays a warning banner.
 */
async function checkOrphans(vol, chap, page, seriesId) {
    const alertsContainer = document.getElementById('pageBuilderAlerts');
    if (!alertsContainer) return;

    try {
        const [scene, panelData] = await Promise.all([
            fetchSceneData(vol, chap, page, seriesId),
            fetchPagePanels(vol, chap, page, currentDesignMode, seriesId)
        ]);

        const panels = panelData.panels || [];
        const orphans = scene.filter(item => {
            if (item.displayType.type === 'SpeechBubble' || (item.displayType.type === 'TextBlock' && item.placement?.panel)) {
                const target = item.placement?.panel;
                return target && !panels.includes(target);
            }
            return false;
        });

        if (orphans.length > 0) {
            alertsContainer.innerHTML = `
                <div class="alert alert-danger border-dim padding-15 border-radius-8 bg-black-20 flex-row align-center gap-15">
                    <ion-icon name="warning-outline" class="text-danger font-size-2"></ion-icon>
                    <div class="flex-1">
                        <h5 class="text-danger margin-b-5">Orphaned Dialogue Detected</h5>
                        <p class="text-muted font-size-08">There are ${orphans.length} items targeting panels that do not exist in the current <strong>${currentDesignMode}</strong> layout. These will not appear in the viewer until re-assigned.</p>
                    </div>
                    <button class="small btn-danger-outline" onclick="document.getElementById('openSceneEditorBtn').click()">Fix in Scene Editor</button>
                </div>
            `;
        } else {
            alertsContainer.innerHTML = '';
        }
    } catch (err) {
        console.error("Orphan check failed:", err);
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

    // Run orphan check
    if (seriesId) checkOrphans(vol, chap, page, seriesId);

    // --- Mode Toggle Setup ---
    const landscapeBtn = document.getElementById('designModeLandscape');
    const portraitBtn = document.getElementById('designModePortrait');

    const refreshLayoutDisplay = async (pageEntry) => {
        let lid = "";
        let landscapeId = "";
        if (pageEntry?.layouts) {
            lid = currentDesignMode === 'portrait' ? pageEntry.layouts.portrait : pageEntry.layouts.landscape;
            // Handle the case where the layout is stored as an object { id, html, css }
            if (typeof lid === 'object' && lid !== null) {
                lid = lid.id;
            }
            const lsObj = pageEntry.layouts.landscape;
            landscapeId = (typeof lsObj === 'object' && lsObj !== null) ? lsObj.id : lsObj;
        } else {
            // Legacy fallback
            lid = currentDesignMode === 'portrait' ? (pageEntry?.portraitLayoutId || "") : (pageEntry?.layoutId || "");
            landscapeId = pageEntry?.layoutId || "";
        }
        await renderLayoutBrowser('activePageLayoutBrowser', 'activePageLayoutValue', lid, currentDesignMode, landscapeId);
        
        // Re-run orphan check when mode changes
        if (seriesId) checkOrphans(vol, chap, page, seriesId);
    };

    if (landscapeBtn && portraitBtn) {
        landscapeBtn.onclick = async () => {
            currentDesignMode = 'landscape';
            landscapeBtn.classList.add('active');
            portraitBtn.classList.remove('active');
            const volumeObj = await fetchSingleVolumeWithChapters(vol, seriesId);
            const chapter = volumeObj?.chapters?.find(c => `chapter-${c.chapterNumber}` === chap);
            const pageEntry = chapter?.pages?.find(p => `page${p.index}` === page || p.path.includes(page));
            await refreshLayoutDisplay(pageEntry);
        };
        portraitBtn.onclick = async () => {
            currentDesignMode = 'portrait';
            portraitBtn.classList.add('active');
            landscapeBtn.classList.remove('active');
            const volumeObj = await fetchSingleVolumeWithChapters(vol, seriesId);
            const chapter = volumeObj?.chapters?.find(c => `chapter-${c.chapterNumber}` === chap);
            const pageEntry = chapter?.pages?.find(p => `page${p.index}` === page || p.path.includes(page));
            await refreshLayoutDisplay(pageEntry);
        };
    }

    // 1. --- LAYOUT CONFIG ---
    if (layoutBrowser) {
        const volumeObj = await fetchSingleVolumeWithChapters(vol, seriesId);
        const chapter = volumeObj?.chapters?.find(c => `chapter-${c.chapterNumber}` === chap);
        const pageEntry = chapter?.pages?.find(p => `page${p.index}` === page || p.path.includes(page));
        
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
                            mode: currentDesignMode
                        })
                    });
                    const result = await res.json();
                    if (result.ok) {
                        applyLayoutBtn.textContent = "Applied!";
                        setTimeout(() => { applyLayoutBtn.textContent = oldText; applyLayoutBtn.disabled = false; }, 2000);
                    } else {
                        alert("Error: " + result.message);
                        applyLayoutBtn.textContent = "Error";
                        applyLayoutBtn.disabled = false;
                    }
                } catch (e) {
                    console.error(e);
                    applyLayoutBtn.disabled = false;
                }
            };
        }
    }
}