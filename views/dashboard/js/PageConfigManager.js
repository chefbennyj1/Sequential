// views/dashboard/js/PageConfigManager.js
import {
    fetchSingleVolumeWithChapters,
    fetchAudioMap,
    updateAudioMap,
    fetchAmbientMedia
} from './ApiService.js';
import { renderLayoutBrowser } from '../components/LayoutBrowser/LayoutBrowser.js';
import { openFileBrowser } from '../components/FileBrowser/FileBrowser.js';

/**
 * Manages the "Active Page" tools (Audio, Layout, etc)
 */
export async function setActivePage(vol, chap, page) {
    const toolbar = document.getElementById('activePageToolbar');
    const display = document.getElementById('activePageDisplay');
    const layoutBtn = document.getElementById('openLayoutEditorBtn');
    const sceneBtn = document.getElementById('openSceneEditorBtn');
    const layoutBrowser = document.getElementById('activePageLayoutBrowser');
    const layoutValue = document.getElementById('activePageLayoutValue');
    const applyLayoutBtn = document.getElementById('applyLayoutBtn');
    const backgroundAudioDisplay = document.getElementById('backgroundAudioDisplay');
    const backgroundAudioInput = document.getElementById('backgroundAudioVolumeInput');
    const ambientDisplay = document.getElementById('ambientAudioDisplay');
    const ambientInput = document.getElementById('ambientVolumeInput');

    if (!toolbar || !display) return;

    toolbar.style.display = 'block';
    display.textContent = `${vol} / ${chap} / ${page}`;

    // Link context to buttons
    [layoutBtn, sceneBtn].forEach(btn => {
        if (btn) {
            btn.dataset.vol = vol;
            btn.dataset.chap = chap;
            btn.dataset.page = page;
        }
    });

    // 1. --- LAYOUT CONFIG ---
    if (layoutBrowser) {
        const volumeObj = await fetchSingleVolumeWithChapters(vol);
        const chapter = volumeObj?.chapters?.find(c => `chapter-${c.chapterNumber}` === chap);
        const pageEntry = chapter?.pages?.find(p => `page${p.index}` === page || p.path.includes(page));
        
        const currentLayoutId = pageEntry ? pageEntry.layoutId : "";
        await renderLayoutBrowser('activePageLayoutBrowser', 'activePageLayoutValue', currentLayoutId);

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
                        body: JSON.stringify({ volumeId: volumeObj._id, chapterId: chap, pageId: page, layout: newLayoutFile })
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

    // 2. --- BACKGROUND AUDIO (VOLUME MAP) ---
    if (backgroundAudioDisplay) {
        backgroundAudioDisplay.textContent = "Loading...";
        try {
            const data = await fetchAudioMap(vol);
            const audioMap = data.map || [];
            const entry = audioMap.find(item => item.pages.includes(page));
            
            if (entry) {
                backgroundAudioDisplay.textContent = entry.fileName;
                if (backgroundAudioInput) backgroundAudioInput.value = entry.volume !== undefined ? entry.volume : 1.0;
            } else {
                backgroundAudioDisplay.textContent = "None";
                if (backgroundAudioInput) backgroundAudioInput.value = 1.0;
            }

            // Attach browse handler to both text and button
            const bgBrowseHandler = () => {
                openFileBrowser('audio', vol, chap, page, async (fileName) => {
                    backgroundAudioDisplay.textContent = fileName;
                }, 'volume');
            };
            backgroundAudioDisplay.onclick = bgBrowseHandler;
            const bgBtn = document.getElementById('browseBackgroundAudioBtn');
            if (bgBtn) bgBtn.onclick = bgBrowseHandler;

            const applyBgBtn = document.getElementById('applyBackgroundAudioBtn');
            if (applyBgBtn) {
                applyBgBtn.onclick = async () => {
                    const fileName = backgroundAudioDisplay.textContent;
                    const newVol = parseFloat(backgroundAudioInput.value);
                    if (fileName === "Loading..." || fileName === "None") return;

                    const currentMapResponse = await fetchAudioMap(vol);
                    let currentMap = currentMapResponse.map || [];
                    currentMap.forEach(item => { item.pages = item.pages.filter(p => p !== page); });
                    currentMap = currentMap.filter(item => item.pages.length > 0);

                    let storedName = fileName.startsWith('volume://') ? fileName.replace('volume://', '') : fileName;
                    let targetEntry = currentMap.find(item => item.fileName === storedName);
                    if (targetEntry) {
                        if (!targetEntry.pages.includes(page)) targetEntry.pages.push(page);
                        targetEntry.volume = newVol;
                    } else {
                        currentMap.push({ fileName: storedName, pages: [page], volume: newVol });
                    }
                    
                    const updateRes = await updateAudioMap(vol, currentMap);
                    if (updateRes.ok) {
                        applyBgBtn.textContent = "Applied!";
                        setTimeout(() => { applyBgBtn.textContent = "Apply"; }, 2000);
                    }
                };
            }
        } catch (e) { console.error(e); backgroundAudioDisplay.textContent = "Error"; }
    }

    // 3. --- PAGE AMBIENT (MEDIA.JSON) ---
    if (ambientDisplay) {
        ambientDisplay.textContent = "Loading...";
        try {
            const data = await fetchAmbientMedia(vol, chap, page, 'No_Overflow');
            const ambientInfo = data.media ? data.media.ambientAudio : null;
            if (ambientInfo && ambientInfo.fileName) {
                ambientDisplay.textContent = ambientInfo.fileName;
                if (ambientInput) ambientInput.value = ambientInfo.volume !== undefined ? ambientInfo.volume : 1.0;
            } else {
                ambientDisplay.textContent = "None";
                if (ambientInput) ambientInput.value = 1.0;
            }

            // Attach browse handler to both text and button
            const ambientBrowseHandler = () => {
                openFileBrowser('audio', vol, chap, page, async (fileName) => {
                    ambientDisplay.textContent = fileName;
                }, 'volume');
            };
            ambientDisplay.onclick = ambientBrowseHandler;
            const ambientBtn = document.getElementById('browseAmbientAudioBtn');
            if (ambientBtn) ambientBtn.onclick = ambientBrowseHandler;

            const applyAmbientBtn = document.getElementById('applyAmbientBtn');
            if (applyAmbientBtn) {
                applyAmbientBtn.onclick = async () => {
                    const fileName = ambientDisplay.textContent;
                    const newVol = ambientInput.value;
                    if (fileName === "Loading..." || fileName === "None") return;

                    const res = await fetch('/api/editor/set-ambient', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ series: 'No_Overflow', volume: vol, chapter: chap, pageId: page, fileName, ambientVolume: newVol })
                    });
                    const data = await res.json();
                    if (data.ok) {
                        applyAmbientBtn.textContent = "Applied!";
                        setTimeout(() => { applyAmbientBtn.textContent = "Apply"; }, 2000);
                    }
                };
            }
        } catch (e) { ambientDisplay.textContent = "Error"; }
    }
}
