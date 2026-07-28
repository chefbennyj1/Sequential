// views/dashboard/studio/js/FormHandlers.js

import { setActivePage } from './PageConfigManager.js';
import { updateUrlState } from './Navigation.js';
import { fetchChapterRange } from '../api/StudioClient.js';

function updateStatus(statusEl, message, type = 'error') {
    if (!statusEl) return;
    statusEl.textContent = message;
    if (type === 'error') statusEl.className = "builder-status text-accent";
    else if (type === 'success') statusEl.className = "builder-status text-accent font-bold";
    else if (type === 'loading') statusEl.className = "builder-status text-muted";
}

function getSelectionData(prefix) {
    const volSelect = document.getElementById(`${prefix}VolumeSelect`);
    const vol = volSelect ? volSelect.value : null;
    const seriesId = volSelect ? volSelect.options[volSelect.selectedIndex]?.getAttribute('data-series-id') : null;
    const chapSelect = document.getElementById(`${prefix}ChapterSelect`);
    const chap = chapSelect ? chapSelect.value : null;
    return { vol, seriesId, chap };
}

function redirectAfterSuccess(vol, chap, pageId, seriesId) {
    setTimeout(() => {
        setActivePage(vol, chap, pageId, seriesId);
        updateUrlState({ tab: 'page-builder', vol, chap, page: pageId, series: seriesId });
    }, 1000);
}

const apiPost = (url, bodyData) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyData)
});

async function saveSettings(url, settings, btn, successMsg) {
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Saving...";

    try {
        const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings })
        });
        const data = await res.json();
        if (data.ok) {
            if (window.GlassToast) {
                window.GlassToast.show('success', 'Settings Saved', successMsg);
            }
        } else throw new Error(data.message);
    } catch (err) {
        console.error("Settings save failed", err);
        if (window.GlassToast) {
            window.GlassToast.show('error', 'Save Failed', err.message || "Request failed.");
        } else {
            alert("Error: " + (err.message || "Request failed."));
        }
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

async function handleApiFormSubmit(options) {
    const { 
        btn, 
        status, 
        loadingText = "Processing...", 
        loadingStatusText = "Processing...",
        originalBtnText, 
        fetchCall, 
        onSuccess,
        onFinally,
        successMsg = "Success!"
    } = options;

    if (btn) {
        btn.disabled = true;
        btn.textContent = loadingText;
    }
    updateStatus(status, loadingStatusText, 'loading');

    try {
        const res = await fetchCall();
        const data = await res.json();

        if (data.ok) {
            updateStatus(status, successMsg, 'success');
            if (onSuccess) await onSuccess(data);
        } else {
            updateStatus(status, "Error: " + data.message, 'error');
        }
    } catch (err) {
        console.error(err);
        updateStatus(status, "Request Failed.", 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalBtnText;
        }
        if (onFinally) onFinally();
    }
}


export function initFormHandlers(container) {
    // Page Builder Form Submission (Create Page)
    const createPageForm = document.getElementById('page-builder-form');      
    if (createPageForm) {
        createPageForm.onsubmit = async (e) => {
            e.preventDefault();
            const btn = document.getElementById('createPageBtn');
            const status = document.getElementById('builderStatus');

            const { vol, seriesId, chap } = getSelectionData('builder');
            const pageId = document.getElementById('builderPageId').value;    
            const layout = document.getElementById('builderLayoutSelect').value;

            if (!vol || !chap || !pageId || !layout) {
                status.textContent = "Please fill all fields.";
                status.className = "builder-status text-accent";
                return;
            }

            await handleApiFormSubmit({
                btn,
                status,
                loadingText: "Creating...",
                loadingStatusText: "Processing...",
                originalBtnText: "Create Page Structure",
                successMsg: "Success! Page created. Syncing...",
                fetchCall: () => apiPost('/api/editor/create-page', { series: seriesId, volume: vol, chapter: chap, pageId, layout }),
                onSuccess: () => redirectAfterSuccess(vol, chap, pageId, seriesId)
            });
        };
    }

    // Next Consecutive Button Logic
    const getNextPageIdBtn = document.getElementById('getNextPageIdBtn');
    if (getNextPageIdBtn) {
        getNextPageIdBtn.onclick = async () => {
            const { vol, seriesId, chap } = getSelectionData('builder');
            const pageInput = document.getElementById('builderPageId');
            const status = document.getElementById('builderStatus');

            if (!vol || !chap) {
                status.textContent = "Please select Volume and Chapter first.";
                status.className = "builder-status text-accent";
                return;
            }

            await handleApiFormSubmit({
                btn: getNextPageIdBtn,
                status,
                loadingText: "...",
                loadingStatusText: "Determining next page...",
                originalBtnText: originalText,
                successMsg: "Next consecutive page ID determined.",
                fetchCall: () => fetch(`/api/editor/next-page-id?series=${seriesId}&volume=${vol}&chapter=${chap}`),
                onSuccess: (data) => {
                    pageInput.value = data.nextPageId;
                }
            });
        };
    }

    // Insert Page Form Submission
    const insertPageForm = document.getElementById('insert-page-form');       
    if (insertPageForm) {
        insertPageForm.onsubmit = async (e) => {
            e.preventDefault();
            const btn = document.getElementById('insertPageBtn');
            const status = document.getElementById('insertStatus');

            const { vol, seriesId, chap } = getSelectionData('insert');
            const insertPointStr = document.getElementById('insertPoint').value; 
            const insertPoint = parseInt(insertPointStr);

            if (!vol || !chap || isNaN(insertPoint)) {
                status.textContent = "Please fill all fields.";
                status.className = "builder-status text-accent";
                return;
            }

            // Chapter Range Validation
            status.textContent = "Validating chapter range...";
            const range = await fetchChapterRange(seriesId, vol, chap);
            if (range && range.count > 0) {
                if (insertPoint < range.min || insertPoint > (range.max + 1)) {
                    const confirmMsg = `WARNING: The selected chapter (${chap}) typically contains pages ${range.min} to ${range.max}.n\n` +
                                     `You are attempting to insert page ${insertPoint}.\n\n` +
                                     `This may cause structural issues if this chapter isn't the correct place for that index.\n\n` +
                                     `Are you sure you want to proceed?`;
                    if (!confirm(confirmMsg)) {
                        status.textContent = "Operation cancelled by user.";
                        return;
                    }
                }
            }

            await handleApiFormSubmit({
                btn,
                status,
                loadingText: "Processing...",
                loadingStatusText: "Shifting folders and re-naming files...",
                originalBtnText: "Insert & Shift Pages",
                successMsg: "Success! Pages shifted and new page inserted.",
                fetchCall: () => apiPost('/api/editor/insert-page', { series: seriesId, volume: vol, chapter: chap, insertPoint }),
                onSuccess: () => {
                    const newPageId = 'page' + insertPoint;
                    setActivePage(vol, chap, newPageId, seriesId);
                    updateUrlState({ tab: 'page-builder', vol, chap, page: newPageId, series: seriesId });
                }
            });
        };
    }

    // Create Volume Form Submission
    const createVolumeForm = document.getElementById('volume-info');
    if (createVolumeForm) {
        createVolumeForm.onsubmit = async (e) => {
            e.preventDefault();
            const btn = document.getElementById('createVolumeBtn');
            const status = document.getElementById('volumeStatus');
            const overlay = document.getElementById('savingOverlay');

            const seriesId = document.getElementById('createVolumeSeriesSelect').value;
            const index = document.getElementById('index').value;
            const title = document.getElementById('title').value;
            const firstChapterTitle = document.getElementById('firstChapterTitle').value;

            if (!seriesId || !index || !title || !firstChapterTitle) {
                status.textContent = "Please fill all fields.";
                status.className = "builder-status text-accent";
                return;
            }

            if (overlay) overlay.classList.add('active');
            await handleApiFormSubmit({
                btn,
                status,
                loadingText: "Creating...",
                loadingStatusText: "Processing...",
                originalBtnText: "Create Volume Structure",
                successMsg: "Success! Volume created. Redirecting...",
                fetchCall: () => apiPost('/api/volume/create', { seriesId, index, title, firstChapterTitle }),
                onSuccess: () => {
                    setTimeout(() => {
                        window.location.reload(); // Reload to refresh the library
                    }, 1500);
                },
                onFinally: () => {
                    if (overlay) overlay.classList.remove('active');
                }
            });
        };
    }

    // Create Chapter Form Submission
    const createChapterForm = document.getElementById('chapter-info');        
    if (createChapterForm) {
        createChapterForm.onsubmit = async (e) => {
            e.preventDefault();
            const btn = document.getElementById('createChapterBtn');
            const status = document.getElementById('chapterStatus');

            const { vol, seriesId } = getSelectionData('chapter');
            const chapterIndex = document.getElementById('chapterIndex').value;
            const title = document.getElementById('chapterTitle').value;      

            if (!vol || !chapterIndex) {
                status.textContent = "Please select a volume and enter a chapter index.";
                status.className = "builder-status text-accent";
                return;
            }

            await handleApiFormSubmit({
                btn,
                status,
                loadingText: "Initializing...",
                loadingStatusText: "Checking for existence and creating chapter...",
                originalBtnText: "Initialize Chapter",
                successMsg: "Success! Chapter created. Syncing database...",
                fetchCall: () => apiPost('/api/editor/create-chapter', { series: seriesId, volume: vol, chapterIndex, title }),
                onSuccess: (data) => {
                    updateStatus(status, "Success! " + data.message + ". Syncing database...", 'success');
                    redirectAfterSuccess(vol, data.chapter, data.pageId, seriesId);
                }
            });
        };
    }

    // Insert Chapter (shifts the target chapter and everything after it up by
    // one, plus every page inside all of them) — same fields as Create Chapter,
    // different endpoint, so it's a plain button rather than the form's submit.
    const insertChapterBtn = document.getElementById('insertChapterBtn');
    if (insertChapterBtn) {
        insertChapterBtn.onclick = async () => {
            const status = document.getElementById('chapterStatus');
            const { vol, seriesId } = getSelectionData('chapter');
            const chapterIndex = document.getElementById('chapterIndex').value;
            const title = document.getElementById('chapterTitle').value;

            if (!vol || !chapterIndex) {
                status.textContent = "Please select a volume and enter a chapter index.";
                status.className = "builder-status text-accent";
                return;
            }

            const confirmed = window.GlassConfirm
                ? await window.GlassConfirm.show('Insert Chapter', `This will shift chapter ${chapterIndex} and everything after it (chapters and pages) up by one. Continue?`, 'Insert')
                : confirm(`This will shift chapter ${chapterIndex} and everything after it up by one. Continue?`);
            if (!confirmed) return;

            await handleApiFormSubmit({
                btn: insertChapterBtn,
                status,
                loadingText: "Shifting...",
                loadingStatusText: "Shifting chapters and pages, this may take a moment...",
                originalBtnText: "Insert & Shift Chapters",
                successMsg: "Success! Chapters shifted and new chapter inserted.",
                fetchCall: () => apiPost('/api/editor/insert-chapter', { series: seriesId, volume: vol, chapterIndex, title }),
                onSuccess: (data) => {
                    updateStatus(status, "Success! " + data.message + ". Syncing database...", 'success');
                    redirectAfterSuccess(vol, data.chapter, data.pageId, seriesId);
                }
            });
        };
    }

    // Library Settings Form Submission
    initLibrarySettings();

    // Global Settings Form Submission
    initGlobalSettings();
}

async function initGlobalSettings() {
    const form = document.getElementById('global-settings-form');
    if (!form) return;

    const visionEnabled = document.getElementById('global-vision-enabled');
    const fieldsContainer = document.getElementById('vision-settings-fields');
    const apiKeyInput = document.getElementById('global-api-key');
    const modelNameSelect = document.getElementById('global-model-name');
    const systemPrompt = document.getElementById('global-system-prompt');
    const maxTokens = document.getElementById('global-max-tokens');
    const temperature = document.getElementById('global-temperature');
    const autoScan = document.getElementById('global-auto-scan');

    const toggleFields = () => {
        if (fieldsContainer && visionEnabled) {
            fieldsContainer.style.display = visionEnabled.checked ? 'block' : 'none';
        }
    };
    if (visionEnabled) visionEnabled.onchange = toggleFields;

    // Load initial data
    try {
        const res = await fetch('/api/settings/global');
        const data = await res.json();
        if (data.ok && data.settings) {
            const v = data.settings.vision || {};
            if (visionEnabled) visionEnabled.checked = v.enabled || false;
            if (apiKeyInput) apiKeyInput.value = v.apiKey || '';
            if (modelNameSelect) modelNameSelect.value = v.modelName || 'gemini-1.5-flash';
            if (systemPrompt) systemPrompt.value = v.systemPrompt || '';
            if (maxTokens) maxTokens.value = v.maxTokens || 100;
            if (temperature) temperature.value = v.temperature || 0.2;
            if (autoScan) autoScan.checked = v.autoScanOnSave !== false;
            toggleFields();
        }
    } catch (err) {
        console.error("Failed to load global settings", err);
    }

    form.onsubmit = async (e) => {
        e.preventDefault();
        const settings = {
            vision: {
                enabled: visionEnabled ? visionEnabled.checked : false,
                apiKey: apiKeyInput ? apiKeyInput.value : '',
                modelName: modelNameSelect ? modelNameSelect.value : 'gemini-1.5-flash',
                systemPrompt: systemPrompt ? systemPrompt.value : '',
                maxTokens: maxTokens ? parseInt(maxTokens.value) : 100,
                temperature: temperature ? parseFloat(temperature.value) : 0.2,
                autoScanOnSave: autoScan ? autoScan.checked : true
            }
        };

        const btn = document.getElementById('saveGlobalSettingsBtn');
        if (!btn) return;
        await saveSettings('/api/settings/global', settings, btn, 'Global AI configuration updated.');
    };
}

function initLibrarySettings() {
    const seriesSelect = document.getElementById('settingsSeriesSelect');
    const formContainer = document.getElementById('series-settings-form-container');
    const form = document.getElementById('library-settings-form');
    const seriesIdInput = document.getElementById('settings-series-id');

    if (seriesSelect) {        
        seriesSelect.onchange = async () => {
            const seriesId = seriesSelect.value;
            if (!seriesId) {   
                if (form) form.classList.add('hidden');        
                return;        
            }

            try {
                const res = await fetch(`/api/library/series/${seriesId}`);
                const data = await res.json();
                if (data.ok && data.series) {
                    seriesIdInput.value = data.series._id;    
                    if (form) form.classList.remove('hidden'); 
                }
            } catch (err) {    
                console.error("Failed to load series settings", err);
            }
        };
    }

    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const seriesId = seriesIdInput.value;
            const settings = {};

            const submitBtn = form.querySelector('button[type="submit"]');
            await saveSettings(`/api/library/series/${seriesId}/settings`, settings, submitBtn, 'Series configuration updated.');
        };
    }
}
