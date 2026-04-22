// views/dashboard/dashboard.js

// --- Global Fetch Interceptor ---
// Intercept all fetch calls to catch 401/403 errors and redirect to login
const originalFetch = window.fetch;
window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (response.status === 401 || response.status === 403) {
        window.location.href = '/login';
    }
    return response;
};

import { getCurrentUser } from './studio/js/ApiService.js';
import {
    registerNavigationHandlers,
    restoreStateFromUrl
} from './studio/js/Navigation.js';
import { populateSeriesSelect } from './studio/js/LibraryManager.js';
import { setActivePage } from './studio/js/PageConfigManager.js';
import {
    initSceneEditor,
    initVisualEditor,
    openSceneEditor,
    openVisualEditor
} from './components/SceneEditor/SceneEditor.js';
import { initFileBrowser } from './components/FileBrowser/FileBrowser.js';    
import CharacterEditor from './components/CharacterLab/CharacterLab.js';      
import ScheduledTaskView from './components/ScheduledTasks/ScheduledTasks.js';
import { initPlotLab } from './components/PlotLab/PlotLab.js';

// Imported Refactored Modules
import { initEventHandlers } from './studio/js/EventHandlers.js';
import { initFormHandlers } from './studio/js/FormHandlers.js';
import { initExportManager } from './studio/js/ExportManager.js';

export async function init(container) {
    console.log("Initializing Dashboard...");

    // Initialize WebSockets
    if (typeof io !== 'undefined') {
        window.socket = io();
        window.socket.on('connect', () => {
            console.log(`[WebSocket] Connected with ID: ${window.socket.id}`);
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
        openSceneEditor,
        openVisualEditor,
        setActivePage
    });

    // --- Initialize Refactored Sub-Systems ---
    initEventHandlers(container, allSections);
    initFormHandlers(container);
    initExportManager(container);

    // Initialize UI Sub-Systems
    initFileBrowser();
    initSceneEditor();
    initVisualEditor();
    new CharacterEditor(container);
    new ScheduledTaskView();
    initPlotLab(container);

    // Inject PlotLab CSS
    if (!document.querySelector(`link[href="/views/dashboard/components/PlotLab/PlotLab.css"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/views/dashboard/components/PlotLab/PlotLab.css';        
        document.head.appendChild(link);
    }

    // User & Data Load
    let user;
    try {
        user = await getCurrentUser();
    } catch (e) {
        window.location.href = "/login";
        return;
    }

    document.getElementById('user-name').textContent = user.username;

    // --- Role-Based UI Filtering ---
    const role = user.role || 'basic';
    console.log(`[Dashboard] Initializing for role: ${role}`);

    // Define restrictions
    const moderatorHidden = ['user-settings', 'create-new-volume', 'scheduled-tasks', 'create-new-chapter'];
    const basicHidden = ['studio', 'scheduled-tasks', 'user-settings'];

    const hiddenTargets = role === 'admin' ? [] : (role === 'moderator' ? moderatorHidden : basicHidden);

    // Sidebar items
    const sidebarItems = container.querySelectorAll('.sidebar li');
    sidebarItems.forEach(li => {
        if (hiddenTargets.includes(li.dataset.page)) {
            li.style.display = 'none';
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
        const studioTab = container.querySelector('.sidebar li[data-page="studio"]');
        if (studioTab) studioTab.classList.remove('active');
        
        const settingsTab = container.querySelector('.sidebar li[data-page="library-settings"]');
        if (settingsTab) settingsTab.classList.add('active');

        container.querySelector('.studio').classList.add('hidden');
        container.querySelector('.library-settings').classList.remove('hidden');
    }

    // Admins see everything (default state of dashboard.html)

    // Restore State
    restoreStateFromUrl(container);
}
