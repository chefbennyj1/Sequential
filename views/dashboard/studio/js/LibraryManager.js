// views/dashboard/js/LibraryManager.js

import {
    fetchVolumesAPI,
    fetchChaptersAPI,
    fetchChapterDetailsAPI,
    fetchSingleVolumeWithChapters,
    fetchLayouts,
    fetchSeriesAPI,
    fetchSeriesDetailsAPI
} from './ApiService.js';
import { getFolderNameFromPath } from './Navigation.js';
import { renderCard, renderChapterCard, renderSeriesCard } from '../../components/CardBuilder/CardBuilder.js';

/**
 * Populates volume selection dropdowns.
 */
export async function populateVolumeSelect(id = 'volumeSelect') {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = '<option value="">Select a Volume</option>';
    const volumes = await fetchVolumesAPI();
    volumes.forEach(volume => {
        const option = document.createElement('option');
        option.value = (id === 'builderVolumeSelect' || id === 'insertVolumeSelect' || id === 'chapterVolumeSelect') ? getFolderNameFromPath(volume.volumePath) : volume._id;
        if (id === 'editVolumeSelect') option.setAttribute('data-folder', getFolderNameFromPath(volume.volumePath));
        if (volume.series) option.setAttribute('data-series-id', volume.series);
        option.textContent = volume.title;
        select.appendChild(option);
    });
}

/**
 * Populates chapter selection dropdowns.
 */
export async function populateChapterSelect(volumeId, selectId = 'chapterSelect', folderMode = false) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">Select a Chapter</option>';
    select.disabled = true;
    if (!volumeId) return;

    let realVolumeId = volumeId;
    if (folderMode) {
        const volumes = await fetchVolumesAPI();
        const v = volumes.find(v => getFolderNameFromPath(v.volumePath) === volumeId);
        if (!v) return;
        realVolumeId = v._id;
    }

    const chapters = await fetchChaptersAPI(realVolumeId);
    chapters.forEach(chapter => {
        const option = document.createElement('option');
        option.value = folderMode ? `chapter-${chapter.chapterNumber}` : chapter._id;
        if (selectId === 'editChapterSelect') option.setAttribute('data-number', chapter.chapterNumber);
        option.textContent = `Chapter ${chapter.chapterNumber}: ${chapter.title}`;
        select.appendChild(option);
    });
    select.disabled = false;
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
                // Path format: .../Volumes/volume-1/chapter-1/page1/page.json or page1.html
                const parts = page.path.replace(/\\/g, '/').split('/');
                // The pageId is the folder name, which is the 2nd to last part
                pageId = parts[parts.length - 2];
            }
            option.value = pageId;
            option.textContent = `Page ${page.index} (${pageId})`;
            select.appendChild(option);
        });
        select.disabled = false;
    }
}

/**
 * Basic layout selection for the "New Page" form.
 */
export async function populateLayoutSelect(targetId = 'builderLayoutSelect') {
    const select = document.getElementById(targetId); 
    if (!select) return;
    try {
        const data = await fetchLayouts();
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
    let html = '';
    seriesList.forEach(series => {
        const imgUrl = series.coverImage || '/views/public/images/folder.png';
        html += renderSeriesCard({ _id: series._id, title: series.title, imgUrl: `${imgUrl}?resize=500` });
    });
    libraryRowElement.innerHTML = html;
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
    let volumesDisplay = document.querySelector('.volumes-display') || document.createElement('div');
    if (!volumesDisplay.classList.contains('volumes-display')) {
        volumesDisplay.classList.add('volumes-display');
        librarySection.appendChild(volumesDisplay);
    }
    volumesDisplay.innerHTML = `
        <div class="flex-row-center gap-20 margin-b-20">
            <button class="small" id="backToSeriesBtn">&larr; Back to Library</button>
            <h2 class="props-header">${series.title} - Volumes</h2>
        </div>
        <div class="volumes-grid row flex-row flex-wrap gap-20"></div>
    `;
    const volumesGrid = volumesDisplay.querySelector('.volumes-grid');
    series.volumes.forEach(volume => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = renderCard({
            _id: volume._id, 
            index: volume.index, 
            title: volume.title, 
            imgUrl: `${volume.coverImage || '/views/public/images/folder.png'}?resize=500`,
            seriesTitle: series.title
        });
        const card = tempDiv.firstElementChild;
        card.onclick = () => showChaptersForVolume(volume._id);
        volumesGrid.appendChild(card);
    });
    document.getElementById('backToSeriesBtn').onclick = () => {
        volumesDisplay.classList.add('hidden');
        libraryRow.classList.remove('hidden');
    };
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
    let chaptersDisplay = document.querySelector('.chapters-display') || document.createElement('div');
    if (!chaptersDisplay.classList.contains('chapters-display')) {
        chaptersDisplay.classList.add('chapters-display');
        librarySection.appendChild(chaptersDisplay);
    }
    chaptersDisplay.innerHTML = `
        <div class="flex-row-center gap-20 margin-b-20">
            <button class="small" id="backToVolumesBtn">&larr; Back to Volumes</button>
            <h2 class="props-header">${volume.title} - Chapters</h2>
        </div>
        <div class="chapters-grid"></div>
    `;
    const chaptersGrid = chaptersDisplay.querySelector('.chapters-grid');
    volume.chapters.forEach(chapter => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = renderChapterCard({ title: chapter.title, chapterNumber: chapter.chapterNumber, pages: chapter.pages, volumeId });
        const card = tempDiv.firstElementChild;
        card.onclick = () => window.location.href = `/viewer?id=${volumeId}&chapter=${chapter.chapterNumber}`;
        chaptersGrid.appendChild(card);
    });
    document.getElementById('backToVolumesBtn').onclick = () => {
        chaptersDisplay.classList.add('hidden');
        if (volumesDisplay) {
            volumesDisplay.classList.remove('hidden');
        } else {
            const libraryRow = document.querySelector('.library .row');
            if (libraryRow) libraryRow.classList.remove('hidden');
        }
    };
    if (volumesDisplay) volumesDisplay.classList.add('hidden');
    const libraryRow = document.querySelector('.library .row');
    if (libraryRow) libraryRow.classList.add('hidden');
    chaptersDisplay.classList.remove('hidden');
}
