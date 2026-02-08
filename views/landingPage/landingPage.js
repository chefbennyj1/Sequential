import { initPageTiltEffects } from '/libs/TiltEffect/tiltEffect.js';
import { imageMaskReveal, preloadMediaAsset } from '/libs/Utility.js';

let _heroImage;
let imagePlaylist = [];
let currentImageIndex = 0;
let slideshowTimeout;
let isSlideshowRunning = false;
let imagesLoaded = false;

export function init(container) {

  console.log(`loading ${container.id}`)

  container.addEventListener('view_visible', () => {

  })
  
  // Listen for the start signal from the loading screen
  container.addEventListener('start-slideshow', () => {
    console.log("LandingPage: Start signal received.");
    isSlideshowRunning = true;
    attemptStartSlideshow();
  });

  //Section 1
  _heroImage = container.querySelector("#hero-image");
  if (!_heroImage) {
      console.error("Hero image element not found");
      return;
  }

  // Initial setup: visible
  _heroImage.style.opacity = 1;

  // Only init effects once on the first load
    if (!_heroImage.dataset.initialized) {
      console.log(`Hero image data initialized.`);
      initPageTiltEffects();
      console.log(`Landing page logic initialized.`)
      loginButton();
      _heroImage.dataset.initialized = "true";
      
      // Fetch playlist
      fetchImagePlaylist();
    }
}

async function fetchImagePlaylist() {
  try {
    const response = await fetch('/api/landing-page/images');
    const data = await response.json();
    
    if (data.ok && data.images && data.images.length > 0) {
      imagePlaylist = data.images;
      // Shuffle the playlist
      for (let i = imagePlaylist.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [imagePlaylist[i], imagePlaylist[j]] = [imagePlaylist[j], imagePlaylist[i]];
      }
      console.log(`Loaded and shuffled ${imagePlaylist.length} images for slideshow.`);
      
      // Load the first image immediately so it's ready behind the loader
      if (imagePlaylist.length > 0) {
        _heroImage.src = `/views/landingPage/images/${imagePlaylist[0]}`;
        currentImageIndex = 0;
      }

      imagesLoaded = true;
      attemptStartSlideshow();
      
    } else {
      console.warn("No images found for landing page slideshow.");
    }
  } catch (error) {
    console.error("Error fetching landing page images:", error);
  }
}

function attemptStartSlideshow() {
    // Only start if User has clicked enter (isSlideshowRunning) AND images are ready
    if (isSlideshowRunning && imagesLoaded) {
        console.log("LandingPage: Starting slideshow timer.");
        scheduleNextImage();
    }
}

function scheduleNextImage() {
    clearTimeout(slideshowTimeout); // Ensure no duplicates
    slideshowTimeout = setTimeout(() => {
        showNextImage();
    }, 10000); // 10 seconds visible time
}

async function showNextImage() {
  if (imagePlaylist.length === 0) return;

  const nextIndex = (currentImageIndex + 1) % imagePlaylist.length;
  const imageFile = imagePlaylist[nextIndex];
  const imageUrl = `/views/landingPage/images/${imageFile}`;

  console.log(`Preparing next image: ${imageFile}`);

  try {
    // Preload the image first to ensure instant swap
    await preloadMediaAsset(imageUrl, 'image');

    // Apply the mask reveal effect
    const gifUrl = "/libs/panel_mask_image.gif";
    
    // Apply mask to the image element
    // We await the reveal to ensure the visual transition finishes before we consider the "slide" complete
    // The mask GIF usually starts "full" or "empty" - assuming it transitions to clear.
    // If we swap the src immediately, the mask should hide the cut.
    _heroImage.src = imageUrl;
    
    await imageMaskReveal([_heroImage], gifUrl, 2000);
    
    // Update index only after successful transition
    currentImageIndex = nextIndex;

    // Schedule next loop only AFTER the transition is done
    scheduleNextImage();

  } catch (err) {
      console.error("Failed to preload next image:", err);
      // Wait a bit before retrying to avoid rapid loops if network is down
      setTimeout(scheduleNextImage, 5000);
  }
}

function loginButton() {
  const btn = document.querySelector('.get-started-btn-hero');
  if (btn) {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = '/library';
    })
  }
}