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
let activePageToken = null;

async function getSubscribers(hookName) {
    if (!subscriberCache[hookName]) {
        subscriberCache[hookName] = await fetchHookSubscribersAPI(hookName);
    }
    return subscriberCache[hookName];
}

/**
 * Notify subscribed plugins that a page was opened in the editor.
 * Fire-and-forget: results render as annotation badges when they arrive,
 * and are dropped if the user has already moved to another page.
 */
export async function firePageOpenHook(context) {
    const token = `${context.volume}/${context.chapter}/${context.pageId}`;
    activePageToken = token;

    if (window.GlassAnnotations) window.GlassAnnotations.clear();

    const subscribers = await getSubscribers('page-open');

    subscribers.forEach(async (folderName) => {
        const result = await firePluginHookAPI(folderName, 'page-open', context);

        if (activePageToken !== token) return;
        if (!result.ok || !Array.isArray(result.annotations) || !result.annotations.length) return;

        if (window.GlassAnnotations) {
            window.GlassAnnotations.show(result.source || folderName, result.annotations);
        }
    });
}
