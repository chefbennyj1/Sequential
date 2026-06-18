// views/reader/api/ReaderClient.js
/**
 * Sequential Comic Server - Reader API Client
 * Centralized fetch wrappers for consumer-facing reader interactions.
 */

export async function fetchLibraryData() {
    try {
        const res = await fetch('/api/landing-page/library');
        return await res.json();
    } catch (err) {
        console.error("Error fetching library data:", err);
        return { ok: false, message: err.message };
    }
}

export async function fetchChapterData(volumeId, chapterNumber) {
    try {
        const res = await fetch(`/api/volume/${volumeId}/chapter/${chapterNumber}`);
        return await res.json();
    } catch (err) {
        console.error("Error fetching chapter data:", err);
        return { ok: false, message: err.message };
    }
}

export async function syncPageData(volumeId, chapterId, pageId) {
    try {
        const res = await fetch(`/api/editor/sync-page/${volumeId}/${chapterId}/${pageId}`);
        return await res.json();
    } catch (err) {
        console.error("Error syncing page:", err);
        return { ok: false, message: err.message };
    }
}
