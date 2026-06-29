// views/dashboard/sections/plugin-manager/plugin-manager.js

export async function initPluginManager() {
    const container = document.getElementById('pluginListContainer');
    const refreshBtn = document.getElementById('refreshPluginsBtn');
    
    if (!container) return;

    async function loadPlugins() {
        container.innerHTML = `
            <div class="text-center text-muted padding-y-20">
                <ion-icon name="sync-outline" class="spin font-size-2"></ion-icon>
                <p>Loading plugins...</p>
            </div>
        `;
        
        try {
            const res = await fetch('/api/plugins/list');
            const data = await res.json();
            
            if (!data.ok) throw new Error(data.message);
            
            const plugins = data.plugins;
            if (!plugins || plugins.length === 0) {
                container.innerHTML = `
                    <div class="text-center text-muted padding-y-30">
                        <ion-icon name="cube-outline" class="font-size-3"></ion-icon>
                        <p class="margin-t-10">No plugins found in services/plugins/</p>
                    </div>
                `;
                return;
            }
            
            renderPlugins(plugins);
        } catch (err) {
            container.innerHTML = `
                <div class="glass glass--danger padding-15 border-radius-8 text-center">
                    <ion-icon name="warning-outline" class="font-size-2"></ion-icon>
                    <p class="margin-t-5">Failed to load plugins: ${err.message}</p>
                </div>
            `;
        }
    }

    // Basic HTML Sanitizer to prevent XSS from malicious plugin.json files
    function escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function renderPlugins(plugins) {
        container.innerHTML = '';
        
        plugins.forEach(plugin => {
            const row = document.createElement('div');
            row.className = 'glass glass--bright border-radius-8 flex-row justify-between align-center border-dim';
            row.style.padding = '20px';
            
            row.innerHTML = `
                <div class="flex-column gap-5">
                    <div class="flex-row align-center gap-10">
                        <h4 class="margin-0 text-accent">${escapeHTML(plugin.name || plugin.folderName)}</h4>
                        <span class="text-muted font-size-07 glass glass--dark padding-x-10 padding-y-2 border-radius-4">v${escapeHTML(plugin.version || '1.0.0')}</span>
                    </div>
                    <p class="text-muted font-size-08 margin-0">${escapeHTML(plugin.description || 'No description provided.')}</p>
                    <span class="text-muted font-size-07 margin-t-5"><ion-icon name="folder-outline"></ion-icon> services/plugins/${escapeHTML(plugin.folderName)}</span>
                </div>
                
                <div class="flex-row gap-15 align-center">
                    <div class="glass glass-toggle">
                        <span class="glass-toggle__opt ${!plugin.enabled ? 'is-on' : ''}" data-value="false" tabindex="0">Off</span>
                        <span class="glass-toggle__opt ${plugin.enabled ? 'is-on' : ''}" data-value="true" tabindex="0">On</span>
                    </div>
                </div>
            `;
            
            // Bind toggle logic
            const toggleGroup = row.querySelector('.glass-toggle');
            toggleGroup.onclick = async (e) => {
                const opt = e.target.closest('.glass-toggle__opt');
                if (!opt || opt.classList.contains('is-on')) return;
                
                // Visual update
                toggleGroup.querySelectorAll('.glass-toggle__opt').forEach(el => el.classList.remove('is-on'));
                opt.classList.add('is-on');
                
                const enabled = opt.dataset.value === 'true';
                
                try {
                    const res = await fetch('/api/plugins/toggle', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ folderName: plugin.folderName, enabled })
                    });
                    
                    const data = await res.json();
                    if (!data.ok) throw new Error(data.message);
                    
                    if (window.GlassToast) {
                        window.GlassToast.show('success', 'Plugin Updated', data.message);
                    }
                } catch (err) {
                    if (window.GlassToast) {
                        window.GlassToast.show('error', 'Update Failed', err.message);
                    }
                    // Revert visually on error
                    toggleGroup.querySelectorAll('.glass-toggle__opt').forEach(el => el.classList.remove('is-on'));
                    row.querySelector(`.glass-toggle__opt[data-value="${!enabled}"]`).classList.add('is-on');
                }
            };
            
            container.appendChild(row);
        });
    }

    if (refreshBtn) {
        refreshBtn.onclick = loadPlugins;
    }

    // Initial load
    loadPlugins();
}
