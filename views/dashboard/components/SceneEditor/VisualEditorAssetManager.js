// views/dashboard/components/SceneEditor/VisualEditorAssetManager.js
import { saveMediaAPI, fetchNextPanelId } from '../../studio/api/StudioClient.js';
import { pushMediaPersisted } from './VisualEditorSync.js';

/**
 * VisualEditorAssetManager
 * Handles all data-centric operations for the Visual Editor, including:
 * - Persisting media changes to the server
 * - Flipping assets
 * - Managing floating panels
 * - Coordinating with AI Vision tasks
 */
export class VisualEditorAssetManager {
    constructor(context, mediaData, seriesId) {
        this.context = context; // { volume, chapter, pageId }
        this.mediaData = mediaData;
        this.seriesId = seriesId;
    }

    setMediaData(data) {
        this.mediaData = data;
    }

    setContext(context, seriesId) {
        this.context = context;
        this.seriesId = seriesId;
    }

    /**
     * Persists the current state of media items to the server.
     */
    async saveMedia() {
        try {
            const { volume, chapter, pageId } = this.context;
            const res = await saveMediaAPI(volume, chapter, pageId, this.mediaData, this.seriesId);
            return res;
        } catch (err) {
            console.error("[VisualAssetManager] Save failed:", err);
            throw err;
        }
    }

    /**
     * Triggers a server-side flip operation on a specific image asset.
     */
    async flipAsset(panelSelector, fileName, direction) {
        const { volume, chapter, pageId } = this.context;
        const res = await fetch('/api/editor/flip-asset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                series: this.seriesId,
                volume,
                chapter,
                pageId,
                panel: panelSelector,
                fileName,
                direction
            })
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Flip failed (${res.status}): ${text.substring(0, 100)}`);
        }

        return await res.json();
    }

    /**
     * Creates a new floating panel entry in the current page metadata.
     */
    async createFloatingPanel() {
        const { volume, chapter, pageId } = this.context;
        const nextId = await fetchNextPanelId(this.seriesId, volume, chapter, pageId);
        if (!nextId) throw new Error("Failed to generate next panel ID");

        const panelSelector = `.panel-${nextId}`;
        const newPanel = { 
            panel: panelSelector, 
            isFloating: true, 
            type: 'image', 
            fileName: '', 
            style: { 
                position: 'absolute', 
                top: '10%', 
                left: '10%', 
                width: '30%', 
                height: 'auto', 
                'aspect-ratio': '1 / 1', 
                'z-index': '10' 
            } 
        };

        this.mediaData.push(newPanel);
        await this.saveMedia();
        return panelSelector;
    }

    /**
     * Deletes a panel (floating or static) from the page metadata.
     */
    async deletePanel(panelSelector) {
        const idx = this.mediaData.findIndex(m => m.panel === panelSelector);
        if (idx === -1) return false;
        
        this.mediaData.splice(idx, 1);
        await this.saveMedia();
        return true;
    }
}
