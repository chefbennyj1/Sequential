import { populateSeriesSelect, populateVolumeSelect, populateChapterSelect } from '../../studio/js/LibraryManager.js';

export default class ScheduledTaskView {
    constructor() {
        this.container = document.querySelector('.scheduled-tasks');
        if (!this.container) return; // Guard clause
        
        this.rootsList = this.container.querySelector('#library-roots-list');
        this.logContainer = this.container.querySelector('#scanner-log');
        
        this.addBtn = this.container.querySelector('#add-root-btn');
        
        // Library Sync Button
        this.syncBtn = this.container.querySelector('#run-sync-btn');

        // Vision AI Controls
        this.visionScanBtn = this.container.querySelector('#run-vision-scan-btn');
        this.visionStopBtn = this.container.querySelector('#stop-vision-btn');

        this.visionSeriesSelect = this.container.querySelector('#visionSeriesSelect');
        this.visionVolumeSelect = this.container.querySelector('#visionVolumeSelect');
        this.visionChapterSelect = this.container.querySelector('#visionChapterSelect');
        
        this.progressContainer = this.container.querySelector('.scanner-progress-container');
        this.progressBar = this.container.querySelector('#scanner-progress-bar');
        
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadRoots();
        this.setupSockets();
        populateSeriesSelect('visionSeriesSelect');
    }

    setupSockets() {
        if (window.socket) {
            window.socket.on('scanner_progress', (data) => {
                // Show the progress bar container if hidden
                if (this.progressContainer.style.display === 'none') {
                    this.progressContainer.style.display = 'block';
                }
                
                // Update progress width if percentage provided
                if (typeof data.percentage === 'number') {
                    this.progressBar.style.width = `${data.percentage}%`;
                }
                
                // Log the message
                if (data.message) {
                    this.log(data.message);
                }
            });
        }
    }

    async loadRoots() {
        try {
            const res = await fetch('/api/library/roots');
            const data = await res.json();
            if (data.ok) {
                this.renderRoots(data.roots);
            } else {
                this.rootsList.innerHTML = `<div class="text-accent">Error: ${data.message}</div>`;
            }
        } catch (e) {
            console.error(e);
            this.rootsList.innerHTML = `<div class="text-accent">Failed to load roots.</div>`;
        }
    }

    renderRoots(roots) {
        this.rootsList.innerHTML = '';
        if (roots.length === 0) {
            this.rootsList.innerHTML = '<div class="text-muted">No roots configured.</div>';
            return;
        }

        roots.forEach(root => {
            const item = document.createElement('div');
            item.className = 'root-item glass glass--dark border-radius-8 border-dim padding-10';
            
            item.innerHTML = `
                <div>
                    <div class="root-info-name">${root.name}</div>
                    <div class="root-info-path">${root.path}</div>
                </div>
                <button class="glass glass-btn glass-btn--sm glass-btn--danger root-delete-btn" data-id="${root._id}">X</button>
            `;

            item.querySelector('button').addEventListener('click', () => this.deleteRoot(root._id));
            this.rootsList.appendChild(item);
        });
    }

    async addRoot() {
        const nameInput = document.getElementById('new-root-name');
        const pathInput = document.getElementById('new-root-path');
        
        const name = nameInput.value.trim();
        const pathVal = pathInput.value.trim();

        if (!name || !pathVal) return alert("Name and Path are required.");

        try {
            const res = await fetch('/api/library/roots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, path: pathVal })
            });
            const data = await res.json();

            if (data.ok) {
                nameInput.value = '';
                pathInput.value = '';
                this.log(`> Root added: ${name}`);
                this.loadRoots();
            } else {
                alert(data.message);
            }
        } catch (e) {
            console.error(e);
            alert("Failed to add root.");
        }
    }

    async deleteRoot(id) {
        if (!confirm("Remove this library root? Series linked to it may become inaccessible until re-mapped.")) return;

        try {
            const res = await fetch(`/api/library/roots/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.ok) {
                this.log(`> Root removed.`);
                this.loadRoots();
            } else {
                alert(data.message);
            }
        } catch (e) {
            console.error(e);
            alert("Failed to delete root.");
        }
    }

    bindEvents() {
        this.addBtn.addEventListener('click', () => this.addRoot());
        
        // Library Sync
        this.syncBtn.addEventListener('click', () => this.runLibrarySync());

        // Vision AI Scoping Logic
        this.visionSeriesSelect.addEventListener('change', () => {
            populateVolumeSelect('visionVolumeSelect', this.visionSeriesSelect.value);
            this.visionChapterSelect.innerHTML = '<option value="">All Chapters</option>';
            this.visionChapterSelect.disabled = true;
        });

        this.visionVolumeSelect.addEventListener('change', () => {
            populateChapterSelect(this.visionVolumeSelect.value, 'visionChapterSelect', false, this.visionSeriesSelect.value);
        });

        // Vision AI Actions
        this.visionScanBtn.addEventListener('click', () => this.runVisionAI());
        this.visionStopBtn.addEventListener('click', () => this.stopVisionAI());
    }

    async runLibrarySync() {
        this.syncBtn.disabled = true;
        this.syncBtn.textContent = "Syncing...";
        
        this.progressContainer.style.display = 'block';
        this.progressBar.style.width = '0%';
        this.logContainer.innerHTML = ''; 
        this.log(`> Starting library synchronization...`);

        try {
            const res = await fetch('/api/library/scan', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quick: true }) // Library sync always performs a quick hash check
            });
            const data = await res.json();

            if (data.ok) {
                this.progressBar.style.width = '100%';
                this.log(`> Sync complete.`);
                data.results.forEach(series => {
                    const count = series.volumes ? series.volumes.length : 0;
                    this.log(`  + Updated: ${series.title} (${count} volumes)`);
                });
            } else {
                this.log(`> Error: ${data.message}`);
            }
        } catch (e) {
            this.log(`> Critical Error: ${e.message}`);
        } finally {
            this.syncBtn.disabled = false;
            this.syncBtn.textContent = "Sync Library";
            setTimeout(() => { this.progressContainer.style.display = 'none'; }, 2000);
        }
    }

    async runVisionAI() {
        this.visionScanBtn.disabled = true;
        const originalText = this.visionScanBtn.textContent;
        this.visionScanBtn.textContent = "Analyzing...";

        // Build Scope
        const scope = {};
        if (this.visionVolumeSelect.value) scope.volumeId = this.visionVolumeSelect.value;
        if (this.visionChapterSelect.value) {
            const selectedText = this.visionChapterSelect.options[this.visionChapterSelect.selectedIndex].text;
            const match = selectedText.match(/Chapter (\d+):/);
            if (match) scope.chapter = `chapter-${match[1]}`;
        }

        this.progressContainer.style.display = 'block';
        this.progressBar.style.width = '0%';
        this.logContainer.innerHTML = '';
        
        let logMsg = `> Initializing Vision AI Analysis...`;
        if (scope.chapter) logMsg += ` Scope: ${scope.chapter}`;
        else if (scope.volumeId) logMsg += ` Scope: Volume`;
        
        this.log(logMsg);

        try {
            const res = await fetch('/api/vision/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    force: false, // Default to analysis mode (missing/changed)
                    scope: Object.keys(scope).length > 0 ? scope : null
                })
            });
            const data = await res.json();

            if (data.ok) {
                this.progressBar.style.width = '100%';
                this.log(`> Vision scan complete.`);
            } else {
                this.log(`> Vision Error: ${data.message}`);
            }
        } catch (e) {
            this.log(`> Vision Critical Error: ${e.message}`);
        } finally {
            this.visionScanBtn.disabled = false;
            this.visionScanBtn.textContent = originalText;
            setTimeout(() => { this.progressContainer.style.display = 'none'; }, 2000);
        }
    }

    async stopVisionAI() {
        this.log(`> Requesting AI Processor stop...`);
        try {
            const res = await fetch('/api/vision/stop', { method: 'POST' });
            const data = await res.json();
            this.log(`> ${data.message}`);
        } catch (e) {
            this.log(`> Error stopping: ${e.message}`);
        }
    }

    log(msg) {
        const line = document.createElement('div');
        line.textContent = msg;
        this.logContainer.appendChild(line);
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }
}
