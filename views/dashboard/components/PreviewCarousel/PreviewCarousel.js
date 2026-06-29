export function renderPreviewCarousel(pages, carouselElement, currentSeries) {
    carouselElement.innerHTML = '';

    if (!pages || pages.length === 0) {
        carouselElement.innerHTML = '<div class="text-muted padding-20">No pages found in this volume.</div>';
        return;
    }

    const ts = Date.now();

    pages.forEach((page) => {
        const card = document.createElement('div');
        card.className = 'critic-page-card';

        const pageNumPadded = String(page.index).padStart(3, '0');

        const portraitUrl = `/Library/${currentSeries}/Print_Exports/${page.volumeFolder}_Book_Pages/us-portrait/page${pageNumPadded}_PORTRAIT.png?t=${ts}`;
        const ukTableUrl  = `/Library/${currentSeries}/Print_Exports/${page.volumeFolder}_Book_Pages/uk-table/page${pageNumPadded}_FULL.png?t=${ts}`;

        let panelUrl = '/views/public/images/page-placeholder.png';
        const media = Array.isArray(page.mediaData) ? page.mediaData : (page.mediaData?.media || []);
        if (media.length > 0) {
            const firstPanel = media[0];
            const fileName = firstPanel.url || firstPanel.fileName;
            if (fileName) {
                const chapterFolder = `chapter-${page.chapterNumber}`;
                panelUrl = `/Library/${currentSeries}/${page.volumeFolder}/${chapterFolder}/page${page.index}/assets/image/${fileName}?t=${ts}`;
            }
        }

        const fallbacks = [ukTableUrl, panelUrl, '/views/public/images/page-placeholder.png'];
        let fallbackIndex = 0;

        const img = document.createElement('img');
        img.src = portraitUrl;
        img.alt = `Page ${page.index}`;
        img.className = 'critic-thumb-img';
        img.addEventListener('error', function onErr() {
            if (fallbackIndex < fallbacks.length) {
                img.src = fallbacks[fallbackIndex++];
            } else {
                img.removeEventListener('error', onErr);
            }
        });

        const thumb = document.createElement('div');
        thumb.className = 'critic-page-thumb';
        thumb.appendChild(img);

        const info = document.createElement('div');
        info.className = 'critic-page-info';

        const pageId = document.createElement('span');
        pageId.className = 'critic-page-id';
        pageId.textContent = `Page ${page.index}`;

        const pageMeta = document.createElement('span');
        pageMeta.className = 'critic-page-meta';
        pageMeta.textContent = `Chapter ${page.chapterNumber}`;

        info.appendChild(pageId);
        info.appendChild(pageMeta);
        card.appendChild(thumb);
        card.appendChild(info);
        carouselElement.appendChild(card);
    });
}
