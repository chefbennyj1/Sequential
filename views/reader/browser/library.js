/**
 * Sequential Comic Server - Library Browser
 * Simplified Grid Layout (Emby/Plex Style)
 */

import { initPageTiltEffects } from '/libs/TiltEffect/tiltEffect.js';

let libraryData = [];
let gridContainer;

export async function init(container) {
    console.log("[LIBRARY] Initializing Collection Grid...");

    gridContainer = container.querySelector('#libraryGrid');
    if (!gridContainer) {
        console.error("[LIBRARY] Grid container not found!");
        return;
    }

    // 1. Fetch Data
    await fetchLibraryData();

    // 2. Render
    renderGrid();

    // 3. Optional: Subtle 3D Tilt on the new cards
    setTimeout(() => {
        initPageTiltEffects();
    }, 500);
}

/**
 * Fetch series data from the server
 */
async function fetchLibraryData() {
    try {
        const res = await fetch('/api/landing-page/library');
        const data = await res.json();
        if (data.ok) {
            libraryData = data.library;
            console.log(`[LIBRARY] Loaded ${libraryData.length} series.`);
        }
    } catch (e) {
        console.error("[LIBRARY] Failed to load collection:", e);
    }
}

/**
 * Render the series cards into the responsive grid
 */
function renderGrid() {
    if (!libraryData.length) {
        gridContainer.innerHTML = '<div class="text-muted padding-20">Your collection is empty.</div>';
        return;
    }

    gridContainer.innerHTML = '';
    const template = document.getElementById('library-item-template');

    libraryData.forEach((series) => {
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector('.library-card');

        // Cover Art
        const coverImg = clone.querySelector('.cover-image');
        coverImg.src = series.coverImage || '/views/public/images/folder.png';

        // Title & Description
        const titleEl = clone.querySelector('.series-title');
        titleEl.textContent = series.title;
        
        // Hide overlay title ONLY if using a custom cover (consistent with previous logic)
        const isFallback = (series.coverImage || '').includes('public/images/folder.png');
        if (!isFallback && series.coverImage) {
            titleEl.style.display = 'none';
        }

        clone.querySelector('.series-description').textContent = series.description || "No description available.";

        // Link to the Series Detail Page
        const btn = clone.querySelector('.read-now-btn');
        if (series._id) {
            btn.href = `/library/series/${series._id}`;
            // Also make the whole card clickable for that Emby feel
            card.addEventListener('click', () => {
                window.location.href = `/library/series/${series._id}`;
            });
        } else {
            btn.href = '#';
            btn.textContent = "COMING SOON";
            btn.style.opacity = 0.5;
        }

        gridContainer.appendChild(clone);
    });
}
