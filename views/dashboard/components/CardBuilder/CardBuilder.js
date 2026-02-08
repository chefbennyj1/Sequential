export function renderSeriesCard({title, imgUrl, _id}) {
    return `
    <div class="series-card" id="${_id}">
        <img src="${imgUrl}" alt="${title}">
        <div class="series-banner">SERIES</div>
        <div class="series-info">
            <h3>${title.toUpperCase()}</h3>
        </div>
    </div>
    `;
}

export function renderCard({index, title, imgUrl, _id, seriesTitle = "NO://OVERFLOW"}) { 
    return  `
    <div class="volume-card" id="${_id}">
    <img src="${imgUrl}" alt="Volume ${index}">
    <div class="volume-banner">VOLUME ${index}</div>
    <div class="volume-info">
    <h3>${seriesTitle.toUpperCase()}: ${title.toUpperCase()}</h3>
    </div>
    </div>   
   `; 
}

export function renderChapterCard({ title, chapterNumber, pages, volumeId }) {
    const firstPageIndex = pages.length > 0 ? pages[0].index : 'N/A';
    const lastPageIndex = pages.length > 0 ? pages[pages.length - 1].index : 'N/A';

    return `
    <div class="chapter-card" data-volume-id="${volumeId}" data-chapter-number="${chapterNumber}">
        <div class="chapter-info">
            <h3>${title || `Chapter ${chapterNumber}`}</h3>
            <p>Pages: ${firstPageIndex} - ${lastPageIndex}</p>
        </div>
    </div>
    `;
}