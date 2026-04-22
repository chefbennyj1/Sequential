// views/dashboard/studio/js/FormHandlers.js

import { setActivePage } from './PageConfigManager.js';
import { updateUrlState } from './Navigation.js';

export function initFormHandlers(container) {
    // Page Builder Form Submission (Create Page)
    const createPageForm = document.getElementById('page-builder-form');      
    if (createPageForm) {
        createPageForm.onsubmit = async (e) => {
            e.preventDefault();
            const btn = document.getElementById('createPageBtn');
            const status = document.getElementById('builderStatus');

            const volSelect = document.getElementById('builderVolumeSelect'); 
            const vol = volSelect.value;
            const seriesId = volSelect.options[volSelect.selectedIndex]?.getAttribute('data-series-id');
            const chapSelect = document.getElementById('builderChapterSelect');
            const chap = chapSelect.value;
            const pageId = document.getElementById('builderPageId').value;    
            const layout = document.getElementById('builderLayoutSelect').value;

            if (!vol || !chap || !pageId || !layout) {
                status.textContent = "Please fill all fields.";
                status.className = "builder-status text-accent";
                return;
            }

            btn.disabled = true;
            btn.textContent = "Creating...";
            status.textContent = "Processing...";
            status.className = "builder-status text-muted";

            try {
                const res = await fetch('/api/editor/create-page', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ series: seriesId, volume: vol, chapter: chap, pageId, layout })
                });
                const data = await res.json();

                if (data.ok) {
                    status.textContent = "Success! Page created. Syncing..."; 
                    status.className = "builder-status text-accent font-bold";

                    setTimeout(() => {
                        setActivePage(vol, chap, pageId);
                        updateUrlState({ tab: 'page-builder', vol, chap, page: pageId });
                    }, 1000);
                } else {
                    status.textContent = "Error: " + data.message;
                    status.className = "builder-status text-accent";
                }
            } catch (err) {
                status.textContent = "Request Failed.";
                status.className = "builder-status text-accent";
            } finally {
                btn.disabled = false;
                btn.textContent = "Create Page Structure";
            }
        };
    }

    // Insert Page Form Submission
    const insertPageForm = document.getElementById('insert-page-form');       
    if (insertPageForm) {
        insertPageForm.onsubmit = async (e) => {
            e.preventDefault();
            const btn = document.getElementById('insertPageBtn');
            const status = document.getElementById('insertStatus');

            const volSelect = document.getElementById('insertVolumeSelect');  
            const vol = volSelect.value;
            const seriesId = volSelect.options[volSelect.selectedIndex]?.getAttribute('data-series-id');
            const chapSelect = document.getElementById('insertChapterSelect');
            const chap = chapSelect.value;
            const insertPoint = document.getElementById('insertPoint').value; 

            if (!vol || !chap || !insertPoint) {
                status.textContent = "Please fill all fields.";
                status.className = "builder-status text-accent";
                return;
            }

            btn.disabled = true;
            btn.textContent = "Processing...";
            status.textContent = "Shifting folders and re-naming files...";   
            status.className = "builder-status text-muted";

            try {
                const res = await fetch('/api/editor/insert-page', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ series: seriesId, volume: vol, chapter: chap, insertPoint })
                });
                const data = await res.json();

                if (data.ok) {
                    status.textContent = "Success! Pages shifted and new page inserted.";
                    status.className = "builder-status text-accent font-bold";

                    const newPageId = 'page' + insertPoint;
                    setActivePage(vol, chap, newPageId);
                    updateUrlState({ tab: 'page-builder', vol, chap, page: newPageId });
                } else {
                    status.textContent = "Error: " + data.message;
                    status.className = "builder-status text-accent";
                }
            } catch (err) {
                status.textContent = "Request Failed.";
                status.className = "builder-status text-accent";
            } finally {
                btn.disabled = false;
                btn.textContent = "Insert & Shift Pages";
            }
        };
    }

    // Create Chapter Form Submission
    const createChapterForm = document.getElementById('chapter-info');        
    if (createChapterForm) {
        createChapterForm.onsubmit = async (e) => {
            e.preventDefault();
            const btn = document.getElementById('createChapterBtn');
            const status = document.getElementById('chapterStatus');

            const volSelect = document.getElementById('chapterVolumeSelect'); 
            const vol = volSelect.value;
            const seriesId = volSelect.options[volSelect.selectedIndex]?.getAttribute('data-series-id');
            const chapterIndex = document.getElementById('chapterIndex').value;
            const title = document.getElementById('chapterTitle').value;      

            if (!vol || !chapterIndex) {
                status.textContent = "Please select a volume and enter a chapter index.";
                status.className = "builder-status text-accent";
                return;
            }

            btn.disabled = true;
            btn.textContent = "Initializing...";
            status.textContent = "Checking for existence and creating chapter...";
            status.className = "builder-status text-muted";

            try {
                const res = await fetch('/api/editor/create-chapter', {       
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ series: seriesId, volume: vol, chapterIndex, title })
                });
                const data = await res.json();

                if (data.ok) {
                    status.textContent = "Success! " + data.message + ". Syncing database...";
                    status.className = "builder-status text-accent font-bold";

                    // Give the DB a second to settle after the scan
                    setTimeout(() => {
                        setActivePage(vol, data.chapter, data.pageId);        
                        updateUrlState({ tab: 'page-builder', vol, chap: data.chapter, page: data.pageId });
                    }, 1000);
                } else {
                    status.textContent = "Error: " + data.message;
                    status.className = "builder-status text-accent";
                }
            } catch (err) {
                status.textContent = "Request Failed.";
                status.className = "builder-status text-accent";
            } finally {
                btn.disabled = false;
                btn.textContent = "Initialize Chapter";
            }
        };
    }

    // Library Settings Form Submission
    initLibrarySettings();
}

function initLibrarySettings() {
    const seriesSelect = document.getElementById('settingsSeriesSelect');
    const formContainer = document.getElementById('series-settings-form-container');
    const form = document.getElementById('library-settings-form');
    const seriesIdInput = document.getElementById('settings-series-id');
    const defaultViewSelect = document.getElementById('settings-default-view-mode');

    if (seriesSelect) {
        seriesSelect.onchange = async () => {
            const seriesId = seriesSelect.value;
            if (!seriesId) {
                formContainer.classList.add('hidden');
                return;
            }

            try {
                const res = await fetch(`/api/library/series/${seriesId}`);
                const data = await res.json();
                if (data.ok && data.series) {
                    seriesIdInput.value = data.series._id;
                    if (data.series.settings) {
                        defaultViewSelect.value = data.series.settings.defaultViewMode || 'landscape';
                    }
                    formContainer.classList.remove('hidden');
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
            const settings = {
                defaultViewMode: defaultViewSelect.value
            };

            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = "Saving...";

            try {
                const res = await fetch(`/api/library/series/${seriesId}/settings`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ settings })
                });
                const data = await res.json();
                if (data.ok) {
                    alert("Library settings saved successfully!");
                } else {
                    alert("Error saving settings: " + data.message);
                }
            } catch (err) {
                console.error("Failed to save series settings", err);
                alert("Request failed.");
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        };
    }
}
