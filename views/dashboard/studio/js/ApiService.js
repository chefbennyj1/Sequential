// views/dashboard/js/ApiService.js

export async function fetchCharactersAPI(seriesId) {
    try {
        const query = seriesId ? `?series=${seriesId}` : '';
        const res = await fetch(`/api/characters${query}`);
        return await res.json();
    } catch (err) {
        console.error("Error fetching characters:", err);
        return [];
    }
}

export async function fetchVolumesAPI() {
    try {
        const res = await fetch('/api/volumes');
        const data = await res.json();
        return data.ok ? data.volumes : [];
    } catch (err) {
        console.error("Error fetching volumes:", err);
        return [];
    }
}

export async function fetchSeriesAPI() {
    try {
        const res = await fetch('/api/library/series');
        const data = await res.json();
        return data.ok ? data.series : [];
    } catch (err) {
        console.error("Error fetching series:", err);
        return [];
    }
}

export async function fetchSeriesDetailsAPI(seriesId) {
    try {
        const res = await fetch(`/api/library/series/${seriesId}`);
        const data = await res.json();
        return data.ok ? data.series : null;
    } catch (err) {
        console.error("Error fetching series details:", err);
        return null;
    }
}

export async function fetchChaptersAPI(volumeId) {
    try {
        const res = await fetch(`/api/volumes/${volumeId}/chapters`);
        const data = await res.json();
        return data.ok ? data.chapters : [];
    } catch (err) {
        console.error("Error fetching chapters:", err);
        return [];
    }
}

export async function fetchChapterDetailsAPI(volumeId, chapterId) {
    try {
        const res = await fetch(`/api/volumes/${volumeId}/chapters/${chapterId}`);
        const data = await res.json();
        return data.ok ? data.chapter : null;
    } catch (err) {
        console.error("Error fetching chapter details:", err);
        return null;
    }
}

export async function updateChapterDetailsAPI(volumeId, chapterId, chapterData) {
    try {
        const res = await fetch(`/api/volumes/${volumeId}/chapters/${chapterId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(chapterData)
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.message || "Failed to update chapter.");
        return data;
    } catch (err) {
        console.error("Error updating chapter details:", err);
        throw err;
    }
}

export async function getCurrentUser() {
    try {
        const response = await fetch('/api/user');
        const json = await response.json();
        if (!json.ok) throw new Error(json.message || "User not logged in");
        return json.user || { username: "Guest", administrator: false };
    } catch (err) {
        console.error("Error fetching user data:", err);
        throw err;
    }
}

export async function fetchSingleVolumeWithChapters(id) {
    try {
        const res = await fetch(`/api/volume/${id}`);
        const data = await res.json();
        return data.ok ? data.view : null;
    } catch (err) { console.error(err); return null; }
}

export async function fetchSceneData(volume, chapter, pageId, seriesId = "No_Overflow") {
    try {
        const res = await fetch(`/api/editor/scene/${seriesId}/${volume}/${chapter}/${pageId}`);
        const data = await res.json();
        return data.ok ? data.scene : [];
    } catch (err) {
        console.error(err);
        return [];
    }
}

export async function saveSceneData(volume, chapter, pageId, sceneData, seriesId = "No_Overflow") {
    try {
        const res = await fetch(`/api/editor/scene/${seriesId}/${volume}/${chapter}/${pageId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sceneData)
        });
        return await res.json();
    } catch (err) {
        console.error(err);
        return { ok: false, message: err.message };
    }
}

export async function saveMediaAPI(volume, chapter, pageId, media, seriesId = "No_Overflow") {
    try {
        const res = await fetch(`/api/editor/media/${seriesId}/${volume}/${chapter}/${pageId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ media })
        });
        
        const text = await res.text();
        try {
            return JSON.parse(text);
        } catch (e) {
            console.error("Server returned non-JSON:", text);
            throw new Error(`Server Error (${res.status}): ${res.statusText}`);
        }
    } catch (err) {
        console.error("Error saving media:", err);
        return { ok: false, message: err.message || "Network error" };
    }
}

export async function fetchPageAssets(volume, chapter, pageId, type, scope = 'page', seriesId = "No_Overflow") {
    try {
        const res = await fetch(`/api/editor/assets/${seriesId}/${volume}/${chapter}/${pageId}/${type}?scope=${scope}`);
        return await res.json();
    } catch (err) {
        return { ok: false, message: "Failed to load assets" };
    }
}

export async function uploadAsset(formData) {
    try {
        const res = await fetch('/api/editor/upload-asset', { method: 'POST', body: formData });
        return await res.json();
    } catch (err) {
        return { ok: false, message: err.message };
    }
}

export async function fetchLayouts() {
    try {
        const res = await fetch('/api/editor/layouts');
        return await res.json();
    } catch (err) {
        console.error(err);
        return { ok: false, layouts: [] };
    }
}

export async function fetchAudioMap(volumeId) {
    try {
        const res = await fetch(`/api/volumes/${volumeId}/audio-map`);
        return await res.json();
    } catch (err) {
        console.error("Error fetching audio map:", err);
        return { ok: false, map: [] };
    }
}

export async function updateAudioMap(volumeId, map) {
    try {
        const res = await fetch(`/api/volumes/${volumeId}/audio-map`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ map })
        });
        return await res.json();
    } catch (err) {
        console.error("Error updating audio map:", err);
        return { ok: false, message: "Network error" };
    }
}

export async function fetchAmbientMedia(vol, chap, page, series = 'No_Overflow') {
     try {
        const res = await fetch(`/api/media/${series}/${vol}/${chap}/${page}`);
        return await res.json();
    } catch (e) {
        return { ok: false };
    }
}

export async function setPageAmbientAudioAPI(volume, chapter, pageId, fileName, seriesId = "No_Overflow") {
    try {
        const res = await fetch('/api/editor/set-ambient', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ series: seriesId, volume, chapter, pageId, fileName })
        });
        return await res.json();
    } catch (err) {
        console.error("Error setting ambient audio:", err);
        return { ok: false, message: "Network error" };
    }
}

export async function updateAmbientVolumeAPI(volume, chapter, pageId, ambientVolume, seriesId = "No_Overflow") {
    try {
        const res = await fetch('/api/editor/ambient-volume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ series: seriesId, volume, chapter, pageId, ambientVolume })
        });
        return await res.json();
    } catch (err) {
        console.error("Error updating ambient volume:", err);
        return { ok: false, message: "Network error" };
    }
}

export async function fetchPagePanels(volume, chapter, pageId, seriesId = "No_Overflow") {
    try {
        const res = await fetch(`/api/editor/panels/${seriesId}/${volume}/${chapter}/${pageId}`);
        const data = await res.json();
        return data.ok ? { panels: data.panels, layoutClass: data.layoutClass } : { panels: [], layoutClass: null };
    } catch (err) {
        console.error("Error fetching panels:", err);
        return { panels: [], layoutClass: null };
    }
}