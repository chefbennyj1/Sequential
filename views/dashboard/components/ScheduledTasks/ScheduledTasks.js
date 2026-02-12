export default class ScheduledTaskView {
    constructor() {
        this.container = document.querySelector('.scheduled-tasks');
        this.rootsList = document.getElementById('library-roots-list');
        this.logContainer = document.getElementById('scanner-log');
        
        this.addBtn = document.getElementById('add-root-btn');
        this.scanBtn = document.getElementById('run-scan-btn');
        
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadRoots();
    }

    bindEvents() {
        this.addBtn.addEventListener('click', () => this.addRoot());
        this.scanBtn.addEventListener('click', () => this.runScan());
        
        // Back button logic if not handled globally by Dashboard
        const backBtn = this.container.querySelector('.back-to-studio-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.container.classList.add('hidden');
                document.querySelector('.studio').classList.remove('hidden');
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
            item.className = 'root-item';
            
            item.innerHTML = `
                <div>
                    <div class="root-info-name">${root.name}</div>
                    <div class="root-info-path">${root.path}</div>
                </div>
                <button class="small root-delete-btn" data-id="${root._id}">X</button>
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

    async runScan() {
        this.scanBtn.disabled = true;
        this.scanBtn.textContent = "Scanning...";
        this.log(`> Starting library scan...`);

        try {
            const res = await fetch('/api/library/scan', { method: 'POST' });
            const data = await res.json();

            if (data.ok) {
                this.log(`> Scan complete.`);
                data.results.forEach(series => {
                    this.log(`  + Found: ${series.title} (${series.volumeCount} volumes)`);
                });
            } else {
                this.log(`> Error: ${data.message}`);
            }
        } catch (e) {
            this.log(`> Critical Error: ${e.message}`);
        } finally {
            this.scanBtn.disabled = false;
            this.scanBtn.textContent = "Run Scan Now";
        }
    }

    log(msg) {
        const line = document.createElement('div');
        line.textContent = msg;
        this.logContainer.appendChild(line);
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }
}
