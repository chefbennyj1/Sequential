const fs = require('fs');
const path = require('path');
const express = require('express');

class PluginLoader {
    constructor() {
        this.pluginsDir = path.join(__dirname, 'plugins');
        this.loadedPlugins = {};
        this.loadedManifests = {};
    }

    loadAll(app, config = {}) {
        console.log('[PluginLoader] Scanning for plugins...');
        const pluginRouter = express.Router();
        
        if (!fs.existsSync(this.pluginsDir)) {
            console.log('[PluginLoader] No plugins directory found.');
            return;
        }

        const folders = fs.readdirSync(this.pluginsDir);
        
        for (const folder of folders) {
            const folderPath = path.join(this.pluginsDir, folder);
            if (!fs.statSync(folderPath).isDirectory()) continue;

            const manifestPath = path.join(folderPath, 'plugin.json');
            if (!fs.existsSync(manifestPath)) continue;

            try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                
                if (manifest.enabled) {
                    console.log(`[PluginLoader] Loading plugin: ${manifest.name} v${manifest.version}`);
                    
                    const mainFilePath = path.join(folderPath, 'plugin.js');
                    if (!fs.existsSync(mainFilePath)) {
                        console.error(`[PluginLoader] Error: Missing plugin.js in ${folder}`);
                        continue;
                    }
                    const pluginInstance = require(mainFilePath);
                    
                    // Create a specific sub-router for this plugin's endpoints
                    const subRouter = express.Router();
                    
                    if (typeof pluginInstance.init === 'function') {
                        // Pass the subRouter so the plugin can safely attach its endpoints
                        pluginInstance.init(subRouter, {
                            ...config,
                            manifest,
                            isPluginEnabled: (name) => !!this.loadedPlugins[name]
                        });
                    }
                    
                    // Mount the plugin's subRouter onto the main pluginRouter
                    // Result: /api/plugins/[folderName]/[endpoint]
                    pluginRouter.use(`/${folder}`, subRouter);

                    this.loadedPlugins[folder] = pluginInstance;
                    this.loadedManifests[folder] = manifest;
                } else {
                    console.log(`[PluginLoader] Skipping disabled plugin: ${manifest.name}`);
                }
            } catch (err) {
                console.error(`[PluginLoader] Error loading plugin in ${folder}:`, err);
            }
        }
        
        // Attach all plugin routes to the main app under /api/plugins
        app.use('/api/plugins', pluginRouter);
    }

    getAvailablePlugins() {
        if (!fs.existsSync(this.pluginsDir)) return [];
        const folders = fs.readdirSync(this.pluginsDir);
        const plugins = [];
        
        for (const folder of folders) {
            const folderPath = path.join(this.pluginsDir, folder);
            if (!fs.statSync(folderPath).isDirectory()) continue;
            
            const manifestPath = path.join(folderPath, 'plugin.json');
            if (!fs.existsSync(manifestPath)) continue;
            
            try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                plugins.push({
                    folderName: folder,
                    ...manifest
                });
            } catch (err) {
                console.error(`[PluginLoader] Error reading manifest for ${folder}:`, err);
            }
        }
        return plugins;
    }

    // Call every loaded plugin's optional shutdown() so nothing a plugin
    // spawned (child processes, watchers) outlives the server. Each plugin
    // gets 5 seconds; failures are logged, never fatal.
    async shutdownAll() {
        const entries = Object.entries(this.loadedPlugins);
        console.log(`[PluginLoader] Shutting down ${entries.length} plugin(s)...`);
        await Promise.allSettled(entries.map(async ([name, plugin]) => {
            if (typeof plugin.shutdown !== 'function') return;
            try {
                await Promise.race([
                    Promise.resolve(plugin.shutdown()),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('shutdown timed out (5s)')), 5000))
                ]);
                console.log(`[PluginLoader] ${name} shut down.`);
            } catch (err) {
                console.error(`[PluginLoader] ${name} shutdown failed:`, err.message);
            }
        }));
    }

    // Enabled plugins whose manifest subscribes to the given lifecycle hook.
    // The dashboard queries this so it never has to know plugin names.
    getHookSubscribers(hookName) {
        return Object.keys(this.loadedManifests).filter(folder => {
            const hooks = this.loadedManifests[folder].hooks || [];
            return hooks.includes(hookName);
        });
    }

    togglePlugin(folderName, enabled) {
        const manifestPath = path.join(this.pluginsDir, folderName, 'plugin.json');
        if (!fs.existsSync(manifestPath)) throw new Error('Plugin not found');
        
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        manifest.enabled = enabled;
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
        
        // Note: Changes require a server restart to take effect on the express router,
        // but the frontend UI can reflect the config change immediately.
        return manifest;
    }
}

module.exports = new PluginLoader();
