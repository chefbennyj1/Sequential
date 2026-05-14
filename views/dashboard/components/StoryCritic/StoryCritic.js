// views/dashboard/components/StoryCritic/StoryCritic.js
import { 
    fetchSeriesAPI, 
    fetchVolumesAPI,
    fetchSingleVolumeWithChapters
} from '../../studio/api/StudioClient.js';

let currentSeries = "";
let currentVolumeId = "";
let allPages = [];

// DOM Elements
let container, selectSeries, selectVolume, runBtn, carousel, log;

export async function initStoryCritic(dashboardContainer) {
    container = dashboardContainer.querySelector('.story-critic');
    if (!container) return;

    selectSeries = document.getElementById('critic-series-select');
    selectVolume = document.getElementById('critic-volume-select');
    runBtn = document.getElementById('run-critic-btn');
    carousel = document.getElementById('critic-carousel');
    log = document.getElementById('critic-log');

    // Initial Load
    await populateSeries();

    // Event Listeners
    selectSeries.addEventListener('change', async (e) => {
        currentSeries = e.target.value;
        if (currentSeries) {
            await populateVolumes();
            selectVolume.disabled = false;
        } else {
            selectVolume.disabled = true;
            selectVolume.innerHTML = '<option value="">Select Volume</option>';
            resetUI();
        }
    });

    selectVolume.addEventListener('change', async (e) => {
        currentVolumeId = e.target.value;
        if (currentVolumeId) {
            runBtn.disabled = false;
            await loadVolumePages();
        } else {
            runBtn.disabled = true;
            resetUI();
        }
    });

    runBtn.addEventListener('click', () => runGeminiCritic());
}

async function populateSeries() {
    try {
        const series = await fetchSeriesAPI();
        selectSeries.innerHTML = '<option value="">Select Series</option>';
        series.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.folderName;
            opt.textContent = s.title;
            selectSeries.appendChild(opt);
        });
    } catch (e) { console.error(e); }
}

async function populateVolumes() {
    try {
        const volumes = await fetchVolumesAPI();
        // Filter by series if needed, but fetchVolumesAPI returns all. 
        // We'll filter based on the series selected.
        selectVolume.innerHTML = '<option value="">Select Volume</option>';
        volumes.filter(v => v.series === currentSeries || (v.volumePath && v.volumePath.includes(currentSeries))).forEach(v => {
            const opt = document.createElement('option');
            opt.value = v._id;
            opt.textContent = `Volume ${v.index}: ${v.title}`;
            selectVolume.appendChild(opt);
        });
    } catch (e) { console.error(e); }
}

async function loadVolumePages() {
    carousel.innerHTML = '<div class="text-muted padding-20">Loading timeline...</div>';
    try {
        const volumeData = await fetchSingleVolumeWithChapters(currentVolumeId, currentSeries);
        if (!volumeData || !volumeData.chapters) {
            carousel.innerHTML = '<div class="text-danger padding-20">Failed to load volume structure.</div>';
            return;
        }

        allPages = [];
        const volumeFolderName = volumeData.volumePath ? volumeData.volumePath.split(/[\\/]/).filter(Boolean).pop() : `volume-${volumeData.index}`;

        volumeData.chapters.sort((a, b) => a.chapterNumber - b.chapterNumber).forEach(chap => {
            chap.pages.forEach(p => {
                allPages.push({
                    ...p,
                    chapterNumber: chap.chapterNumber,
                    series: currentSeries,
                    volumeFolder: volumeFolderName
                });
            });
        });

        renderCarousel();
    } catch (e) {
        console.error(e);
        carousel.innerHTML = '<div class="text-danger padding-20">Error loading pages.</div>';
    }
}

function renderCarousel() {
    carousel.innerHTML = '';
    if (allPages.length === 0) {
        carousel.innerHTML = '<div class="text-muted padding-20">No pages found in this volume.</div>';
        return;
    }

    allPages.forEach((page, index) => {
        const card = document.createElement('div');
        card.className = 'critic-page-card';
        
        // --- THUMBNAIL STRATEGY ---
        // 1. Primary: High-res Print Export
        const pageNumPadded = String(page.index).padStart(3, '0');
        
        // Check for US Portrait first, then fallback to uk-table
        const portraitExportUrl = `/Library/${currentSeries}/Print_Exports/${page.volumeFolder}_Book_Pages/us-portrait/page${pageNumPadded}_PORTRAIT.png`;
        const ukTableExportUrl = `/Library/${currentSeries}/Print_Exports/${page.volumeFolder}_Book_Pages/uk-table/page${pageNumPadded}_FULL.png`;

        // 2. Secondary Fallback: First Panel Image
        let panelUrl = '/views/public/images/page-placeholder.png';
        const media = Array.isArray(page.mediaData) ? page.mediaData : (page.mediaData?.media || []);
        if (media.length > 0) {
            const firstPanel = media[0];
            const fileName = firstPanel.url || firstPanel.fileName;
            if (fileName) {
                const chapterFolder = `chapter-${page.chapterNumber}`;
                panelUrl = `/Library/${currentSeries}/${page.volumeFolder}/${chapterFolder}/page${page.index}/assets/image/${fileName}`;
            }
        }

        // 3. Final Fallback: static placeholder
        const fallbackUrl = '/views/public/images/page-placeholder.png';

        card.innerHTML = `
            <div class="critic-page-thumb">
                <img src="${portraitExportUrl}" 
                     alt="Page ${page.index}" 
                     class="critic-thumb-img"
                     onerror="if(this.src.includes('_PORTRAIT.png')){ this.src='${ukTableExportUrl}'; } else if(this.src.includes('_FULL.png')){ this.src='${panelUrl}'; } else { this.onerror=null; this.src='${fallbackUrl}'; }">
            </div>
            <div class="critic-page-info">
                <span class="critic-page-id">Page ${page.index}</span>
                <span class="critic-page-meta">Chapter ${page.chapterNumber}</span>
            </div>
        `;

        carousel.appendChild(card);
    });
}

function resetUI() {
    carousel.innerHTML = '<div class="text-muted padding-20">Select a volume to view the story timeline.</div>';
    log.innerHTML = '<p class="text-muted italic">Waiting for analysis command...</p>';
    allPages = [];
}

async function runGeminiCritic() {
    log.innerHTML = '<p class="text-accent critic-loading-dots">Gemini is analyzing the volume narrative. Please wait</p>';
    runBtn.disabled = true;

    try {
        const res = await fetch(`/api/critic/analyze/${currentSeries}/${currentVolumeId}`);
        const data = await res.json();

        if (data.ok) {
            // Render the markdown or plain text response
            // For now, assuming data.critique is HTML-safe or simple text
            log.innerHTML = `<div class="critique-content">${formatCritique(data.critique)}</div>`;
        } else {
            log.innerHTML = `<p class="text-danger">Analysis Failed: ${data.message || 'Unknown error'}</p>`;
        }
    } catch (e) {
        console.error(e);
        log.innerHTML = '<p class="text-danger">Failed to connect to the analysis engine.</p>';
    } finally {
        runBtn.disabled = false;
    }
}

function formatCritique(text) {
    // Basic conversion of double asterisks to bold and newlines to paragraphs
    if (!text) return "";
    let html = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
    
    return `<p>${html}</p>`;
}
