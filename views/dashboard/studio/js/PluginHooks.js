// views/dashboard/studio/js/PluginHooks.js
/**
 * Sequential Comic Server - Plugin Hook Dispatcher
 * Fires lifecycle hooks to subscribed plugins and routes their
 * annotations to the generic GlassAnnotations renderer.
 * The dashboard never references a specific plugin by name; plugins
 * subscribe via the "hooks" array in their plugin.json manifest.
 */

import { fetchHookSubscribersAPI, firePluginHookAPI } from '../api/StudioClient.js';

const subscriberCache = {};
let activeFireSeq = 0;
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
    // Only the latest dispatch may render: a newer save or page switch
    // invalidates every response still in flight from older fires.
    const seq = ++activeFireSeq;

    if (window.GlassAnnotations) window.GlassAnnotations.clear();

    const subscribers = await getSubscribers(hookName);

    subscribers.forEach(async (folderName) => {
        const result = await firePluginHookAPI(folderName, hookName, context);

        if (!result.ok || !Array.isArray(result.annotations) || !result.annotations.length) return;

        // Record in the notification bell even when the response is stale --
        // results that land after the user moved on are the ones they'd miss
        postHookNotification(result.source || folderName, result.annotations, context);

        if (activeFireSeq !== seq) return;

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
