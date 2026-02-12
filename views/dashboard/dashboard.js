// views/dashboard/dashboard.js

import { getCurrentUser, fetchVolumesAPI, fetchSeriesAPI } from './js/ApiService.js';
import { 
    registerNavigationHandlers, 
    updateUrlState, 
    restoreStateFromUrl 
} from './js/Navigation.js';
import { 
    populateVolumeSelect, 
    populateChapterSelect, 
    populateEditPageSelect, 
    populateLayoutSelect, 
    renderLibraryHtml, 
    showChaptersForVolume,
    showVolumesForSeries
} from './js/LibraryManager.js';
import { setActivePage } from './js/PageConfigManager.js';
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
            // Prevent sidebar close/hover logic if necessary, but here we just toggle
            e.stopPropagation();
            userMenu.classList.toggle('show');
        });

        // Close menu when clicking elsewhere
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
            
            // Hide all sections first
            allSections.forEach(s => s.style.display = 'none');
            
            // Handle Sidebar Active State
            container.querySelector('.sidebar li.active')?.classList.remove('active');
            target.classList.add('active');
            
            // Show target section
            const sec = container.querySelector(`.${page}`);
            if (sec) sec.style.display = 'block';
        }

        // Account Settings Link (in User Menu)
        if (target.id === 'accountSettingsBtn') {
            e.preventDefault();
            allSections.forEach(s => s.style.display = 'none');
            container.querySelector('.user').style.display = 'block';
            updateUrlState({ tab: 'user' });
        }

        // STUDIO HUB: Mode Cards
        // Clicking a card in the Studio Hub opens the specific tool
        if (target.classList.contains('mode-card') && target.closest('.studio')) {
            const targetPage = target.dataset.target;
            if (!targetPage) return;

            // Hide Studio Hub
            container.querySelector('.studio').style.display = 'none';
            
            // Show Target Section
            const targetSection = container.querySelector(`.${targetPage}`);
            if (targetSection) {
                targetSection.style.display = 'block';
                
                // Trigger any necessary population logic
                if (targetPage === 'edit-volume') populateVolumeSelect('volumeSelect');
                if (targetPage === 'page-builder') { 
                    populateVolumeSelect('builderVolumeSelect'); 
                    populateLayoutSelect(); 
                    // Ensure the internal mode selection is visible if not in a specific sub-mode
                    const modeSel = document.getElementById('pageBuilderModeSelection');
                    if (modeSel && modeSel.style.display === 'none' && !document.getElementById('createPageContainer').style.display && !document.getElementById('editPageContainer').style.display) {
                         modeSel.style.display = 'block';
                    }
                }
            }
        }

        // BACK TO STUDIO Buttons
        if (target.classList.contains('back-to-studio-btn')) {
            // Hide current section (parent dashboard-section)
            const currentSection = target.closest('.dashboard-section');
            if (currentSection) currentSection.style.display = 'none';
            
            // Show Studio Hub
            const studioSection = container.querySelector('.studio');
            if (studioSection) studioSection.style.display = 'block';
        }

        // Page Builder Internal Mode Cards (Create vs Edit Page)
        // These are inside .page-builder, not .studio
        if (target.closest('#modeCreateBtn')) {
            populateVolumeSelect('builderVolumeSelect');
            populateLayoutSelect();
            document.getElementById('pageBuilderModeSelection').style.display = 'none';
            document.getElementById('createPageContainer').style.display = 'block';
        }
        if (target.closest('#modeEditBtn')) {
            populateVolumeSelect('editVolumeSelect');
            document.getElementById('pageBuilderModeSelection').style.display = 'none';
            document.getElementById('editPageContainer').style.display = 'block';
        }
        if (target.classList.contains('mode-back-btn')) { 
            document.getElementById('pageBuilderModeSelection').style.display = 'block'; 
            document.getElementById('createPageContainer').style.display = 'none'; 
            document.getElementById('editPageContainer').style.display = 'none'; 
        }

        // Load Page Tools
        if (target.id === 'loadPageBtn') {
            const vS = document.getElementById('editVolumeSelect');
            const cS = document.getElementById('editChapterSelect');
            const pS = document.getElementById('editPageSelect');

            const vol = vS.options[vS.selectedIndex]?.getAttribute('data-folder');
            const seriesId = vS.options[vS.selectedIndex]?.getAttribute('data-series-id');
            const chapNum = cS.options[cS.selectedIndex]?.getAttribute('data-number');
            const pageId = pS.value;

            if (!vol || !chapNum || !pageId) {
                alert("Please select Volume, Chapter, and Page.");
                return;
            }

            const chap = `chapter-${chapNum}`;
            currentSceneInfo = { volume: vol, chapter: chap, pageId: pageId }; 
            // Note: We might want to pass seriesId to setActivePage eventually, 
            // but for now it's inferred or defaults.
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
                status.style.color = "red";
                return;
            }

            btn.disabled = true;
            btn.textContent = "Creating...";
            status.textContent = "Processing...";
            status.style.color = "#aaa";

            try {
                const res = await fetch('/api/editor/create-page', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ series: seriesId, volume: vol, chapter: chap, pageId, layout })
                });
                const data = await res.json();
                
                if (data.ok) {
                    status.textContent = "Success! Page created.";
                    status.style.color = "lightgreen";
                    // Auto-load
                    setActivePage(vol, chap, pageId);
                    updateUrlState({ tab: 'page-builder', vol, chap, page: pageId });
                } else {
                    status.textContent = "Error: " + data.message;
                    status.style.color = "red";
                }
            } catch (err) {
                status.textContent = "Request Failed.";
                status.style.color = "red";
            } finally {
                btn.disabled = false;
                btn.textContent = "Create Page Structure";
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
    // Note: create-new-volume logic is now inside Studio, so we don't need to remove sidebar item if it doesn't exist
    // But we might want to hide the card if user is not admin
    if (!user.administrator) {
        // Hide Create Volume card? Or disable it.
        // For now, let's leave it visible as the API is protected anyway.
    }

    // Restore State
    restoreStateFromUrl(container);
}