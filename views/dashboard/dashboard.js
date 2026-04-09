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

    // Restore State
    restoreStateFromUrl(container);
}
