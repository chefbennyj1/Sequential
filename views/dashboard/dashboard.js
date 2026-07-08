// views/dashboard/dashboard.js

import { getCurrentUser } from './studio/api/StudioClient.js';
import {
    registerNavigationHandlers,
    restoreStateFromUrl
} from './studio/js/Navigation.js';
import { populateSeriesSelect } from './studio/js/LibraryManager.js';
import { setActivePage, restoreLastActivePage } from './studio/js/PageConfigManager.js';
import {
    initSceneEditor,
    openVisualEditor
} from './components/SceneEditor/SceneEditor.js';
import { initFileBrowser } from './components/FileBrowser/FileBrowser.js';
import CharacterEditor from './components/CharacterLab/CharacterLab.js';
import ScheduledTaskView from './components/ScheduledTasks/ScheduledTasks.js';
import { initPlotLab } from './components/PlotLab/PlotLab.js';
import { initStoryCritic } from './components/StoryCritic/StoryCritic.js';
import { initStyleLab } from './studio/js/StyleLab.js';
import { initAccounts } from './sections/accounts/accounts.js';
import { initUserSettings } from './sections/user-settings/user-settings.js';
import { initPluginManager } from './sections/plugin-manager/plugin-manager.js';

// Imported Refactored Modules
import { initEventHandlers } from './studio/js/EventHandlers.js';
import { initFormHandlers } from './studio/js/FormHandlers.js';
import { initExportManager } from './studio/js/ExportManager.js';
import { startPresenceHeartbeat } from './studio/js/PluginHooks.js';

export async function init(container) {
    console.log("Initializing Dashboard...");

    // Initialize WebSockets
    if (typeof io !== 'undefined') {
        window.socket = io();
        window.socket.on('connect', () => {
            console.log(`[WebSocket] Connected with ID: ${window.socket.id}`);
        });
        
        window.socket.on('plugin_toast', (data) => {
            if (window.GlassToast) {
                window.GlassToast.show(data.type || 'info', data.title || 'Notification', data.message || '');
            }
        });

        // Pulse the topbar brain once whenever a vision scan lands
        window.socket.on('panel_ai_updated', () => {
            const indicator = document.getElementById('dashboard-ai-indicator');
            if (!indicator) return;
            indicator.classList.remove('ai-pulse');
            void indicator.offsetWidth; // restart the animation if pulses overlap
            indicator.classList.add('ai-pulse');
        });
    } else {
        console.warn("[WebSocket] Socket.io client script not found.");
    }

    // Initialize Global Selects
    populateSeriesSelect('globalSeriesSelect').then(() => {
        const savedSeries = localStorage.getItem('globalSeries');
        if (savedSeries) {
            const sSel = document.getElementById('globalSeriesSelect');
            if (sSel) {
                sSel.value = savedSeries;
                // Dispatch change so globalVolumeSelect populates
                sSel.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    });

    populateSeriesSelect('settingsSeriesSelect');

    const allSections = container.querySelectorAll('.dashboard-section');

    // --- Register Navigation Handlers ---
    registerNavigationHandlers({
        openVisualEditor,
        setActivePage
    });

    // --- Initialize Base Event Handlers ---
    initEventHandlers(container, allSections);

    // --- Lazy Initialize Sub-Systems when fragments load ---
    container.addEventListener('fragmentLoaded', (e) => {
        const section = e.detail.section;
        console.log(`[Dashboard] Initializing sub-system for: ${section}`);
        
        if (['create-new-volume', 'create-new-chapter', 'edit-volume', 'library-settings', 'page-builder'].includes(section)) {
            try { initFormHandlers(container); } catch (err) { console.error("FormHandlers init failed", err); }
        }
        if (section === 'export-tool') {
            try { initExportManager(container); } catch (err) { console.error("ExportManager init failed", err); }
        }
        if (section === 'layout-editor' || section === 'page-builder') {
             try { initSceneEditor(); } catch (err) { console.error("SceneEditor init failed", err); }
             try { initFileBrowser(); } catch (err) { console.error("FileBrowser init failed", err); }
        }
        if (section === 'characters') {
             try { new CharacterEditor(container); } catch (err) { console.error("CharacterEditor init failed", err); }
        }
        if (section === 'scheduled-tasks') {
             try { new ScheduledTaskView(); } catch (err) { console.error("ScheduledTaskView init failed", err); }
        }
        if (section === 'plot-lab') {
             try { initPlotLab(container); } catch (err) { console.error("PlotLab init failed", err); }
        }
        if (section === 'story-critic') {
             try { initStoryCritic(container); } catch (err) { console.error("StoryCritic init failed", err); }
        }
        if (section === 'style-lab') {
             try { initStyleLab(container); } catch (err) { console.error("StyleLab init failed", err); }
        }
        if (section === 'accounts') {
             try { initAccounts(); } catch (err) { console.error("Accounts init failed", err); }
        }
        if (section === 'user-settings') {
             try { initUserSettings(); } catch (err) { console.error("UserSettings init failed", err); }
        }
        if (section === 'plugin-manager') {
             try { initPluginManager(); } catch (err) { console.error("PluginManager init failed", err); }
        }
    });

    // Inject PlotLab CSS
    if (!document.querySelector(`link[href="/views/dashboard/components/PlotLab/PlotLab.css"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/views/dashboard/components/PlotLab/PlotLab.css';
        document.head.appendChild(link);
    }

    // Inject StoryCritic CSS
    if (!document.querySelector(`link[href="/views/dashboard/components/StoryCritic/StoryCritic.css"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/views/dashboard/components/StoryCritic/StoryCritic.css';
        document.head.appendChild(link);
    }

    // --- AI Status Indicator Logic ---
    const updateAIIndicator = async () => {
        try {
            const res = await fetch('/api/settings/global');
            if (!res.ok) return;
            const data = await res.json();
            
            // Set Global AI Config
            window.AI_CONFIG = {
                visionEnabled: !!(data.ok && data.settings?.vision?.enabled)
            };

            const indicator = document.getElementById('dashboard-ai-indicator');
            const svg = document.getElementById('dashboard-ai-brain-svg');
            if (window.AI_CONFIG.visionEnabled) {
                svg.style.fill = '#00ccff';
                svg.style.filter = 'drop-shadow(0 0 5px rgba(0,204,255,0.5))';
                indicator.title = 'AI Vision: Enabled';
            } else {
                svg.style.fill = '#555';
                svg.style.filter = 'none';
                indicator.title = 'AI Vision: Disabled';
            }
        } catch (e) {
            console.warn("[Dashboard] AI Status indicator check failed (likely permissions).");
        }
    };
    updateAIIndicator();

    // User & Data Load
    let user;
    try {
        user = await getCurrentUser();
    } catch (e) {
        window.location.href = "/login?returnTo=" +
            encodeURIComponent(window.location.pathname + window.location.search);
        return;
    }

    const userNameEl = document.getElementById('user-name');
    if (userNameEl) {
        userNameEl.textContent = user.username;

        if (window.GlassToast) {
            window.GlassToast.show('info', 'Welcome back, ' + user.username);
        }
    }

    if (user.avatar) {
        document.querySelectorAll('#userProfileToggle .avatar').forEach(el => {
            if (el.tagName === 'IMG') el.src = user.avatar;
        });
    }

    // --- Role-Based UI Filtering ---
    const role = user.role || 'basic';
    console.log(`[Dashboard] Initializing for role: ${role}`);

    // Keep presence-subscribed plugins (e.g. local LLM engines) alive while
    // the dashboard is open; they shut down once the beats stop.
    startPresenceHeartbeat();

    // --- Server power controls (admin only) ---
    const restartBtn = document.getElementById('restartServerBtn');
    const shutdownBtn = document.getElementById('shutdownServerBtn');
    if (role === 'admin' && restartBtn && shutdownBtn) {
        restartBtn.classList.remove('hidden');
        shutdownBtn.classList.remove('hidden');

        restartBtn.onclick = async () => {
            const confirmed = await window.GlassConfirm.show('Restart Server',
                'The server and all plugin processes will stop, then start fresh. The dashboard reloads when it is back.', 'Restart');
            if (!confirmed) return;
            await fetch('/api/system/restart', { method: 'POST' });
            if (window.GlassToast) window.GlassToast.show('info', 'Restarting', 'Waiting for the server to come back...', 0);
            // Give the old process time to exit before polling for the new one
            setTimeout(() => {
                const poll = setInterval(async () => {
                    try {
                        const res = await fetch('/api/test', { cache: 'no-store' });
                        if (res.ok) { clearInterval(poll); location.reload(); }
                    } catch (err) { /* still down; keep polling */ }
                }, 2000);
            }, 5000);
        };

        shutdownBtn.onclick = async () => {
            const confirmed = await window.GlassConfirm.show('Shut Down Server',
                'The server and all plugin processes will stop. You will need to start it again manually.', 'Shut Down');
            if (!confirmed) return;
            await fetch('/api/system/shutdown', { method: 'POST' });
            if (window.GlassToast) window.GlassToast.show('info', 'Server stopped', 'You can close this tab.', 0);
        };
    }

    // --- Notification bell ---
    const myUserId = user._id || user.id;

    (async () => {
        try {
            const res = await fetch('/api/notifications');
            const data = await res.json();
            if (!data.ok) return;
            // glass_component.js loads via a plain script tag; wait for it briefly
            for (let i = 0; i < 10 && !window.GlassNotifications; i++) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            if (window.GlassNotifications) window.GlassNotifications.init(data.notifications);
        } catch (err) {
            console.warn('[Dashboard] Notification init failed:', err.message);
        }
    })();

    if (window.socket) {
        window.socket.on('notification', (n) => {
            if (n.user !== myUserId) return; // broadcast channel; keep only our own
            if (window.GlassNotifications) window.GlassNotifications.add(n);
        });
    }

    // Clicking a linked notification opens that page in the editor
    document.addEventListener('glass:notification:select', (e) => {
        const link = e.detail.notification?.link;
        if (!link || !link.pageId) return;
        openVisualEditor(link.volume, link.chapter, link.pageId, 'landscape', link.series || null, link.seriesFolder || null);
    });

    // Define restrictions
    const moderatorHidden = ['user-settings', 'create-new-volume', 'scheduled-tasks', 'create-new-chapter', 'accounts'];
    const basicHidden = ['studio', 'scheduled-tasks', 'user-settings', 'accounts'];

    const hiddenTargets = role === 'admin' ? [] : (role === 'moderator' ? moderatorHidden : basicHidden);

    // Navigation items
    const navItems = container.querySelectorAll('.glass-tab');
    navItems.forEach(item => {
        if (hiddenTargets.includes(item.dataset.page)) {
            item.style.display = 'none';
        }
    });

    // Studio cards (if visible)
    const modeCards = container.querySelectorAll('.mode-card');
    modeCards.forEach(card => {
        if (hiddenTargets.includes(card.dataset.target)) {
            card.style.display = 'none';
        }
    });

    if (role === 'moderator' || role === 'basic') {
        // Specific sub-tool restrictions (e.g. within Page Builder)
        const adminOnlyBuilderTools = ['modeInsertBtn', 'modeCreateBtn'];
        adminOnlyBuilderTools.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }

    // Default view for basic users (who don't have 'studio' active)
    if (role === 'basic') {
        const studioTab = container.querySelector('.glass-tab[data-page="studio"]');
        if (studioTab) {
            studioTab.setAttribute('aria-selected', 'false');
            studioTab.classList.remove('glass-nav__item--active');
        }

        const settingsTab = container.querySelector('.glass-tab[data-page="library-settings"]');
        if (settingsTab) {
            settingsTab.setAttribute('aria-selected', 'true');
            settingsTab.classList.add('glass-nav__item--active');
        }

        container.querySelector('.studio').classList.add('hidden');
        container.querySelector('.library-settings').classList.remove('hidden');
    }

    // Admins see everything (default state of dashboard.html)

    // Restore State
    await restoreStateFromUrl(container);
    await restoreLastActivePage();
}
