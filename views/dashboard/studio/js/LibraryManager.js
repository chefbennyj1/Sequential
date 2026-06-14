// views/dashboard/js/LibraryManager.js

import {
    fetchVolumesAPI,
    fetchChaptersAPI,
    fetchChapterDetailsAPI,
    fetchSingleVolumeWithChapters,
    fetchLayouts,
    fetchSeriesAPI,
    fetchSeriesDetailsAPI
} from '../api/StudioClient.js';
import { getFolderNameFromPath } from './Navigation.js';
import { renderCard, renderChapterCard, renderSeriesCard } from '../../components/CardBuilder/CardBuilder.js';

/**
 * Populates series selection dropdowns.
 */
export async function populateSeriesSelect(id) {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = '<option value="">Select a Series</option>';
    try {
        const seriesList = await fetchSeriesAPI();
        seriesList.forEach(series => {
            const option = document.createElement('option');
            option.value = series._id;
            option.setAttribute('data-folder', series.folderName);
            option.textContent = series.title;
            select.appendChild(option);
        });

        if (id !== 'globalSeriesSelect') {
            const savedSeries = window.EDITOR_SESSION?.seriesId || localStorage.getItem('globalSeries');
            if (savedSeries) {
                // Delay dispatching to allow UI render cycle to complete if needed
                setTimeout(() => {
                    if(Array.from(select.options).some(opt => opt.value === savedSeries)) {
                        select.value = savedSeries;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, 50);
            }
        }
    } catch (err) {
        console.error("Error populating series select:", err);
    }
}

/**
 * Populates volume selection dropdowns, optionally filtered by series.
 */
export async function populateVolumeSelect(id = 'volumeSelect', seriesId = null) {
    const select = document.getElementById(id);
    if (!select) return;
    
    if (!seriesId) {
        select.innerHTML = '<option value="">Select a Series first</option>';
        select.disabled = true;
        return;
    }

    select.innerHTML = '<option value="">Select a Volume</option>';
    const volumes = await fetchVolumesAPI();
    
    // Filter volumes by series if seriesId is provided
    const filteredVolumes = volumes.filter(v => v.series === seriesId);
    
    if (filteredVolumes.length === 0) {
        select.innerHTML = '<option value="">No volumes found</option>';
        select.disabled = true;
        return;
    }

    filteredVolumes.forEach(volume => {
        const option = document.createElement('option');
        // Folder mode logic used by create/insert/chapter forms
        const isFolderMode = (id === 'builderVolumeSelect' || id === 'insertVolumeSelect' || id === 'chapterVolumeSelect');
        option.value = isFolderMode ? getFolderNameFromPath(volume.volumePath) : volume._id;
        
        if (id === 'editVolumeSelect' || id === 'scriptVolumeSelect' || id === 'exportVolumeSelect' || id === 'globalVolumeSelect') {
            option.setAttribute('data-folder', getFolderNameFromPath(volume.volumePath));
        }
        
        if (volume.series) option.setAttribute('data-series-id', volume.series);
        option.textContent = volume.title;
        select.appendChild(option);
    });
    select.disabled = false;

    if (id !== 'globalVolumeSelect') {
        const savedVolume = (id === 'editVolumeSelect') ? window.EDITOR_SESSION?.volumeId : (localStorage.getItem('globalVolumeId') || window.EDITOR_SESSION?.volumeId);
        const savedFolder = window.EDITOR_SESSION?.volume;

        const isFolderMode = (id === 'builderVolumeSelect' || id === 'insertVolumeSelect' || id === 'chapterVolumeSelect');
        const targetVal = isFolderMode ? (savedFolder || localStorage.getItem('globalVolumeFolder')) : savedVolume;
        
        if (targetVal) {
            setTimeout(() => {
                if(Array.from(select.options).some(opt => opt.value === targetVal)) {
                    select.value = targetVal;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, 50);
        }
    }
}

/**
 * Populates chapter selection dropdowns.
 */
export async function populateChapterSelect(volumeId, selectId = 'chapterSelect', folderMode = false, seriesId = null) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">Select a Chapter</option>';
    select.disabled = true;
    if (!volumeId) return;

    let realVolumeId = volumeId;
    if (folderMode) {
        const volumes = await fetchVolumesAPI();
        // Disambiguate using seriesId if provided, otherwise fallback to first match
        const v = volumes.find(v => {
            const matchesFolder = getFolderNameFromPath(v.volumePath) === volumeId;
            if (!seriesId) return matchesFolder;
            return matchesFolder && v.series === seriesId;
        });
        if (!v) return;
        realVolumeId = v._id;
    }

    const chapters = await fetchChaptersAPI(realVolumeId);
    const fragment = document.createDocumentFragment();
    
    chapters.forEach(chapter => {
        const option = document.createElement('option');
        option.value = folderMode ? `chapter-${chapter.chapterNumber}` : chapter._id;
        if (selectId === 'editChapterSelect') option.setAttribute('data-number', chapter.chapterNumber);
        option.textContent = `Chapter ${chapter.chapterNumber}: ${chapter.title}`;
        fragment.appendChild(option);
    });
    
    select.appendChild(fragment);
    select.disabled = false;

    // Restore from session
    if (selectId === 'editChapterSelect' && window.EDITOR_SESSION?.chapterId) {
        setTimeout(() => {
            if(Array.from(select.options).some(opt => opt.value === window.EDITOR_SESSION.chapterId)) {
                select.value = window.EDITOR_SESSION.chapterId;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, 50);
    }
}

/**
 * Populates page selection dropdowns for editing.
 */
export async function populateEditPageSelect(volumeId, chapterId) {
    const select = document.getElementById('editPageSelect');
    if (!select) return;
    select.innerHTML = '<option value="">Select a Page</option>';
    select.disabled = true;
    if (!volumeId || !chapterId) return;

    const chapter = await fetchChapterDetailsAPI(volumeId, chapterId);
    if (chapter && chapter.pages) {
        chapter.pages.forEach(page => {
            const option = document.createElement('option');
            let pageId = 'unknown';
            if (page.path) {
                const parts = page.path.replace(/\\/g, '/').split('/').filter(p => p.length > 0);
                const lastPart = parts[parts.length - 1];
                // If last part is a file (has dot), pageId is parent folder. 
                // Otherwise last part IS the page folder.
                pageId = lastPart.includes('.') ? parts[parts.length - 2] : lastPart;
            }
            option.value = pageId;
            option.textContent = `Page ${page.index} (${pageId})`;
            select.appendChild(option);
        });
        select.disabled = false;

        // Restore from session
        if (window.EDITOR_SESSION?.pageId) {
            setTimeout(() => {
                if(Array.from(select.options).some(opt => opt.value === window.EDITOR_SESSION.pageId)) {
                    select.value = window.EDITOR_SESSION.pageId;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, 50);
        }
    }
}

/**
 * Basic layout selection for the "New Page" form.
 */
export async function populateLayoutSelect(targetId = 'builderLayoutSelect') {
    const select = document.getElementById(targetId); 
    if (!select) return;
    try {
        const data = await fetchLayouts('portrait'); // Always use portrait in the new architecture
        if (data.ok) {
            select.innerHTML = '<option value="">Select a Layout</option>';
            data.layouts.forEach(l => { 
                const o = document.createElement('option'); 
                o.value = l; 
                const friendlyName = l.replace('.html', '').replace(/_/g, ' ');
                o.textContent = friendlyName.toUpperCase(); 
                select.appendChild(o); 
            });
        }
    } catch (err) { console.error(err); }
}

/**
 * Renders the top-level Library view (Series cards).
 */
export async function renderLibraryHtml(seriesList, libraryRowElement) {
    if (!libraryRowElement) return;
    libraryRowElement.innerHTML = ''; // Clear existing
    seriesList.forEach(series => {
        const imgUrl = series.coverImage || '/views/public/images/folder.png';
        const cardHtml = renderSeriesCard({ _id: series._id, title: series.title, imgUrl: `${imgUrl}?resize=500` });
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = cardHtml;
        const card = tempDiv.firstElementChild;
        if (card) libraryRowElement.appendChild(card);
    });
}

/**
 * Drills down from Series into its Volumes.
 */
export async function showVolumesForSeries(seriesId) {
    const series = await fetchSeriesDetailsAPI(seriesId);
    if (!series || !series.volumes || series.volumes.length === 0) {
        alert("No volumes found for this series.");
        return;
    }
    const librarySection = document.querySelector('.library');
    const libraryRow = librarySection.querySelector('.row');
    
    let volumesDisplay = document.querySelector('.volumes-display');
    if (!volumesDisplay) {
        volumesDisplay = document.createElement('div');
        volumesDisplay.classList.add('volumes-display');
        librarySection.appendChild(volumesDisplay);
    }
    
    volumesDisplay.innerHTML = ''; // Full clear

    // 1. Header & Back Button
    const headerRow = document.createElement('div');
    headerRow.className = 'flex-row-center gap-20 margin-b-20';

    const backBtn = document.createElement('button');
    backBtn.className = 'small';
    backBtn.id = 'backToSeriesBtn';
    backBtn.innerHTML = '&larr; Back to Library';
    backBtn.onclick = () => {
        volumesDisplay.classList.add('hidden');
        libraryRow.classList.remove('hidden');
    };
    headerRow.appendChild(backBtn);

    const title = document.createElement('h2');
    title.className = 'props-header';
    title.textContent = `${series.title} - Volumes`;
    headerRow.appendChild(title);
    
    volumesDisplay.appendChild(headerRow);

    // 2. Volumes Grid
    const volumesGrid = document.createElement('div');
    volumesGrid.className = 'volumes-grid row flex-row flex-wrap gap-20';

    series.volumes.forEach(volume => {
        const cardHtml = renderCard({
            _id: volume._id, 
            index: volume.index, 
            title: volume.title, 
            imgUrl: `${volume.coverImage || '/views/public/images/folder.png'}?resize=500`,
            seriesTitle: series.title
        });
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = cardHtml;
        const card = tempDiv.firstElementChild;
        if (card) {
            card.onclick = () => showChaptersForVolume(volume._id);
            volumesGrid.appendChild(card);
        }
    });
    
    volumesDisplay.appendChild(volumesGrid);
    
    libraryRow.classList.add('hidden');
    volumesDisplay.classList.remove('hidden');
    
    const chaptersDisplay = document.querySelector('.chapters-display');
    if (chaptersDisplay) chaptersDisplay.classList.add('hidden');
}

/**
 * Drills down from Volume into its Chapters.
 */
export async function showChaptersForVolume(volumeId) {
    const volume = await fetchSingleVolumeWithChapters(volumeId);
    if (!volume || !volume.chapters || volume.chapters.length === 0) {
        alert("No chapters found for this volume.");
        return;
    }
    const librarySection = document.querySelector('.library');
    const volumesDisplay = document.querySelector('.volumes-display');
    
    let chaptersDisplay = document.querySelector('.chapters-display');
    if (!chaptersDisplay) {
        chaptersDisplay = document.createElement('div');
        chaptersDisplay.classList.add('chapters-display');
        librarySection.appendChild(chaptersDisplay);
    }
    
    chaptersDisplay.innerHTML = ''; // Full clear

    // 1. Header & Back Button
    const headerRow = document.createElement('div');
    headerRow.className = 'flex-row-center gap-20 margin-b-20';

    const backBtn = document.createElement('button');
    backBtn.className = 'small';
    backBtn.id = 'backToVolumesBtn';
    backBtn.innerHTML = '&larr; Back to Volumes';
    backBtn.onclick = () => {
        chaptersDisplay.classList.add('hidden');
        if (volumesDisplay) {
            volumesDisplay.classList.remove('hidden');
        } else {
            const libraryRow = document.querySelector('.library .row');
            if (libraryRow) libraryRow.classList.remove('hidden');
        }
    };
    headerRow.appendChild(backBtn);

    const title = document.createElement('h2');
    title.className = 'props-header';
    title.textContent = `${volume.title} - Chapters`;
    headerRow.appendChild(title);
    
    chaptersDisplay.appendChild(headerRow);

    // 2. Chapters Grid
    const chaptersGrid = document.createElement('div');
    chaptersGrid.className = 'chapters-grid';

    volume.chapters.forEach(chapter => {
        const cardHtml = renderChapterCard({ 
            title: chapter.title, 
            chapterNumber: chapter.chapterNumber, 
            pages: chapter.pages, 
            volumeId 
        });
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = cardHtml;
        const card = tempDiv.firstElementChild;
        if (card) {
            card.onclick = () => window.location.href = `/viewer?id=${volumeId}&chapter=${chapter.chapterNumber}`;
            chaptersGrid.appendChild(card);
        }
    });
    
    chaptersDisplay.appendChild(chaptersGrid);

    if (volumesDisplay) volumesDisplay.classList.add('hidden');
    const libraryRow = document.querySelector('.library .row');
    if (libraryRow) libraryRow.classList.add('hidden');
    chaptersDisplay.classList.remove('hidden');
}
