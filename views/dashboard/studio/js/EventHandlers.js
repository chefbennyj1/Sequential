// views/dashboard/studio/js/EventHandlers.js

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

let currentSceneInfo = {};

export function initEventHandlers(container, allSections) {
    const sidebar = container.querySelector('.sidebar');

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

            const sec = container.querySelector('.' + page);
            if (sec) sec.classList.remove('hidden');
        }

        // Account Settings Link
        if (target.id === 'accountSettingsBtn') {
            e.preventDefault();
            allSections.forEach(s => s.classList.add('hidden'));
            container.querySelector('.user-settings.dashboard-section').classList.remove('hidden');
            updateUrlState({ tab: 'user-settings' });
        }

        // STUDIO HUB: Mode Cards
        if (target.classList.contains('mode-card') && target.closest('.studio')) {
            const targetPage = target.dataset.target;
            if (!targetPage) return;

            container.querySelector('.studio').classList.add('hidden');       

            const targetSection = container.querySelector('.' + targetPage);  
            if (targetSection) {
                targetSection.classList.remove('hidden');

                if (targetPage === 'create-new-volume') populateSeriesSelect('createVolumeSeriesSelect');
                if (targetPage === 'edit-volume') populateSeriesSelect('volumeSeriesSelect');
                if (targetPage === 'create-new-chapter') populateSeriesSelect('chapterSeriesSelect');
                if (targetPage === 'export-tool') populateSeriesSelect('exportSeriesSelect');
                if (targetPage === 'page-builder') {
                    populateSeriesSelect('builderSeriesSelect');
                    populateSeriesSelect('insertSeriesSelect');
                    populateSeriesSelect('scriptSeriesSelect');
                    populateSeriesSelect('editSeriesSelect');
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
            currentSceneInfo = { volume: vol, chapter: chap, pageId: pageId, seriesId, seriesFolder };
            setActivePage(vol, chap, pageId, seriesId, seriesFolder);
            updateUrlState({ tab: 'page-builder', vol, chap, page: pageId, series: seriesId, seriesFolder });
        }

        // Editor Openers
        if (target.id === 'openLayoutEditorBtn') openVisualEditor(target.dataset.vol, target.dataset.chap, target.dataset.page, currentDesignMode, target.dataset.series, target.dataset.seriesFolder);
        if (target.id === 'openSceneEditorBtn') openSceneEditor(target.dataset.vol, target.dataset.chap, target.dataset.page, currentDesignMode, target.dataset.series);

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
        if (e.target.id === 'exportSeriesSelect') populateVolumeSelect('exportVolumeSelect', e.target.value);

        if (e.target.id === 'builderVolumeSelect') populateChapterSelect(e.target.value, 'builderChapterSelect', true);
        if (e.target.id === 'insertVolumeSelect') populateChapterSelect(e.target.value, 'insertChapterSelect', true);
        if (e.target.id === 'editVolumeSelect') populateChapterSelect(e.target.value, 'editChapterSelect', false);
        if (e.target.id === 'editChapterSelect') populateEditPageSelect(document.getElementById('editVolumeSelect').value, e.target.value);
        if (e.target.id === 'editPageSelect') {
            document.getElementById('loadPageBtn').disabled = !e.target.value;
        }
    });
}
