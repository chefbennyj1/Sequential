// views/dashboard/components/PreviewCarousel/PreviewCarousel.js

export function renderPreviewCarousel(pages, carouselElement, currentSeries) {
    carouselElement.innerHTML = '';
    
    if (!pages || pages.length === 0) {
        carouselElement.innerHTML = '<div class="text-muted padding-20">No pages found in this volume.</div>';
        return;
    }

    pages.forEach((page) => {
        const card = document.createElement('div');
        card.className = 'critic-page-card';
        
        // --- THUMBNAIL STRATEGY ---
        const pageNumPadded = String(page.index).padStart(3, '0');
        
        // 1. Primary: High-res Print Export
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

        carouselElement.appendChild(card);
    });
}
