export function init() {
  console.log('Login page script initialized.');

  const signUpButton = document.querySelector('.sign--up');
  const signInButton = document.querySelector('.sign--in');
  const loginFormContainer = document.querySelector('.login-form-container');
  const registerFormContainer = document.querySelector('.register-form-container');
  const backButton = document.querySelector('.back-btn'); // Get the back button

  // const video = document.getElementById('bg-video-1');
  // const fadeDuration = 0.5; // The duration of the fade in seconds

  // video.addEventListener('timeupdate', () => {
  //   if (video.duration - video.currentTime <= fadeDuration) {
  //     video.classList.add('fade-out');
  //     video.classList.remove('fade-in');
  //   }
  // });

  // video.addEventListener('seeked', () => {
  //   if (video.currentTime < fadeDuration) {
  //     video.classList.remove('fade-out');
  //     video.classList.add('fade-in');
  //   }
  // });


  //Background image cross-fade logic
  // const bgImages = [
  //     "url('/views/login/background.png')",
  //     "url('/views/login/background_2.png')",
  //     "url('/views/login/background_3.png')"
  // ];
  // let currentImageIndex = 0;
  // const bgImg1 = document.getElementById('bg-img-1');
  // const bgImg2 = document.getElementById('bg-img-2');
  // let isBg1Active = true;

  // // Initial setup
  // bgImg1.style.backgroundImage = bgImages[currentImageIndex];
  // bgImg1.style.opacity = 1;
  // bgImg2.style.opacity = 0;

  // setInterval(() => {
  //     currentImageIndex = (currentImageIndex + 1) % bgImages.length;

  //     if (isBg1Active) {
  //         // Fade out bg1, fade in bg2
  //         bgImg2.style.backgroundImage = bgImages[currentImageIndex];
  //         bgImg1.style.opacity = 0;
  //         bgImg2.style.opacity = 1;
  //     } else {
  //         // Fade out bg2, fade in bg1
  //         bgImg1.style.backgroundImage = bgImages[currentImageIndex];
  //         bgImg2.style.opacity = 0;
  //         bgImg1.style.opacity = 1;
  //     }

  //     isBg1Active = !isBg1Active;

  // }, 8000);


  if (signUpButton && loginFormContainer && registerFormContainer) {
    signUpButton.addEventListener('click', () => {
      loginFormContainer.classList.remove('active');
      loginFormContainer.classList.add('hidden');
      registerFormContainer.classList.remove('hidden');
      registerFormContainer.classList.add('active');

      setTimeout(() => {
        const firstRegisterInput = registerFormContainer.querySelector('#username');
        if (firstRegisterInput) {
          firstRegisterInput.focus();
        }
      }, 0);
    });
  }

  if (signInButton && loginFormContainer && registerFormContainer) {
    signInButton.addEventListener('click', () => {
      registerFormContainer.classList.remove('active');
      registerFormContainer.classList.add('hidden');
      loginFormContainer.classList.remove('hidden');
      loginFormContainer.classList.add('active');

      setTimeout(() => {
        const firstLoginInput = loginFormContainer.querySelector('#login__email');
        if (firstLoginInput) {
          firstLoginInput.focus();
        }
      }, 0);
    });
  }

  // Add event listener for the back button
  if (backButton) {
    backButton.addEventListener('click', () => {
      window.location.href = '/'; // Navigate to the landing page
    });
  }

  // --- Modal Logic ---
  const errorModal = document.getElementById('errorModal');
  const modalMessage = document.getElementById('modalMessage');
  const closeModalBtn = document.querySelector('.close-modal-btn');

  const showErrorModal = (message) => {
    if (modalMessage) modalMessage.textContent = message;
    if (errorModal) errorModal.classList.add('active');
  };

  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      if (errorModal) errorModal.classList.remove('active');
    });
  }

  // --- Login Form Fetch handling ---
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const formData = new FormData(loginForm);
      const data = Object.fromEntries(formData.entries());

      try {
        const response = await fetch(loginForm.action, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok && result.redirect) {
          window.location.href = result.redirect;
        } else if (response.status === 429) {
          // Rate limit hit!
          showErrorModal(result.message || "Too many attempts. Locked out.");
        } else {
          // Other error (401 invalid creds, etc)
          showErrorModal(result.message || "Login failed.");
        }
      } catch (err) {
        console.error("Fetch error:", err);
        showErrorModal("An unexpected error occurred.");
      }
    });
  }

  // Initial state: login form visible, register form hidden if it's not already
  if (!loginFormContainer.classList.contains('active') && !registerFormContainer.classList.contains('active')) {
    loginFormContainer.classList.add('active');
    registerFormContainer.classList.add('hidden');
  }
}