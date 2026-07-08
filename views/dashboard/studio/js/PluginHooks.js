// views/dashboard/studio/js/PluginHooks.js
/**
 * Sequential Comic Server - Plugin Hook Dispatcher
 * Fires lifecycle hooks to subscribed plugins and routes their
 * annotations to the generic GlassAnnotations renderer.
 * The dashboard never references a specific plugin by name; plugins
 * subscribe via the "hooks" array in their plugin.json manifest.
 */

import { fetchHookSubscribersAPI, firePluginHookAPI } from '../api/StudioClient.js';

const PENDING_BADGE_DELAY_MS = 1000;

const subscriberCache = {};
let fireSeq = 0;
let activePageToken = null;
const latestSeqByPage = {};
let presenceTimer = null;

async function getSubscribers(hookName) {
    if (!subscriberCache[hookName]) {
        subscriberCache[hookName] = await fetchHookSubscribersAPI(hookName);
    }
    return subscriberCache[hookName];
}

/**
 * Notify subscribed plugins of an editor lifecycle event (e.g. 'page-open',
 * 'scene-saved'). Fire-and-forget: results render as annotation badges when
 * they arrive, and are dropped if the user has already moved to another page.
 */
export async function fireEditorHook(hookName, context) {
    const token = `${context.volume}/${context.chapter}/${context.pageId}`;
    const seq = ++fireSeq;
    activePageToken = token;

    if (window.GlassAnnotations) window.GlassAnnotations.clear();

    const subscribers = await getSubscribers(hookName);

    // Only dispatches somebody answers supersede in-flight scans of this
    // page; re-entering a page (a subscriber-less page-open) must not veto
    // a slow scan that is still coming back for it.
    if (subscribers.length > 0) latestSeqByPage[token] = seq;

    subscribers.forEach(async (folderName) => {
        // Show a "working" badge only if the scan is still in flight after a
        // beat -- cache hits resolve instantly and must not flash it
        const pendingTimer = setTimeout(() => {
            if (activePageToken !== token || latestSeqByPage[token] !== seq) return;
            if (window.GlassAnnotations) window.GlassAnnotations.pending(folderName);
        }, PENDING_BADGE_DELAY_MS);

        const result = await firePluginHookAPI(folderName, hookName, context);
        clearTimeout(pendingTimer);

        const stillCurrent = activePageToken === token && latestSeqByPage[token] === seq;
        if (stillCurrent && window.GlassAnnotations) {
            window.GlassAnnotations.settle(folderName);
        }

        if (!result.ok || !Array.isArray(result.annotations) || !result.annotations.length) return;

        // Record in the notification bell even when the badge is not shown --
        // results that land after the user moved on are the ones they'd miss
        postHookNotification(result.source || folderName, result.annotations, context);

        if (!stillCurrent) return; // viewer moved on, or a newer scan superseded this one

        if (window.GlassAnnotations) {
            window.GlassAnnotations.show(result.source || folderName, result.annotations);
        }
    });
}

function postHookNotification(source, annotations, context) {
    const extra = annotations.length > 1 ? ` (+${annotations.length - 1} more)` : '';
    fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            source,
            title: `${annotations.length} note${annotations.length > 1 ? 's' : ''} on ${context.pageId}`,
            body: annotations[0].note + extra,
            link: {
                series: context.series,
                seriesFolder: context.seriesFolder,
                volume: context.volume,
                chapter: context.chapter,
                pageId: context.pageId
            }
        })
    }).catch(err => console.log('[PluginHooks] Notification post failed:', err.message));
}

/**
 * Heartbeat to editor-presence subscribers while the dashboard is open.
 * Plugins use it to start on first beat and shut themselves down once the
 * beats stop (closing the tab ends the interval with the page).
 */
export function startPresenceHeartbeat(intervalMs = 30000) {
    if (presenceTimer) return;

    const beat = async () => {
        const subscribers = await getSubscribers('editor-presence');
        subscribers.forEach((folderName) => {
            firePluginHookAPI(folderName, 'editor-presence', {});
        });
    };

    beat();
    presenceTimer = setInterval(beat, intervalMs);
}
