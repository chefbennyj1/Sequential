// views/dashboard/components/PagePicker/PagePicker.js

import {
    fetchSeriesAPI,
    fetchVolumesAPI,
    fetchChaptersAPI,
    fetchChapterDetailsAPI
} from '../../studio/api/StudioClient.js';
import { getFolderNameFromPath } from '../../studio/js/Navigation.js';

/**
 * Self-contained series → volume → chapter → page cascade.
 * Renders into `container`, wires its own change handlers, and calls
 * `onPick({ vol, chap, pageId, seriesId, seriesFolder })` when a page is
 * chosen. Uses no global element ids, so any number of pickers can coexist —
 * unlike the id-keyed cascade in LibraryManager, which this is the eventual
 * replacement for.
 */
export function createPagePicker(container, onPick) {
    container.innerHTML = `
        <div class="form-group margin-b-15">
            <label>Series</label>
            <select data-role="series" disabled><option value="">Loading…</option></select>
        </div>
        <div class="form-group margin-b-15">
            <label>Volume</label>
            <select data-role="volume" disabled><option value="">Select a Series first</option></select>
        </div>
        <div class="form-group margin-b-15">
            <label>Chapter</label>
            <select data-role="chapter" disabled><option value="">Select a Volume first</option></select>
        </div>
        <div class="form-group">
            <label>Page</label>
            <select data-role="page" disabled><option value="">Select a Chapter first</option></select>
        </div>
    `;

    const sel = (role) => container.querySelector(`select[data-role="${role}"]`);
    const seriesSel = sel('series');
    const volumeSel = sel('volume');
    const chapterSel = sel('chapter');
    const pageSel = sel('page');

    const reset = (select, placeholder) => {
        select.innerHTML = `<option value="">${placeholder}</option>`;
        select.disabled = true;
    };

    const addOption = (select, value, text, data = {}) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = text;
        Object.entries(data).forEach(([k, v]) => { opt.dataset[k] = v; });
        select.appendChild(opt);
    };

    seriesSel.addEventListener('change', async () => {
        reset(volumeSel, 'Select a Volume');
        reset(chapterSel, 'Select a Volume first');
        reset(pageSel, 'Select a Chapter first');
        if (!seriesSel.value) return;

        const volumes = (await fetchVolumesAPI()).filter(v => v.series === seriesSel.value);
        volumes.forEach(v => addOption(volumeSel, v._id, v.title, { folder: getFolderNameFromPath(v.volumePath) }));
        volumeSel.disabled = volumes.length === 0;
    });

    volumeSel.addEventListener('change', async () => {
        reset(chapterSel, 'Select a Chapter');
        reset(pageSel, 'Select a Chapter first');
        if (!volumeSel.value) return;

        const chapters = await fetchChaptersAPI(volumeSel.value);
        chapters.forEach(c => addOption(chapterSel, c._id, `Chapter ${c.chapterNumber}: ${c.title}`, { number: c.chapterNumber }));
        chapterSel.disabled = chapters.length === 0;
    });

    chapterSel.addEventListener('change', async () => {
        reset(pageSel, 'Select a Page');
        if (!chapterSel.value) return;

        const chapter = await fetchChapterDetailsAPI(volumeSel.value, chapterSel.value);
        (chapter?.pages || []).forEach(p => {
            // The pageId is the page's folder name, recovered from its path
            const parts = (p.path || '').replace(/\\/g, '/').split('/').filter(Boolean);
            const last = parts[parts.length - 1] || '';
            const pageId = last.includes('.') ? parts[parts.length - 2] : last;
            if (pageId) addOption(pageSel, pageId, `Page ${p.index} (${pageId})`);
        });
        pageSel.disabled = pageSel.options.length <= 1;
    });

    pageSel.addEventListener('change', () => {
        if (!pageSel.value) return;
        const sOpt = seriesSel.options[seriesSel.selectedIndex];
        const vOpt = volumeSel.options[volumeSel.selectedIndex];
        const cOpt = chapterSel.options[chapterSel.selectedIndex];
        onPick({
            vol: vOpt?.dataset.folder,
            chap: `chapter-${cOpt?.dataset.number}`,
            pageId: pageSel.value,
            seriesId: seriesSel.value,
            seriesFolder: sOpt?.dataset.folder
        });
    });

    let loaded = false;
    return {
        /** Populate the series list; safe to call repeatedly (loads once). */
        async load() {
            if (loaded) return;
            const seriesList = await fetchSeriesAPI();
            reset(seriesSel, 'Select a Series');
            seriesList.forEach(s => addOption(seriesSel, s._id, s.title || s.folderName, { folder: s.folderName }));
            seriesSel.disabled = false;
            loaded = true;
        }
    };
}
