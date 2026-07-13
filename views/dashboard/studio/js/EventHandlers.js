import { updateUrlState } from './Navigation.js';
import { switchToSection, lastStudioSection } from './SectionRouter.js';
import {
    populateSeriesSelect,
    populateVolumeSelect,
    populateChapterSelect,
    populateEditPageSelect,
    showVolumesForSeries,
    showChaptersForVolume
} from './LibraryManager.js';
import { setActivePage } from './PageConfigManager.js';
import { activatePageBuilderPane } from './PageBuilderModes.js';
import { openVisualEditor } from '../../components/SceneEditor/SceneEditor.js';
import ArrangeManager from './ArrangeManager.js';

let currentSceneInfo = {};
let arrangeManager;

/**
 * The active-page breadcrumb doubles as the navigation trigger; the popover
 * holds the series/volume/chapter/page cascade that used to live in a sidebar.
 */
function toggleNavPopover(force) {
    const popover = document.getElementById('pageNavPopover');
    if (!popover) return;
    const show = force ?? popover.classList.contains('hidden');
    popover.classList.toggle('hidden', !show);
    document.getElementById('activePageCrumb')?.setAttribute('aria-expanded', String(show));
    // Preload only if the section switch hasn't populated the cascade yet,
    // so reopening the popover never resets an in-progress selection
    if (show && !document.getElementById('editSeriesSelect')?.options.length) {
        populateSeriesSelect('editSeriesSelect');
    }
}

function loadSelectedPage() {
    const vS = document.getElementById('editVolumeSelect');
    const cS = document.getElementById('editChapterSelect');
    const pS = document.getElementById('editPageSelect');
    const sS = document.getElementById('editSeriesSelect');

    const vol = vS?.options[vS.selectedIndex]?.getAttribute('data-folder');
    const seriesId = sS?.value;
    const seriesFolder = sS?.options[sS.selectedIndex]?.getAttribute('data-folder');
    const chapNum = cS?.options[cS.selectedIndex]?.getAttribute('data-number');
    const pageId = pS?.value;

    if (!vol || !chapNum || !pageId || !seriesId) return;

    const chap = 'chapter-' + chapNum;

    window.EDITOR_SESSION = {
        volume: vol,
        volumeId: vS.value,
        chapter: chap,
        chapterId: cS.value,
        pageId,
        seriesId,
        seriesFolder
    };

    setActivePage(vol, chap, pageId, seriesId, seriesFolder);
    updateUrlState({ tab: 'page-builder', vol, chap, page: pageId, series: seriesId, seriesFolder });
    toggleNavPopover(false);
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

    // Navigation popover closes on any click outside it (the empty-state
    // button is exempt: its own handler is the one opening it)
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.pb-context-nav') && !e.target.closest('#layoutEmptyPickBtn')) {
            toggleNavPopover(false);
        }
    });

    const accountSettingsBtn = document.getElementById('accountSettingsBtn');
    if (accountSettingsBtn) {
        accountSettingsBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            userMenu?.classList.remove('show');
            updateUrlState({ tab: 'user-settings' });
            await switchToSection('user-settings', container);
        });
    }

    // Global Event Delegation
    container.addEventListener('click', async (e) => {
        const target = e.target.closest('button, li, .glass-tab, .volume-card, .series-card, #accountSettingsBtn');
        if (!target) return;

        // Topbar Navigation ("Studio" resolves to the last rail section)
        if (target.classList.contains('glass-tab') && target.closest('#main-navigation')) {
            let page = target.dataset.page;
            if (!page) return;
            if (page === 'studio') page = lastStudioSection();
            updateUrlState({ tab: page });

            // Note: active state handled inside switchToSection for glass-tabs
            await switchToSection(page, container);
        }

        // Studio rail
        const railBtn = target.closest('.studio-rail__btn');
        if (railBtn && railBtn.dataset.target) {
            updateUrlState({ tab: railBtn.dataset.target });
            await switchToSection(railBtn.dataset.target, container);
        }

        // Account Settings Link
        if (target.id === 'accountSettingsBtn') {
            e.preventDefault();
            updateUrlState({ tab: 'user-settings' });
            await switchToSection('user-settings', container);
        }

        // Active-page breadcrumb (and the Layout pane's empty state) opens navigation
        if (target.id === 'activePageCrumb' || target.id === 'layoutEmptyPickBtn') {
            toggleNavPopover();
        }

        // --- Deep Link Openers (from Page Builder) ---
        if (target.id === 'openLayoutEditorBtn') {
            const { vol, chap, page, series, seriesFolder } = target.dataset;
            openVisualEditor(vol, chap, page, 'portrait', series, seriesFolder);
        }


        // Page Builder tool rail
        const pbTool = target.closest('.pb-tool');
        if (pbTool && pbTool.dataset.pane) {
            activatePageBuilderPane(pbTool.dataset.pane);
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
            if (window.EDITOR_SESSION) window.EDITOR_SESSION.pageId = e.target.value;
            if (e.target.value && e.isTrusted) loadSelectedPage();
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
