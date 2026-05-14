// views/dashboard/studio/js/ExportManager.js

export function initExportManager(container) {
    const startExportBtn = document.getElementById('startExportBtn');
    
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

                // Reset button state if complete
                if (data.status === 'Export Complete!' || data.status === 'Export & PDF Complete!') {
                    const startExportBtn = document.getElementById('startExportBtn');
                    if (startExportBtn) {
                        startExportBtn.innerHTML = 'Start Print Export <ion-icon name="print-outline"></ion-icon>';
                        startExportBtn.style.pointerEvents = 'auto';
                    }
                }
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

            const portrait = document.getElementById('exportPortraitOption').checked;
            const landscape = document.getElementById('exportLandscapeOption').checked;
            const pdf = document.getElementById('exportPdfOption').checked;   

            if(!portrait && !landscape && !pdf) {
                alert("Please select at least one export format.");
                return;
            }

            let confirmMsg = 'Are you sure you want to export ' + optionText + ' (' + presetText + ') to High-Res PNGs?';
            if (targetPage) {
                confirmMsg = 'Are you sure you want to export ONLY page ' + targetPage + ' from ' + optionText + ' (' + presetText + ')?';
            }

            if(!confirm(confirmMsg + ' This will take a few minutes in the background.')) return;

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
                // Parse series and volume folder from the select text (e.g. "No_Overflow - Volume 1")
                const [seriesPart, volumePart] = optionText.split(' - ');
                const cleanSeries = seriesPart ? seriesPart.trim() : null;    
                if (!cleanSeries) {
                    console.error("Could not determine series from volume title:", optionText);
                    return;
                }

                // Convert "Volume 1" to "volume-1"
                let cleanVolume = 'volume-1';
                if (volumePart) {
                    cleanVolume = volumePart.trim().toLowerCase().replace(/\s+/g, '-');
                }

                let fetchUrl = '/api/editor/export-volume/' + cleanSeries + '/' + cleanVolume + '?portrait=' + portrait + '&landscape=' + landscape + '&pdf=' + pdf + '&preset=' + preset;
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
}
