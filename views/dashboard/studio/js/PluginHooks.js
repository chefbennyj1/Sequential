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
let activePageToken = null;
let presenceTimer = null;
const pendingTimers = {};        // `${token}::${source}` -> pending-badge timeout
let socketListenerAttached = false;

async function getSubscribers(hookName) {
    if (!subscriberCache[hookName]) {
        subscriberCache[hookName] = await fetchHookSubscribersAPI(hookName);
    }
    return subscriberCache[hookName];
}

/**
 * Long-running scans (e.g. the Proof-Reader) acknowledge the hook immediately
 * and push their result back over Socket.io instead of holding the request
 * open -- otherwise repeated saves stack long-held connections and stall the
 * editor's Save button. This listener renders those pushed results.
 */
function ensureSocketListener() {
    if (socketListenerAttached || !window.socket) return;
    socketListenerAttached = true;

    window.socket.on('plugin_annotations', ({ source, target, annotations }) => {
        if (!source || !target) return;
        const token = `${target.volume}/${target.chapter}/${target.pageId}`;
        const key = `${token}::${source}`;

        clearTimeout(pendingTimers[key]);
        delete pendingTimers[key];
        if (window.GlassAnnotations) window.GlassAnnotations.settle(source);

        if (!Array.isArray(annotations) || !annotations.length) return;

        // Record in the bell even when the badge is not shown -- a result that
        // lands after the writer moved on is the one they'd otherwise miss.
        postHookNotification(source, annotations, target);

        if (token === activePageToken && window.GlassAnnotations) {
            window.GlassAnnotations.show(source, annotations);
        }
    });
}

/**
 * Notify subscribed plugins of an editor lifecycle event (e.g. 'page-open',
 * 'scene-saved'). Fire-and-forget: a plugin either answers synchronously with
 * annotations, or acks with { pending: true } and delivers later over the
 * socket. Badges are dropped if the writer has already moved to another page.
 */
export async function fireEditorHook(hookName, context) {
    ensureSocketListener();
    const token = `${context.volume}/${context.chapter}/${context.pageId}`;
    activePageToken = token;

    if (window.GlassAnnotations) window.GlassAnnotations.clear();

    const subscribers = await getSubscribers(hookName);
    // Scope any async (socket-delivered) result back to this client only.
    const payload = { ...context, socketId: window.socket?.id };

    subscribers.forEach(async (folderName) => {
        // Show a "working" badge only if the scan is still in flight after a
        // beat -- cache hits / fast acks must not flash it.
        const preTimer = setTimeout(() => {
            if (activePageToken === token && window.GlassAnnotations) window.GlassAnnotations.pending(folderName);
        }, PENDING_BADGE_DELAY_MS);

        const result = await firePluginHookAPI(folderName, hookName, payload);
        clearTimeout(preTimer);
        const source = result.source || folderName;

        if (result.pending) {
            // Real annotations arrive over the socket. Keep a pending badge
            // going (keyed by source so the socket handler can cancel it).
            if (window.GlassAnnotations) window.GlassAnnotations.settle(folderName);
            const key = `${token}::${source}`;
            clearTimeout(pendingTimers[key]);
            pendingTimers[key] = setTimeout(() => {
                if (activePageToken === token && window.GlassAnnotations) window.GlassAnnotations.pending(source);
            }, PENDING_BADGE_DELAY_MS);
            return;
        }

        // Synchronous plugin: annotations came back in the response.
        if (window.GlassAnnotations) window.GlassAnnotations.settle(folderName);
        if (!result.ok || !Array.isArray(result.annotations) || !result.annotations.length) return;

        postHookNotification(source, result.annotations, context);
        if (activePageToken === token && window.GlassAnnotations) {
            window.GlassAnnotations.show(source, result.annotations);
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
