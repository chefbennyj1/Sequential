// views/dashboard/studio/js/ExportManager.js
import { fetchSingleVolumeWithChapters } from '../api/StudioClient.js';
import { renderPreviewCarousel } from '../../components/PreviewCarousel/PreviewCarousel.js';

export function initExportManager(container) {
    const startExportBtn = document.getElementById('startExportBtn');
    const volumeSelect = document.getElementById('exportVolumeSelect');
    const carousel = document.getElementById('export-carousel');
    
    // Global socket access (assuming socket.io is available on window or dashboard)
    const socket = window.io ? window.io() : null;

    if (socket) {
        socket.on('export_progress', (data) => {
            const progressBar = document.getElementById('export-progress-bar');
            const progressPercent = document.getElementById('exportProgressPercent');
            const progressLabel = document.getElementById('exportProgressLabel');
            const statusMsg = document.getElementById('exportStatusMsg');

            if (progressBar && progressPercent && progressLabel) {
                const percent = Math.round((data.current / data.total) * 100);
                progressBar.style.width = `${percent}%`;
                progressPercent.textContent = `${percent}%`;
                progressLabel.textContent = `Exporting: ${data.pageId} (${data.current}/${data.total})`;
            }

            if (statusMsg) {
                statusMsg.textContent = data.status;

                // Reset button state if complete or error
                const isComplete = data.status.includes('Complete') || data.status.includes('complete');
                const isError = data.pageId === 'ERROR' || data.pageId === 'PDF Error';

                if (isComplete || isError) {
                    const startExportBtn = document.getElementById('startExportBtn');
                    if (startExportBtn) {
                        startExportBtn.innerHTML = 'Start Background Export <ion-icon size="small" name="print"></ion-icon>';
                        startExportBtn.style.pointerEvents = 'auto';
                    }
                    resetPdfButton();
                    if (isError) statusMsg.style.color = 'red';
                    else statusMsg.style.color = 'var(--cyber-primary, #00ff41)';
                    
                    // Refresh carousel after completion to see new exports
                    if (isComplete && volumeSelect && volumeSelect.value) {
                        loadVolumePages(volumeSelect.value, carousel);
                    }
                }
            }
        });
    }

    if (volumeSelect) {
        volumeSelect.addEventListener('change', async (e) => {
            if (e.target.value) {
                await loadVolumePages(e.target.value, carousel);
            } else {
                carousel.innerHTML = '<div class="text-muted padding-20">Select a volume to preview pages.</div>';
                populatePdfChapterList(null);
            }
        });
    }

    const refreshBtn = document.getElementById('refreshExportCarouselBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            if (volumeSelect && volumeSelect.value) {
                await loadVolumePages(volumeSelect.value, carousel);
            }
        });
    }

    if(startExportBtn) {
        startExportBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const volumeSelect = document.getElementById('exportVolumeSelect');
            const presetSelect = document.getElementById('exportPresetSelect');
            const targetPageInput = document.getElementById('exportTargetPage');
            const progressContainer = document.getElementById('exportProgressContainer');

            if(!volumeSelect || !volumeSelect.value) {
                alert("Please select a volume first.");
                return;
            }

            const optionText = volumeSelect.options[volumeSelect.selectedIndex].text;
            const preset = presetSelect ? presetSelect.value : 'uk-table';    
            const presetText = presetSelect ? presetSelect.options[presetSelect.selectedIndex].text : 'UK Table';
            const targetPage = targetPageInput ? targetPageInput.value.trim() : '';

                // Standardize on Portrait, remove Landscape option as requested.
                const portrait = true;

                let confirmMsg = 'Are you sure you want to export ' + optionText + ' (' + presetText + ') to High-Res PNGs?';
                if (targetPage) {
                    confirmMsg = 'Are you sure you want to export ONLY page ' + targetPage + ' from ' + optionText + ' (' + presetText + ')?';
                }

                const finalConfirm = confirm(
                    confirmMsg + 
                    '\n\nIMPORTANT: Please double-check your two-page spread positions (left/right alignment) before proceeding. ' +
                    'Page shifts can occasionally displace spreads.' +
                    '\n\nThis will take a few minutes in the background.'
                );

                if(!finalConfirm) return;

                const btn = e.currentTarget;
                const originalText = btn.innerHTML;
                const statusMsg = document.getElementById('exportStatusMsg');     

                // Reset and Show Progress UI
                if (progressContainer) progressContainer.classList.remove('hidden');
                const progressBar = document.getElementById('export-progress-bar');
                if (progressBar) progressBar.style.width = '0%';
                document.getElementById('exportProgressPercent').textContent = '0%';
                document.getElementById('exportProgressLabel').textContent = 'Initializing...';

                btn.innerHTML = 'Exporting... <ion-icon size="small" name="hourglass"></ion-icon>';
                btn.style.pointerEvents = 'none';
                statusMsg.textContent = "Connecting to headless engine...";

                try {
                    // Resolve series and volume folder from dropdown attributes
                    const seriesSelect = document.getElementById('exportSeriesSelect');
                    const cleanSeries = seriesSelect.options[seriesSelect.selectedIndex]?.getAttribute('data-folder');
                    const cleanVolume = volumeSelect.options[volumeSelect.selectedIndex]?.getAttribute('data-folder');

                    if (!cleanSeries || !cleanVolume) {
                        console.error("Could not determine series or volume folder from selection.");
                        statusMsg.textContent = "Error: Invalid series or volume selection.";
                        statusMsg.style.color = "red";
                        btn.innerHTML = originalText;
                        btn.style.pointerEvents = 'auto';
                        return;
                    }

                    let fetchUrl = '/api/editor/export-volume/' + cleanSeries + '/' + cleanVolume + '?portrait=' + portrait + '&preset=' + preset;
                    if (targetPage) fetchUrl += '&targetPage=' + encodeURIComponent(targetPage);

                const res = await fetch(fetchUrl, { method: 'POST' });        
                const result = await res.json();

                if (result.ok) {
                    statusMsg.textContent = result.message;
                    // Button stays disabled until completion (though we don't have a completion event yet, 
                    // the user sees the progress bar now).
                } else {
                    statusMsg.textContent = "Export failed: " + result.message;
                    statusMsg.style.color = "red";
                    btn.innerHTML = originalText;
                    btn.style.pointerEvents = 'auto';
                }
            } catch (error) {
                console.error("Error starting export:", error);
                statusMsg.textContent = "Failed to contact server for export.";
                statusMsg.style.color = "red";
                btn.innerHTML = originalText;
                btn.style.pointerEvents = 'auto';
            }
        });
    }

    const buildPdfBtn = document.getElementById('buildPdfBtn');
    if (buildPdfBtn) {
        buildPdfBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const seriesSelect = document.getElementById('exportSeriesSelect');
            const presetSelect = document.getElementById('exportPresetSelect');
            const statusMsg = document.getElementById('exportStatusMsg');

            const cleanSeries = seriesSelect.options[seriesSelect.selectedIndex]?.getAttribute('data-folder');
            const cleanVolume = volumeSelect.options[volumeSelect.selectedIndex]?.getAttribute('data-folder');

            if (!cleanSeries || !cleanVolume) {
                alert('Please select a series and volume first.');
                return;
            }

            const checked = Array.from(document.querySelectorAll('#pdfChapterList input:checked')).map(cb => cb.value);
            const preset = presetSelect ? presetSelect.value : 'uk-table';
            const scopeText = checked.length ? 'chapters ' + checked.join(', ') : 'the entire volume';

            if (!confirm('Build a PDF from the existing "' + preset + '" exports for ' + scopeText + '?')) return;

            const progressContainer = document.getElementById('exportProgressContainer');
            if (progressContainer) progressContainer.classList.remove('hidden');
            document.getElementById('export-progress-bar').style.width = '0%';
            document.getElementById('exportProgressPercent').textContent = '0%';
            document.getElementById('exportProgressLabel').textContent = 'Combining PDF...';

            buildPdfBtn.innerHTML = 'Building PDF... <ion-icon size="small" name="hourglass"></ion-icon>';
            buildPdfBtn.style.pointerEvents = 'none';

            try {
                let url = '/api/editor/combine-pdf/' + cleanSeries + '/' + cleanVolume + '?preset=' + preset;
                if (checked.length) url += '&chapters=' + encodeURIComponent(checked.join(','));

                const res = await fetch(url, { method: 'POST' });
                const result = await res.json();

                if (result.ok) {
                    statusMsg.style.color = 'var(--cyber-primary, #00ff41)';
                    statusMsg.textContent = result.message;
                    if (result.missingPages && result.missingPages.length) {
                        statusMsg.textContent += ' Missing renders for pages: ' + result.missingPages.join(', ');
                    }
                } else {
                    statusMsg.style.color = 'red';
                    statusMsg.textContent = 'PDF build failed: ' + result.message;
                    resetPdfButton();
                }
            } catch (err) {
                console.error('Error starting PDF build:', err);
                statusMsg.style.color = 'red';
                statusMsg.textContent = 'Failed to contact server for PDF build.';
                resetPdfButton();
            }
        });
    }
}

function resetPdfButton() {
    const btn = document.getElementById('buildPdfBtn');
    if (btn) {
        btn.innerHTML = 'Build PDF <ion-icon size="small" name="document-outline"></ion-icon>';
        btn.style.pointerEvents = 'auto';
    }
}

function populatePdfChapterList(volumeData) {
    const list = document.getElementById('pdfChapterList');
    if (!list) return;

    if (!volumeData || !volumeData.chapters || volumeData.chapters.length === 0) {
        list.innerHTML = '<p class="font-size-07 text-muted">Select a volume to list its chapters.</p>';
        return;
    }

    list.innerHTML = volumeData.chapters
        .slice()
        .sort((a, b) => a.chapterNumber - b.chapterNumber)
        .map(chap =>
            '<label class="glass-check-label">' +
                '<input type="checkbox" value="' + chap.chapterNumber + '">' +
                '<span class="glass-check-box"></span>' +
                '<span>Chapter ' + chap.chapterNumber + ' (' + (chap.pages ? chap.pages.length : 0) + ' pages)</span>' +
            '</label>'
        ).join('');
}

async function loadVolumePages(volumeId, carousel) {
    carousel.innerHTML = '<div class="text-muted padding-20">Loading preview...</div>';
    
    // Get series name from the series select
    const seriesSelect = document.getElementById('exportSeriesSelect');
    const seriesFolderName = seriesSelect.options[seriesSelect.selectedIndex]?.getAttribute('data-folder');
    
    if (!seriesFolderName) {
        carousel.innerHTML = '<div class="text-danger padding-20">Could not determine series folder.</div>';
        return;
    }

    try {
        const volumeData = await fetchSingleVolumeWithChapters(volumeId, seriesFolderName);
        if (!volumeData || !volumeData.chapters) {
            carousel.innerHTML = '<div class="text-danger padding-20">Failed to load volume structure.</div>';
            populatePdfChapterList(null);
            return;
        }

        populatePdfChapterList(volumeData);

        const pages = [];
        const volumeFolderName = volumeData.volumePath ? volumeData.volumePath.split(/[\\/]/).filter(Boolean).pop() : `volume-${volumeData.index}`;

        volumeData.chapters.sort((a, b) => a.chapterNumber - b.chapterNumber).forEach(chap => {
            chap.pages.forEach(p => {
                pages.push({
                    ...p,
                    chapterNumber: chap.chapterNumber,
                    series: seriesFolderName,
                    volumeFolder: volumeFolderName
                });
            });
        });

        renderPreviewCarousel(pages, carousel, seriesFolderName);
    } catch (e) {
        console.error(e);
        carousel.innerHTML = '<div class="text-danger padding-20">Error loading pages.</div>';
    }
}
