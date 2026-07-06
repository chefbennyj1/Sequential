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

        if (activeFireSeq !== seq) return;
        if (!result.ok || !Array.isArray(result.annotations) || !result.annotations.length) return;

        if (window.GlassAnnotations) {
            window.GlassAnnotations.show(result.source || folderName, result.annotations);
        }
    });
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
