import { updateUrlState } from './Navigation.js';
import {
    populateSeriesSelect,
    populateVolumeSelect,
    populateChapterSelect,
    populateEditPageSelect,
    populateLayoutSelect,
    showVolumesForSeries,
    showChaptersForVolume
} from './LibraryManager.js';
import { setActivePage, currentDesignMode } from './PageConfigManager.js';
import { openSceneEditor, openVisualEditor } from '../../components/SceneEditor/SceneEditor.js';
import ArrangeManager from './ArrangeManager.js';

let currentSceneInfo = {};
let arrangeManager;

/**
 * Switches the visible dashboard section and triggers any necessary data population.
 */
export async function switchToSection(targetPage, container) {
    console.log(`[Dashboard] Attempting switch to section: ${targetPage}`);
    
    const allSections = container.querySelectorAll('.dashboard-section, .glass-tab-panel');
    const targetSection = container.querySelector('.' + targetPage);
    
    if (!targetSection) {
        console.warn(`[Dashboard] Target section not found in container: .${targetPage}`);
        return;
    }

    // --- LIQUID GLASS TAB LOGIC ---
    // 1. Update Tabs (if any)
    const tabs = container.querySelectorAll('.glass-tab');
    tabs.forEach(tab => {
        const isActive = tab.dataset.page === targetPage;
        tab.setAttribute('aria-selected', String(isActive));
        tab.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    // 2. Update Panels (Exclusive Visibility)
    console.log(`[Dashboard] Activating .${targetPage} and deactivating others.`);

    // Hide background blobs for scanner page to prevent circular artifacts
    

    allSections.forEach(s => {
        s.classList.remove('is-active');
        s.classList.add('hidden'); 
    });
    
    targetSection.classList.add('is-active');
    targetSection.classList.remove('hidden');

    // Trigger Population Logic based on the section
    const popTasks = [];
    if (targetPage === 'create-new-volume') popTasks.push(populateSeriesSelect('createVolumeSeriesSelect'));
    if (targetPage === 'edit-volume') popTasks.push(populateSeriesSelect('volumeSeriesSelect'));
    if (targetPage === 'create-new-chapter') popTasks.push(populateSeriesSelect('chapterSeriesSelect'));
    if (targetPage === 'export-tool') popTasks.push(populateSeriesSelect('exportSeriesSelect'));
    if (targetPage === 'characters') popTasks.push(populateSeriesSelect('char-series-select'));
    if (targetPage === 'page-builder') {
        popTasks.push(populateSeriesSelect([
            'builderSeriesSelect',
            'insertSeriesSelect',
            'scriptSeriesSelect',
            'editSeriesSelect'
        ]));
        popTasks.push(populateLayoutSelect());

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

    await Promise.all(popTasks);
    
    // Dispatch completion event
    container.dispatchEvent(new CustomEvent('sectionShown', { detail: { section: targetPage } }));
}

export function initEventHandlers(container, allSections) {
    if (!arrangeManager) arrangeManager = new ArrangeManager();

    // User Menu Toggle (Topbar)
    const userProfileToggle = document.getElementById('userProfileToggle');
    const userMenu = document.getElementById('userMenu');

    if (userProfileToggle && userMenu) {
        userProfileToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            userMenu.classList.toggle('show');
        });

        document.addEventListener('click', () => {
            userMenu.classList.remove('show');
        });
    }

    // Global Event Delegation
    container.addEventListener('click', async (e) => {
        const target = e.target.closest('button, li, .glass-tab, .mode-card, .volume-card, .series-card, #accountSettingsBtn');
        if (!target) return;

        // Topbar Navigation
        if (target.classList.contains('glass-tab') && target.closest('#main-navigation')) {
            const page = target.dataset.page;
            if (!page) return;
            updateUrlState({ tab: page });
            
            // Note: active state handled inside switchToSection for glass-tabs
            await switchToSection(page, container);
        }

        // Account Settings Link
        if (target.id === 'accountSettingsBtn') {
            e.preventDefault();
            updateUrlState({ tab: 'user-settings' });
            await switchToSection('user-settings', container);
        }

        // STUDIO HUB: Mode Cards
        if (target.classList.contains('mode-card') && target.closest('.studio')) {
            const targetPage = target.dataset.target;
            if (targetPage) await switchToSection(targetPage, container);
        }

        // BACK TO STUDIO Buttons
        if (target.classList.contains('back-to-studio-btn')) {
            await switchToSection('studio', container);
        }

        // --- Deep Link Openers (from Page Builder) ---
        if (target.id === 'openLayoutEditorBtn') {
            const { vol, chap, page, series, seriesFolder } = target.dataset;
            openVisualEditor(vol, chap, page, 'portrait', series, seriesFolder);
        }

        if (target.id === 'openSceneEditorBtn') {
            const { vol, chap, page, series } = target.dataset;
            openSceneEditor(vol, chap, page, 'portrait', series);
        }

        // Page Builder Internal Mode Cards
        if (target.closest('#modeCreateBtn')) {
            populateSeriesSelect('builderSeriesSelect');
            populateLayoutSelect();
            document.getElementById('pageBuilderModeSelection').classList.add('hidden');
            document.getElementById('createPageContainer').classList.remove('hidden');
        }
        if (target.closest('#modeInsertBtn')) {
            populateSeriesSelect('insertSeriesSelect');
            document.getElementById('pageBuilderModeSelection').classList.add('hidden');
            document.getElementById('insertPageContainer').classList.remove('hidden');
        }
        if (target.closest('#modeEditBtn')) {
            populateSeriesSelect('editSeriesSelect');
            document.getElementById('pageBuilderModeSelection').classList.add('hidden');
            document.getElementById('editPageContainer').classList.remove('hidden');
        }
        if (target.closest('#modeArrangeBtn')) {
            populateSeriesSelect('arrangeSeriesSelect');
            document.getElementById('pageBuilderModeSelection').classList.add('hidden');
            document.getElementById('arrangePagesContainer').classList.remove('hidden');
        }
        if (target.closest('#modeScriptBtn')) {
            populateSeriesSelect('scriptSeriesSelect');
            document.getElementById('pageBuilderModeSelection').classList.add('hidden');
            document.getElementById('exportScriptContainer').classList.remove('hidden');
        }
        if (target.classList.contains('mode-back-btn')) {
            document.getElementById('pageBuilderModeSelection').classList.remove('hidden');
            document.getElementById('createPageContainer').classList.add('hidden');
            document.getElementById('editPageContainer').classList.add('hidden');
            document.getElementById('insertPageContainer').classList.add('hidden');
            document.getElementById('arrangePagesContainer').classList.add('hidden');
            document.getElementById('exportScriptContainer').classList.add('hidden');
        }

        // Generate Script Logic
        if (target.id === 'generateScriptBtn') {
            const vS = document.getElementById('scriptVolumeSelect');
            const vol = vS.options[vS.selectedIndex]?.getAttribute('data-folder');
            const seriesId = vS.options[vS.selectedIndex]?.getAttribute('data-series-id');
            const statusMsg = document.getElementById('scriptStatus');        

            if (!vol || !seriesId) {
                alert("Please select a volume.");
                return;
            }

            statusMsg.textContent = "Generating script...";
            statusMsg.style.color = "var(--cyber-primary)";

            fetch('/api/editor/export-script/' + seriesId + '/' + vol, { method: 'POST' })
                .then(res => res.json())
                .then(data => {
                    if (data.ok) {
                        statusMsg.textContent = data.message;
                        statusMsg.style.color = "#00ff41";
                    } else {
                        statusMsg.textContent = "Error: " + data.message;     
                        statusMsg.style.color = "#ff4141";
                    }
                })
                .catch(err => {
                    statusMsg.textContent = "Request failed.";
                    statusMsg.style.color = "#ff4141";
                });
        }

        // Load Page Tools
        if (target.id === 'loadPageBtn') {
            const vS = document.getElementById('editVolumeSelect');
            const cS = document.getElementById('editChapterSelect');
            const pS = document.getElementById('editPageSelect');
            const sS = document.getElementById('editSeriesSelect');

            const vol = vS.options[vS.selectedIndex]?.getAttribute('data-folder');
            const seriesId = sS.value;
            const seriesFolder = sS.options[sS.selectedIndex]?.getAttribute('data-folder');
            const chapNum = cS.options[cS.selectedIndex]?.getAttribute('data-number');
            const pageId = pS.value;

            if (!vol || !chapNum || !pageId || !seriesId) {
                alert("Please select Series, Volume, Chapter, and Page.");    
                return;
            }

            const chap = 'chapter-' + chapNum;
            
            // MEMOIZATION: Store current working environment
            window.EDITOR_SESSION = { 
                volume: vol, 
                volumeId: vS.value,
                chapter: chap, 
                chapterId: cS.value,
                pageId: pageId, 
                seriesId, 
                seriesFolder 
            };

            currentSceneInfo = { volume: vol, chapter: chap, pageId: pageId, seriesId, seriesFolder };
            setActivePage(vol, chap, pageId, seriesId, seriesFolder);
            updateUrlState({ tab: 'page-builder', vol, chap, page: pageId, series: seriesId, seriesFolder });
        }

        // Library Cards
        if (target.closest('.series-card')) {
            const card = target.closest('.series-card');
            showVolumesForSeries(card.id);
        }
        if (target.closest('.volume-card')) {
            const card = target.closest('.volume-card');
            showChaptersForVolume(card.id);
        }
        if (target.closest('.chapter-card')) {
            const card = target.closest('.chapter-card');
            const volId = card.dataset.volumeId;
            const chapNum = card.dataset.chapterNumber;
            window.location.href = `/viewer?id=${volId}&chapter=${chapNum}`;
        }
    });

    // Input Change Events
    container.addEventListener('change', e => {
        if (e.target.id === 'globalSeriesSelect') {
            localStorage.setItem('globalSeries', e.target.value);
            localStorage.removeItem('globalVolumeId');
            localStorage.removeItem('globalVolumeFolder');
            populateVolumeSelect('globalVolumeSelect', e.target.value).then(() => {
                const sVol = document.getElementById('globalVolumeSelect');   
                if(sVol) sVol.value = '';
            });
        }
        if (e.target.id === 'globalVolumeSelect') {
            const option = e.target.options[e.target.selectedIndex];
            if (option && option.value) {
                localStorage.setItem('globalVolumeId', e.target.value);       
                localStorage.setItem('globalVolumeFolder', option.getAttribute('data-folder') || '');
            } else {
                localStorage.removeItem('globalVolumeId');
                localStorage.removeItem('globalVolumeFolder');
            }
        }
        // Series to Volume Filtering
        if (e.target.id === 'volumeSeriesSelect') populateVolumeSelect('volumeSelect', e.target.value);
        if (e.target.id === 'chapterSeriesSelect') populateVolumeSelect('chapterVolumeSelect', e.target.value);
        if (e.target.id === 'builderSeriesSelect') populateVolumeSelect('builderVolumeSelect', e.target.value);
        if (e.target.id === 'insertSeriesSelect') populateVolumeSelect('insertVolumeSelect', e.target.value);
        if (e.target.id === 'scriptSeriesSelect') populateVolumeSelect('scriptVolumeSelect', e.target.value);
        if (e.target.id === 'editSeriesSelect') populateVolumeSelect('editVolumeSelect', e.target.value);
        if (e.target.id === 'arrangeSeriesSelect') populateVolumeSelect('arrangeVolumeSelect', e.target.value);
        if (e.target.id === 'exportSeriesSelect') populateVolumeSelect('exportVolumeSelect', e.target.value);

        if (e.target.id === 'builderVolumeSelect') {
            const sId = document.getElementById('builderSeriesSelect').value;
            populateChapterSelect(e.target.value, 'builderChapterSelect', true, sId);
        }
        if (e.target.id === 'insertVolumeSelect') {
            const sId = document.getElementById('insertSeriesSelect').value;
            populateChapterSelect(e.target.value, 'insertChapterSelect', true, sId);
        }
        if (e.target.id === 'editChapterSelect') {
            populateEditPageSelect(document.getElementById('editVolumeSelect').value, e.target.value);
            // Sync session
            if (window.EDITOR_SESSION) window.EDITOR_SESSION.chapterId = e.target.value;
        }
        if (e.target.id === 'editPageSelect') {
            document.getElementById('loadPageBtn').disabled = !e.target.value;
            // Sync session
            if (window.EDITOR_SESSION) window.EDITOR_SESSION.pageId = e.target.value;
        }
        if (e.target.id === 'editVolumeSelect') {
            populateChapterSelect(e.target.value, 'editChapterSelect', false);
            // Sync session
            if (window.EDITOR_SESSION) {
                window.EDITOR_SESSION.volumeId = e.target.value;
                const opt = e.target.options[e.target.selectedIndex];
                window.EDITOR_SESSION.volume = opt?.getAttribute('data-folder');
            }
        }
        if (e.target.id === 'editSeriesSelect') {
            populateVolumeSelect('editVolumeSelect', e.target.value);
            // Sync session
            if (window.EDITOR_SESSION) {
                window.EDITOR_SESSION.seriesId = e.target.value;
                const opt = e.target.options[e.target.selectedIndex];
                window.EDITOR_SESSION.seriesFolder = opt?.getAttribute('data-folder');
            }
        }
    });
}
