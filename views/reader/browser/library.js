import { initPageTiltEffects } from '/libs/TiltEffect/tiltEffect.js';
import { imageMaskReveal, preloadMediaAsset } from '/libs/Utility.js';

let libraryData = [];
let currentSlideIndex = 0;
let slideshowTimeout;
let isSlideshowRunning = false;
let track, slides, prevBtn, nextBtn;

// DOM Elements
let currentActiveImageEl = null;

export async function init(container) {
    console.log("Initializing Library Carousel...");

    track = container.querySelector('#libraryTrack');
    prevBtn = container.querySelector('#prevBtn');
    nextBtn = container.querySelector('#nextBtn');

    // Fetch Data
    await fetchLibraryDataLocal();

    // Render Carousel
    renderCarousel();

    // Init Events
    prevBtn.addEventListener('click', () => moveCarousel(-1));
    nextBtn.addEventListener('click', () => moveCarousel(1));

    // Keyboard Nav
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') moveCarousel(-1);
        if (e.key === 'ArrowRight') moveCarousel(1);
    });

    // Start signal (from loading screen)
    // For library view, we start immediately since there's no "Access Granted" intro
    isSlideshowRunning = true;
    startActiveSlideRotation();

    // Handle Window Resize for Centering
    window.addEventListener('resize', updateCarouselPosition);

    // Force a position recalculation after the layout has painted and CSS is applied
    setTimeout(updateCarouselPosition, 100);
    setTimeout(updateCarouselPosition, 500);
}

async function fetchLibraryDataLocal() {
    try {
        const res = await fetch('/api/landing-page/library');
        const data = await res.json();
        if (data.ok) {
            libraryData = data.library;
            console.log(`Loaded ${libraryData.length} series.`);
        }
    } catch (e) {
        console.error("Failed to load library data", e);
    }
}

function renderCarousel() {
    if (!libraryData.length) return;

    const template = document.getElementById('library-item-template');

    libraryData.forEach((series, index) => {
        const clone = template.content.cloneNode(true);
        const slide = clone.querySelector('.carousel-slide');

        // Populate Data
        const titleEl = slide.querySelector('.series-title');
        titleEl.textContent = series.title;
        titleEl.title = series.title; // For glitch attr
        titleEl.classList.remove('glitch-text'); // Remove legacy class
        
        slide.querySelector('.series-description').textContent = series.description || "No description available.";

        const coverImageEl = slide.querySelector('.cover-image');
        coverImageEl.src = series.coverImage;
        
        // Hide title if we have a real cover image (not the default fallback folder.png)
        if (series.coverImage && !series.coverImage.endsWith('folder.png')) {
             titleEl.style.display = 'none';
        }

        // Button Link
        const btn = slide.querySelector('.get-started-btn-hero');

        // Link to the Series Detail Page
        if (series._id) {
            btn.href = `/library/series/${series._id}`;
        } else {
            // Fallback
            btn.href = '#';
            btn.textContent = "COMING SOON";
            btn.style.opacity = 0.5;
            btn.style.cursor = "default";
        }
        // Store images data on the element for easy access        slide.dataset.images = JSON.stringify(series.images || []);
        slide.dataset.index = index;

        track.appendChild(slide);
    });

    slides = Array.from(track.children);

    // Set Initial Positions
    updateCarouselPosition();

    // Init Tilt on all (or just active? All is fine if optimized)
    initPageTiltEffects(); // Ensure this lib handles multiple targets if designed so, or manually attach.
    // The utility likely attaches to .tilt-effect or similar. My CSS doesn't have tilt classes yet. 
    // I'll skip tilt for now to ensure basic carousel works, or check utility later.
}

function moveCarousel(direction) {
    const newIndex = currentSlideIndex + direction;

    if (newIndex < 0 || newIndex >= slides.length) return; // distinct stop at ends

    // Stop old slide
    stopActiveSlideRotation();

    currentSlideIndex = newIndex;
    updateCarouselPosition();

    // Start new slide (delay slightly for transition)
    if (isSlideshowRunning) {
        setTimeout(startActiveSlideRotation, 600);
    }
}

function updateCarouselPosition() {
    if (!slides || !slides.length) return;

    // Remove active class from all
    slides.forEach(s => s.classList.remove('active-slide'));

    // Add active to current
    const activeSlide = slides[currentSlideIndex];
    activeSlide.classList.add('active-slide');

    // Calculate Center
    // Use offsetWidth to get the layout width. Fallback if hidden/loading.
    let slideWidth = activeSlide.offsetWidth;
    if (slideWidth === 0) {
        slideWidth = window.innerWidth * (window.innerWidth <= 1024 ? 0.85 : 0.65);
    }
    const gap = 40; // matches CSS gap

    // Formula: Center the Active Slide
    // Start track at exact center of the screen
    track.style.left = '50%';

    // Distance from track's left edge to the center of the active slide
    const slideCenterRel = (currentSlideIndex * (slideWidth + gap)) + (slideWidth / 2);

    // Shift track left so the active slide's center aligns with the screen center
    track.style.transform = `translate(-${slideCenterRel}px, -50%)`;

    // Update Button States
    prevBtn.style.opacity = currentSlideIndex === 0 ? 0.3 : 1;
    prevBtn.style.pointerEvents = currentSlideIndex === 0 ? 'none' : 'all';

    nextBtn.style.opacity = currentSlideIndex === slides.length - 1 ? 0.3 : 1;
    nextBtn.style.pointerEvents = currentSlideIndex === slides.length - 1 ? 'none' : 'all';
}

// --- SLIDESHOW LOGIC ---

let currentImageIndex = 0;

function stopActiveSlideRotation() {
    clearTimeout(slideshowTimeout);
    if (currentActiveImageEl) {
        currentActiveImageEl.style.opacity = 0;
        // Optional: Reset src after fade out
        setTimeout(() => {
            if (currentActiveImageEl) currentActiveImageEl.src = "";
        }, 1000);
    }
}

async function startActiveSlideRotation() {
    clearTimeout(slideshowTimeout);

    const slide = slides[currentSlideIndex];
    const images = JSON.parse(slide.dataset.images || "[]");
    currentActiveImageEl = slide.querySelector('.active-image');

    if (images.length === 0) return;

    // Randomize start?
    currentImageIndex = 0; // or Math.floor(Math.random() * images.length);

    rotateImage(images);
}

async function rotateImage(images) {
    if (!isSlideshowRunning) return;

    const imgUrl = images[currentImageIndex];
    console.log(`Rotating to: ${imgUrl}`);

    try {
        await preloadMediaAsset(imgUrl, 'image');

        // Set src
        currentActiveImageEl.src = imgUrl;

        // Reveal
        currentActiveImageEl.style.opacity = 1;

        // If using mask reveal (cool effect)
        // await imageMaskReveal([currentActiveImageEl], "/libs/panel_mask_image.gif", 1500);

        // Schedule Next
        slideshowTimeout = setTimeout(async () => {
            // Fade out first?
            // currentActiveImageEl.style.opacity = 0;
            // await new Promise(r => setTimeout(r, 1000));

            currentImageIndex = (currentImageIndex + 1) % images.length;
            rotateImage(images);
        }, 8000); // 8 seconds per image

    } catch (err) {
        console.warn("Failed to load carousel image", err);
        // Skip to next
        currentImageIndex = (currentImageIndex + 1) % images.length;
        slideshowTimeout = setTimeout(() => rotateImage(images), 2000);
    }
}
