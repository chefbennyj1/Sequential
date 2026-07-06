# Sequential Comic Server - Plugin Development Guide

Welcome! The Sequential Comic Server uses a highly modular plugin architecture. This allows you to safely extend the server's backend functionality (like adding AI LLMs, export tools, or custom route handlers) without modifying the core `server.js` codebase.

## 1. Naming & Directory Structure
Every plugin must live in its own directory inside `services/plugins/`. 
**Standard Convention:** Plugin folders MUST be named using Title-Case-With-Hyphens (e.g., `Proof-Reader`, `Local-Llm-Engine`). 

The directory name exactly dictates the API route namespace for the plugin.
Example: `services/plugins/My-Cool-Plugin/` will automatically be assigned the namespace `/api/plugins/My-Cool-Plugin`.

## 2. The `plugin.json` Manifest
Every plugin directory MUST contain a `plugin.json` file. This tells the Plugin Loader how to boot it.

```json
{
  "name": "My Cool Plugin",
  "version": "1.0.0",
  "description": "Does something awesome.",
  "author": "Your Name",
  "enabled": true,
  "dependencies": ["Some-Other-Plugin"]
}
```
* **enabled**: If `false`, the Plugin Loader completely ignores this directory.
* **dependencies**: Optional array of plugin folder names that must be enabled for this plugin to function properly. You can check these dynamically in your code via `config.isPluginEnabled('Plugin-Name')`.

## 3. The JavaScript Entry Point (`plugin.js`)
By convention, the main execution script MUST be named `plugin.js` and be placed in the root of your plugin's folder. The file must export an instantiated class or object containing an `init(subRouter, config)` method. 

```javascript
class MyCoolPlugin {
    
    // The Plugin Loader passes an isolated Express sub-router to this method
    init(subRouter) {
        
        // Safely attach an endpoint
        // This resolves to: POST /api/plugins/My-Cool-Plugin/do-something
        subRouter.post('/do-something', (req, res) => {
            res.json({ ok: true, message: "Hello from the plugin!" });
        });

        // You can run any setup tasks here
        console.log("MyCoolPlugin initialized.");
    }
}

// Ensure you export an instantiated object, not just the class definition!
module.exports = new MyCoolPlugin();
```

## 4. Heavy Assets (Convention)
If your plugin requires heavy binaries, large models, or specific files, it is highly recommended to place them in a `resources/` subfolder inside your plugin directory. Configure a `.gitignore` inside your plugin folder to prevent committing massive files (like `.gguf` AI models) to your GitHub repository.

## 5. UI Toast Notifications
If your backend plugin (e.g., a background task) needs to push a visual notification to the user's dashboard UI, you should avoid tightly coupling your plugin to internal Socket.io instances. Instead, use the decoupled REST API endpoint `/api/toast`.

Because the request originates from `localhost`, it automatically bypasses user session checks, allowing background tasks to safely ping the UI:

```javascript
// Example: Sending a toast notification to the dashboard
fetch(`http://localhost:${config.port}/api/toast`, {
    method: 'POST',
    headers: { 
        'Content-Type': 'application/json',
        'x-sequential-secret': config.systemSecret 
    },
    body: JSON.stringify({
        type: 'success', // 'success', 'error', 'info', or 'warning'
        header: 'Proof-Reader',
        message: 'No grammar errors found on this page!'
    })
}).catch(err => console.error("Toast Failed:", err));
```
The core engine intercepts this request and automatically relays it to the browser via WebSocket.

## 6. Lifecycle Hooks (Editor Integration)
Hooks let the dashboard talk to your plugin at the right moments without the dashboard ever knowing your plugin's name. There is no `addEventListener` here: plugins run on the Node server, so the "subscription" is declarative and the delivery is HTTP.

Subscribing is two steps:

**Step 1 - declare the hook in `plugin.json`:**
```json
{
  "name": "My Cool Plugin",
  "enabled": true,
  "hooks": ["page-open", "editor-presence"]
}
```

**Step 2 - handle the POST in your `init()`:**
```javascript
init(subRouter, config = {}) {
    subRouter.post('/hooks/page-open', async (req, res) => {
        const { scene, characters, pageId } = req.body;
        // ...analyze the page...
        res.json({ ok: true, source: 'My Cool Plugin', annotations: [] });
    });
}
```

At runtime the dashboard asks `GET /api/plugins/hooks/{hookName}` for the folder names of enabled plugins whose manifest lists that hook, then POSTs to each one's `/api/plugins/{folder}/hooks/{hookName}` route. The manifest line is the event listener; the route is the callback. Deleting a plugin's folder removes it from every hook with no core code changes.

### Available Hooks

#### `page-open`
Fired when a page opens in the editor (fire-and-forget; slow responses are fine and stale ones are dropped if the user has moved to another page).

Payload:
```json
{
  "series": "...", "seriesFolder": "...",
  "volume": "volume-2", "chapter": "chapter-6", "pageId": "page74",
  "scene": [ "...page scene items..." ],
  "characters": [ "...series characters..." ]
}
```

Expected response:
```json
{
  "ok": true,
  "source": "My Cool Plugin",
  "annotations": [
    { "targetId": "<scene item id>", "severity": "warning", "title": "...", "note": "..." }
  ]
}
```
Annotations render as a severity-colored badge in the editor header (`GlassAnnotations`); clicking an entry selects the scene item matching `targetId`. Severity is `info`, `warning`, or `error`. Return an empty `annotations` array when you have nothing to say - including when a dependency is offline. A background hook should stay silent on failure, not surface errors to the writer.

#### `editor-presence`
A heartbeat POSTed roughly every 30 seconds while the dashboard is open, with an empty payload. The beats themselves are the signal: use them to start expensive background processes on the first beat and shut them down once the beats stop. `Local-Llm-Engine` is the reference implementation - it starts llama-server on the first beat and a watchdog frees the memory after 2 minutes of silence, so the model dies with the dashboard but survives a browser refresh.
