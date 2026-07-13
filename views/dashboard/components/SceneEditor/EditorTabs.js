// views/dashboard/components/SceneEditor/EditorTabs.js

/**
 * Photopea-style open-page tabs across the visual editor header.
 * Tabs are bookmarks, not documents: there is exactly one live editing
 * context at a time, and selecting a tab context-switches through the same
 * path a spread partner click uses. Saves are action-based and capture their
 * page context, so no state needs flushing on a switch.
 */

const STORAGE_KEY = 'sequential_editor_tabs';
const MAX_TABS = 8;

let tabs = [];        // [{ volume, chapter, pageId, seriesId, seriesFolder }]
let activeKey = null;
let loadingKey = null;
let handlers = {};    // { onSelect(tab), onEmpty(), onAdd() }

const keyOf = (t) => `${t.volume}/${t.chapter}/${t.pageId}`;

function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
}

/** "volume-2 / chapter-1 / page12" → "v2·c1·p12" */
function compactLabel(t) {
    const num = (s) => (String(s).match(/\d+/) || [s])[0];
    return `v${num(t.volume)}·c${num(t.chapter)}·p${num(t.pageId)}`;
}

function render() {
    const strip = document.getElementById('editorPageTabs');
    if (!strip) return;

    strip.innerHTML = tabs.map(t => {
        const key = keyOf(t);
        const state = `${key === activeKey ? 'is-active' : ''} ${key === loadingKey ? 'is-loading' : ''}`;
        return `
            <div class="page-tab ${state}" data-key="${key}" title="${t.volume} / ${t.chapter} / ${t.pageId}">
                <span class="page-tab__label">${compactLabel(t)}</span>
                <button type="button" class="page-tab__close" aria-label="Close ${t.pageId}">
                    <ion-icon name="close-outline"></ion-icon>
                </button>
            </div>`;
    }).join('') + `
        <button type="button" class="page-tab__add" title="Open a page" aria-label="Open a page">
            <ion-icon name="add-outline"></ion-icon>
        </button>`;

    strip.querySelector('.page-tab.is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function closeTab(key) {
    const idx = tabs.findIndex(t => keyOf(t) === key);
    if (idx === -1) return;

    tabs.splice(idx, 1);
    persist();

    if (key !== activeKey) return render();

    // Closed the active tab: focus the right-hand neighbour, else the left
    const neighbour = tabs[idx] || tabs[idx - 1];
    if (neighbour) {
        handlers.onSelect?.(neighbour);
    } else {
        activeKey = null;
        render();
        handlers.onEmpty?.();
    }
}

export function initEditorTabs(h) {
    handlers = h || {};
    try {
        tabs = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
        tabs = [];
    }

    const strip = document.getElementById('editorPageTabs');
    if (!strip) return;

    strip.addEventListener('click', (e) => {
        if (e.target.closest('.page-tab__add')) {
            handlers.onAdd?.();
            return;
        }
        const tabEl = e.target.closest('.page-tab');
        if (!tabEl) return;
        if (e.target.closest('.page-tab__close')) {
            closeTab(tabEl.dataset.key);
        } else if (tabEl.dataset.key !== activeKey) {
            const tab = tabs.find(t => keyOf(t) === tabEl.dataset.key);
            if (tab) handlers.onSelect?.(tab);
        }
    });

    render();
}

/** Open (or focus) the tab for a page context. Oldest tab drops past the cap. */
export function openEditorTab(ctx) {
    const key = keyOf(ctx);
    if (!tabs.some(t => keyOf(t) === key)) {
        tabs.push({ volume: ctx.volume, chapter: ctx.chapter, pageId: ctx.pageId, seriesId: ctx.seriesId, seriesFolder: ctx.seriesFolder });
        if (tabs.length > MAX_TABS) tabs.shift();
        persist();
    }
    activeKey = key;
    render();
}

/** Instant highlight on click, before the (debounced) context switch runs. */
export function markActiveTab(ctx) {
    activeKey = keyOf(ctx);
    render();
}

export function setTabLoading(ctx, isLoading) {
    const key = keyOf(ctx);
    if (isLoading) {
        loadingKey = key;
    } else if (loadingKey === key) {
        // Only the tab that set the spinner may clear it — a superseded
        // switch finishing late must not wipe the newer tab's indicator
        loadingKey = null;
    }
    render();
}
