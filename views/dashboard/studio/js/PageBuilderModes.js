// views/dashboard/studio/js/PageBuilderModes.js

/**
 * Page Builder mode panes and their persistent left tool rail.
 * One pane is visible at a time; the rail button for it stays highlighted,
 * so switching modes never requires a "back" step.
 */
import { populateSeriesSelect, populateLayoutSelect } from './LibraryManager.js';

const PANES = {
    createPageContainer: () => { populateSeriesSelect('builderSeriesSelect'); populateLayoutSelect(); },
    insertPageContainer: () => populateSeriesSelect('insertSeriesSelect'),
    editPageContainer: () => populateSeriesSelect('editSeriesSelect'),
    arrangePagesContainer: () => populateSeriesSelect('arrangeSeriesSelect'),
    exportScriptContainer: () => populateSeriesSelect('scriptSeriesSelect')
};

export function activatePageBuilderPane(paneId) {
    if (!PANES[paneId]) return;
    Object.keys(PANES).forEach(id =>
        document.getElementById(id)?.classList.toggle('hidden', id !== paneId));
    document.querySelectorAll('#pageBuilderToolbar .pb-tool').forEach(btn =>
        btn.classList.toggle('is-active', btn.dataset.pane === paneId));
    PANES[paneId]();
}

/** Pane currently showing, if any. */
export function visiblePageBuilderPane() {
    return Object.keys(PANES).find(id =>
        !document.getElementById(id)?.classList.contains('hidden')) || null;
}
