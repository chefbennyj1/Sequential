// views/dashboard/dashboard.js

// --- Global Fetch Interceptor ---
// Intercept all fetch calls to catch 401/403 errors and redirect to login
const originalFetch = window.fetch;
window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (response.status === 401 || response.status === 403) {
        window.location.href = '/login';
    }
    return response;
};

import { getCurrentUser, fetchVolumesAPI, fetchSeriesAPI } from './studio/js/ApiService.js';
import { 
    registerNavigationHandlers, 
    updateUrlState, 
    restoreStateFromUrl 
} from './studio/js/Navigation.js';
import { 
    populateVolumeSelect, 
    populateChapterSelect, 
    populateEditPageSelect, 
    populateLayoutSelect, 
    renderLibraryHtml, 
    showChaptersForVolume,
    showVolumesForSeries
} from './studio/js/LibraryManager.js';
import { setActivePage } from './studio/js/PageConfigManager.js';
import { 
    initSceneEditor,
    initVisualEditor,
    openSceneEditor,
    openVisualEditor
} from './components/SceneEditor/SceneEditor.js';
import { initFileBrowser } from './components/FileBrowser/FileBrowser.js';
import CharacterEditor from './components/CharacterLab/CharacterLab.js';
import ScheduledTaskView from './components/ScheduledTasks/ScheduledTasks.js';

let currentSceneInfo = {};

export async function init(container) {
    console.log("Initializing Dashboard...");
    
    // Initialize WebSockets
    if (typeof io !== 'undefined') {
        window.socket = io();
        window.socket.on('connect', () => {
            console.log(`[WebSocket] Connected with ID: ${window.socket.id}`);
        });
    } else {
        console.warn("[WebSocket] Socket.io client script not found.");
    }

    const sidebar = container.querySelector('.sidebar');
    const allSections = container.querySelectorAll('.dashboard-section');

    // --- Register Navigation Handlers ---
    registerNavigationHandlers({
        openSceneEditor,
        openVisualEditor,
        setActivePage
    });

    // --- UI Interactions ---
    
    // Hover Nav
    document.addEventListener('mousemove', e => {
        if (e.clientX < 60) sidebar?.classList.add('open');
        else if (sidebar?.classList.contains('open') && e.clientX > 250) sidebar.classList.remove('open');
    });

    // User Menu Toggle
    const userSection = container.querySelector('.user');
    const userMenu = container.querySelector('#userMenu');
    
    if (userSection && userMenu) {
        userSection.addEventListener('click', (e) => {
            e.stopPropagation();
            userMenu.classList.toggle('show');
        });

        document.addEventListener('click', () => {
            userMenu.classList.remove('show');
        });
    }

    // Global Event Delegation
    container.addEventListener('click', async (e) => {
        const target = e.target.closest('button, li, .mode-card, .volume-card, .series-card, #accountSettingsBtn');
        if (!target) return;

        // Sidebar Navigation
        if (target.tagName === 'LI' && target.closest('nav')) {
            const page = target.dataset.page;
            if (!page) return;
            updateUrlState({ tab: page });
            
            allSections.forEach(s => s.classList.add('hidden'));
            container.querySelector('.sidebar li.active')?.classList.remove('active');
            target.classList.add('active');
            
            const sec = container.querySelector(`.${page}`);
            if (sec) sec.classList.remove('hidden');
        }

        // Account Settings Link
        if (target.id === 'accountSettingsBtn') {
            e.preventDefault();
            allSections.forEach(s => s.classList.add('hidden'));
            container.querySelector('.user.dashboard-section').classList.remove('hidden');
            updateUrlState({ tab: 'user' });
        }

        // STUDIO HUB: Mode Cards
        if (target.classList.contains('mode-card') && target.closest('.studio')) {
            const targetPage = target.dataset.target;
            if (!targetPage) return;

            container.querySelector('.studio').classList.add('hidden');
            
            const targetSection = container.querySelector(`.${targetPage}`);
            if (targetSection) {
                targetSection.classList.remove('hidden');
                
                if (targetPage === 'edit-volume') populateVolumeSelect('volumeSelect');
                if (targetPage === 'create-new-chapter') populateVolumeSelect('chapterVolumeSelect');
                if (targetPage === 'export-tool') populateVolumeSelect('exportVolumeSelect');
                if (targetPage === 'page-builder') { 
                    populateVolumeSelect('builderVolumeSelect'); 
                    populateLayoutSelect(); 
                    const modeSel = document.getElementById('pageBuilderModeSelection');
                    const createCont = document.getElementById('createPageContainer');
                    const editCont = document.getElementById('editPageContainer');
                    const insertCont = document.getElementById('insertPageContainer');
                    if (modeSel && modeSel.classList.contains('hidden') && 
                        createCont.classList.contains('hidden') && 
                        editCont.classList.contains('hidden') && 
                        insertCont.classList.contains('hidden')) {
                         modeSel.classList.remove('hidden');
                    }
                }
            }
        }

        // BACK TO STUDIO Buttons
        if (target.classList.contains('back-to-studio-btn')) {
            const currentSection = target.closest('.dashboard-section');
            if (currentSection) currentSection.classList.add('hidden');
            container.querySelector('.studio').classList.remove('hidden');
        }

        // Page Builder Internal Mode Cards
        if (target.closest('#modeCreateBtn')) {
            populateVolumeSelect('builderVolumeSelect');
            populateLayoutSelect();
            document.getElementById('pageBuilderModeSelection').classList.add('hidden');
            document.getElementById('createPageContainer').classList.remove('hidden');
        }
        if (target.closest('#modeInsertBtn')) {
            populateVolumeSelect('insertVolumeSelect');
            document.getElementById('pageBuilderModeSelection').classList.add('hidden');
            document.getElementById('insertPageContainer').classList.remove('hidden');
        }
        if (target.closest('#modeEditBtn')) {
            populateVolumeSelect('editVolumeSelect');
            document.getElementById('pageBuilderModeSelection').classList.add('hidden');
            document.getElementById('editPageContainer').classList.remove('hidden');
        }
        if (target.classList.contains('mode-back-btn')) { 
            document.getElementById('pageBuilderModeSelection').classList.remove('hidden'); 
            document.getElementById('createPageContainer').classList.add('hidden'); 
            document.getElementById('editPageContainer').classList.add('hidden'); 
            document.getElementById('insertPageContainer').classList.add('hidden');
        }

        // Load Page Tools
        if (target.id === 'loadPageBtn') {
            const vS = document.getElementById('editVolumeSelect');
            const cS = document.getElementById('editChapterSelect');
            const pS = document.getElementById('editPageSelect');

            const vol = vS.options[vS.selectedIndex]?.getAttribute('data-folder');
            const chapNum = cS.options[cS.selectedIndex]?.getAttribute('data-number');
            const pageId = pS.value;

            if (!vol || !chapNum || !pageId) {
                alert("Please select Volume, Chapter, and Page.");
                return;
            }

            const chap = `chapter-${chapNum}`;
            currentSceneInfo = { volume: vol, chapter: chap, pageId: pageId }; 
            setActivePage(vol, chap, pageId);
            updateUrlState({ tab: 'page-builder', vol, chap, page: pageId });
        }

        // Editor Openers
        if (target.id === 'openLayoutEditorBtn') openVisualEditor(target.dataset.vol, target.dataset.chap, target.dataset.page);
        if (target.id === 'openSceneEditorBtn') openSceneEditor(target.dataset.vol, target.dataset.chap, target.dataset.page);

        // Library Cards
        if (target.closest('.series-card')) {
            const card = target.closest('.series-card');
            showVolumesForSeries(card.id);
        }
        if (target.closest('.volume-card')) {
            const card = target.closest('.volume-card');
            showChaptersForVolume(card.id);
        }
    });

    // Input Change Events
    container.addEventListener('change', e => {
        if (e.target.id === 'builderVolumeSelect') populateChapterSelect(e.target.value, 'builderChapterSelect', true);
        if (e.target.id === 'insertVolumeSelect') populateChapterSelect(e.target.value, 'insertChapterSelect', true);
        if (e.target.id === 'editVolumeSelect') populateChapterSelect(e.target.value, 'editChapterSelect', false);
        if (e.target.id === 'editChapterSelect') populateEditPageSelect(document.getElementById('editVolumeSelect').value, e.target.value);
        if (e.target.id === 'editPageSelect') {
            document.getElementById('loadPageBtn').disabled = !e.target.value;
        }
    });

    // Page Builder Form Submission (Create Page)
    const createPageForm = document.getElementById('page-builder-form');
    if (createPageForm) {
        createPageForm.onsubmit = async (e) => {
            e.preventDefault();
            const btn = document.getElementById('createPageBtn');
            const status = document.getElementById('builderStatus');
            
            const volSelect = document.getElementById('builderVolumeSelect');
            const vol = volSelect.value; 
            const seriesId = volSelect.options[volSelect.selectedIndex]?.getAttribute('data-series-id');
            const chapSelect = document.getElementById('builderChapterSelect');
            const chap = chapSelect.value;
            const pageId = document.getElementById('builderPageId').value;
            const layout = document.getElementById('builderLayoutSelect').value;

            if (!vol || !chap || !pageId || !layout) {
                status.textContent = "Please fill all fields.";
                status.className = "builder-status text-accent";
                return;
            }

            btn.disabled = true;
            btn.textContent = "Creating...";
            status.textContent = "Processing...";
            status.className = "builder-status text-muted";

            try {
                const res = await fetch('/api/editor/create-page', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ series: seriesId, volume: vol, chapter: chap, pageId, layout })
                });
                const data = await res.json();
                
                if (data.ok) {
                    status.textContent = "Success! Page created. Syncing...";
                    status.className = "builder-status text-accent font-bold";
                    
                    setTimeout(() => {
                        setActivePage(vol, chap, pageId);
                        updateUrlState({ tab: 'page-builder', vol, chap, page: pageId });
                    }, 1000);
                } else {
                    status.textContent = "Error: " + data.message;
                    status.className = "builder-status text-accent";
                }
            } catch (err) {
                status.textContent = "Request Failed.";
                status.className = "builder-status text-accent";
            } finally {
                btn.disabled = false;
                btn.textContent = "Create Page Structure";
            }
        };
    }

    // Insert Page Form Submission
    const insertPageForm = document.getElementById('insert-page-form');
    if (insertPageForm) {
        insertPageForm.onsubmit = async (e) => {
            e.preventDefault();
            const btn = document.getElementById('insertPageBtn');
            const status = document.getElementById('insertStatus');
            
            const volSelect = document.getElementById('insertVolumeSelect');
            const vol = volSelect.value; 
            const seriesId = volSelect.options[volSelect.selectedIndex]?.getAttribute('data-series-id');
            const chapSelect = document.getElementById('insertChapterSelect');
            const chap = chapSelect.value;
            const insertPoint = document.getElementById('insertPoint').value;

            if (!vol || !chap || !insertPoint) {
                status.textContent = "Please fill all fields.";
                status.className = "builder-status text-accent";
                return;
            }

            btn.disabled = true;
            btn.textContent = "Processing...";
            status.textContent = "Shifting folders and re-naming files...";
            status.className = "builder-status text-muted";

            try {
                const res = await fetch('/api/editor/insert-page', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ series: seriesId, volume: vol, chapter: chap, insertPoint })
                });
                const data = await res.json();
                
                if (data.ok) {
                    status.textContent = "Success! Pages shifted and new page inserted.";
                    status.className = "builder-status text-accent font-bold";
                    
                    const newPageId = `page${insertPoint}`;
                    setActivePage(vol, chap, newPageId);
                    updateUrlState({ tab: 'page-builder', vol, chap, page: newPageId });
                } else {
                    status.textContent = "Error: " + data.message;
                    status.className = "builder-status text-accent";
                }
            } catch (err) {
                status.textContent = "Request Failed.";
                status.className = "builder-status text-accent";
            } finally {
                btn.disabled = false;
                btn.textContent = "Insert & Shift Pages";
            }
        };
    }

    // Create Chapter Form Submission
    const createChapterForm = document.getElementById('chapter-info');
    if (createChapterForm) {
        createChapterForm.onsubmit = async (e) => {
            e.preventDefault();
            const btn = document.getElementById('createChapterBtn');
            const status = document.getElementById('chapterStatus');
            
            const volSelect = document.getElementById('chapterVolumeSelect');
            const vol = volSelect.value;
            const seriesId = volSelect.options[volSelect.selectedIndex]?.getAttribute('data-series-id');
            const chapterIndex = document.getElementById('chapterIndex').value;
            const title = document.getElementById('chapterTitle').value;

            if (!vol || !chapterIndex) {
                status.textContent = "Please select a volume and enter a chapter index.";
                status.className = "builder-status text-accent";
                return;
            }

            btn.disabled = true;
            btn.textContent = "Initializing...";
            status.textContent = "Checking for existence and creating chapter...";
            status.className = "builder-status text-muted";

            try {
                const res = await fetch('/api/editor/create-chapter', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ series: seriesId, volume: vol, chapterIndex, title })
                });
                const data = await res.json();
                
                if (data.ok) {
                    status.textContent = `Success! ${data.message}. Syncing database...`;
                    status.className = "builder-status text-accent font-bold";
                    
                    // Give the DB a second to settle after the scan
                    setTimeout(() => {
                        setActivePage(vol, data.chapter, data.pageId);
                        updateUrlState({ tab: 'page-builder', vol, chap: data.chapter, page: data.pageId });
                    }, 1000);
                } else {
                    status.textContent = "Error: " + data.message;
                    status.className = "builder-status text-accent";
                }
            } catch (err) {
                status.textContent = "Request Failed.";
                status.className = "builder-status text-accent";
            } finally {
                btn.disabled = false;
                btn.textContent = "Initialize Chapter";
            }
        };
    }

    // Initialize Sub-Systems
    initFileBrowser();
    initSceneEditor();
    initVisualEditor();
    new CharacterEditor();
    new ScheduledTaskView();

    // User & Data Load
    let user; 
    try { 
        user = await getCurrentUser(); 
    } catch (e) { 
        window.location.href = "/login"; 
        return; 
    }
    
    document.getElementById('user-name').textContent = user.username;
    if (!user.administrator) {
        // ...
    }

    // Export Tool Logic
    const startExportBtn = document.getElementById('startExportBtn');
    if(startExportBtn) {
        startExportBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const volumeSelect = document.getElementById('exportVolumeSelect');
            const presetSelect = document.getElementById('exportPresetSelect');
            const targetPageInput = document.getElementById('exportTargetPage');
            if(!volumeSelect || !volumeSelect.value) {
                alert("Please select a volume first.");
                return;
            }

            const volumeId = volumeSelect.value;
            const optionText = volumeSelect.options[volumeSelect.selectedIndex].text;
            const preset = presetSelect ? presetSelect.value : 'uk-table';
            const presetText = presetSelect ? presetSelect.options[presetSelect.selectedIndex].text : 'UK Table';
            const targetPage = targetPageInput ? targetPageInput.value.trim() : '';
            
            const portrait = document.getElementById('exportPortraitOption').checked;
            const landscape = document.getElementById('exportLandscapeOption').checked;
            const pdf = document.getElementById('exportPdfOption').checked;

            if(!portrait && !landscape && !pdf) {
                alert("Please select at least one export format.");
                return;
            }

            let confirmMsg = `Are you sure you want to export ${optionText} (${presetText}) to High-Res PNGs?`;
            if (targetPage) {
                confirmMsg = `Are you sure you want to export ONLY page ${targetPage} from ${optionText} (${presetText})?`;
            }

            if(!confirm(confirmMsg + ` This will take a few minutes in the background.`)) return;

            const btn = e.currentTarget;
            const originalText = btn.innerHTML;
            const statusMsg = document.getElementById('exportStatusMsg');
            
            btn.innerHTML = 'Exporting... <ion-icon size="small" name="hourglass"></ion-icon>';
            btn.style.pointerEvents = 'none';
            statusMsg.textContent = "Starting headless browser... check terminal for live progress.";

            try {
                // Parse series and volume folder from the select text (e.g. "No_Overflow - Volume 1")
                const [seriesPart, volumePart] = optionText.split(' - ');
                const cleanSeries = seriesPart ? seriesPart.trim() : 'No_Overflow';
                
                // Convert "Volume 1" to "volume-1"
                let cleanVolume = 'volume-1';
                if (volumePart) {
                    cleanVolume = volumePart.trim().toLowerCase().replace(/\s+/g, '-');
                }
                
                let fetchUrl = `/api/editor/export-volume/${cleanSeries}/${cleanVolume}?portrait=${portrait}&landscape=${landscape}&pdf=${pdf}&preset=${preset}`;
                if (targetPage) fetchUrl += `&targetPage=${encodeURIComponent(targetPage)}`;

                const res = await fetch(fetchUrl, { method: 'POST' });
                const result = await res.json();
                
                if (result.ok) {
                    statusMsg.textContent = result.message;
                    btn.innerHTML = 'Exporting (Check Terminal) <ion-icon size="small" name="checkmark-circle"></ion-icon>';
                } else {
                    statusMsg.textContent = "Export failed: " + result.message;
                    statusMsg.style.color = "red";
                    btn.innerHTML = originalText;
                    btn.style.pointerEvents = 'auto';
                }
            } catch (error) {
                console.error("Error starting export:", error);
                statusMsg.textContent = "Failed to contact server for export.";
                statusMsg.style.color = "red";
                btn.innerHTML = originalText;
                btn.style.pointerEvents = 'auto';
            }
        });
    }

    // Restore State
    restoreStateFromUrl(container);
}