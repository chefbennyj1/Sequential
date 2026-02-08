// services/public/PlaylistManager.js
import { fadeElement } from '/services/public/MediaManager.js';
import { preloadMediaAsset, resolveMediaUrl } from '/libs/Utility.js';

class PlaylistManager {
    constructor(panelElement, config, pageInfo) {
        this.panelElement = panelElement;
        this.config = config;
        this.items = config.items || [];
        this.loop = config.loop || false;
        this.globalDuration = config.globalDuration || 3000;
        this.globalTransitionDuration = config.globalTransitionDuration || 500;
        
        if (config.crossfade !== undefined) {
            this.transitionMode = config.crossfade ? 'overlap' : 'sequential';
        } else {
            this.transitionMode = config.transitionMode || 'overlap'; 
        }
        
        this.pageInfo = pageInfo;
        this.currentIndex = 0;
        this.timeoutId = null;
        this.currentMediaElement = panelElement.querySelector('img, video');
        this.isPaused = false;
        this._resolvePlayPromise = null;

        if (!this.panelElement || !this.items || this.items.length === 0) {
            console.error("PlaylistManager: Invalid panel or items provided.");
            return;
        }

        const pos = getComputedStyle(this.panelElement).position;
        if (pos === 'static') this.panelElement.style.position = 'relative';
        
        // Prepare current element for layering
        if (this.currentMediaElement) {
            this.currentMediaElement.style.position = 'absolute';
            this.currentMediaElement.style.top = '0';
            this.currentMediaElement.style.left = '0';
            this.currentMediaElement.style.zIndex = '1';
        }
    }

    play() {
        if (this.isPaused) {
            this.isPaused = false;
            this._showNextItem();
            return this.loop ? Promise.resolve() : new Promise(r => this._resolvePlayPromise = r);
        }
        
        this.currentIndex = 0;
        this._showNextItem();

        return this.loop ? Promise.resolve() : new Promise(r => this._resolvePlayPromise = r);
    }

    destroy() {
        this.stop();
        if (this.currentMediaElement) {
            this.currentMediaElement.remove();
            this.currentMediaElement = null;
        }
        this.panelElement = null;
    }

    stop() {
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
        if (this.currentMediaElement?.tagName === 'VIDEO') {
            this.currentMediaElement.pause();
        }
        if (this._resolvePlayPromise && !this.loop) {
            this._resolvePlayPromise();
            this._resolvePlayPromise = null;
        }
    }

    async _showNextItem() {
        if (this.isPaused || !this.panelElement) return;

        if (this.currentIndex >= this.items.length) {
            if (this.loop) {
                this.currentIndex = 0;
                this._showNextItem();
            } else {
                this.stop();
            }
            return;
        }

        const item = this.items[this.currentIndex];
        const transitionDuration = item.transitionDuration !== undefined ? item.transitionDuration : this.globalTransitionDuration;
        const duration = item.duration !== undefined ? item.duration : this.globalDuration;

        let mediaUrl = resolveMediaUrl(item.fileName, item.type, this.pageInfo);
        if (!mediaUrl) {
            this.currentIndex++;
            this._showNextItem();
            return;
        }

        try {
            await preloadMediaAsset(mediaUrl, item.type);
        } catch (e) {
            console.error(`PlaylistManager: Failed to load ${mediaUrl}`, e);
            this.currentIndex++;
            this._showNextItem();
            return;
        }

        const oldMediaElement = this.currentMediaElement;

        // Create new element
        let newEl;
        if (item.type === 'image') {
            newEl = document.createElement('img');
            newEl.src = mediaUrl;
        } else if (item.type === 'video') {
            newEl = document.createElement('video');
            newEl.src = mediaUrl;
            newEl.muted = true;
            newEl.playsInline = true;
            newEl.autoplay = true;
            newEl.loop = false;
            newEl.preload = 'auto';
        }

        if (!newEl) return;

        // Styling for layering
        newEl.style.cssText = `width:100%; height:100%; object-fit:cover; opacity:0; position:absolute; top:0; left:0; z-index:2;`;
        
        // Ensure old element is below
        if (oldMediaElement) {
            oldMediaElement.style.zIndex = '1';
        }

        this.panelElement.appendChild(newEl);

        if (item.type === 'video') {
            newEl.load();
            await new Promise(r => {
                newEl.addEventListener('canplaythrough', r, { once: true });
                newEl.addEventListener('error', r, { once: true });
            });
        }

        // Sequential handling
        if (this.transitionMode === 'sequential' && oldMediaElement) {
            await fadeElement(oldMediaElement, 'out', transitionDuration);
            oldMediaElement.remove();
        }

        // Crossfade In
        await fadeElement(newEl, 'in', transitionDuration);

        // Overlap cleanup - only remove old after new is fully visible
        if (this.transitionMode === 'overlap' && oldMediaElement) {
            oldMediaElement.remove();
        }

        this.currentMediaElement = newEl;

        if (item.type === 'video' && newEl.paused) {
            newEl.play().catch(e => console.warn("Playlist video play failed", e));
        }

        // Timing
        if (item.type === 'image') {
            this.timeoutId = setTimeout(() => {
                this.currentIndex++;
                this._showNextItem();
            }, duration);
        } else if (item.type === 'video') {
            newEl.addEventListener('ended', () => {
                this.currentIndex++;
                this._showNextItem();
            }, { once: true });
        }
    }
}

export default PlaylistManager;