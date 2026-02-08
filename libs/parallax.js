
export function initParallaxEffects() {
  const parallaxItems = document.querySelectorAll('[data-parallax]');

  window.addEventListener('mousemove', (e) => {
    const { innerWidth: w, innerHeight: h } = window;
    const x = (e.clientX - w / 2) / w;
    const y = (e.clientY - h / 2) / h;

    parallaxItems.forEach((item) => {
      const depth = parseFloat(item.dataset.parallax) || 20; // px shift depth
      const moveX = -x * depth;
      const moveY = -y * depth;

      // Smoothly interpolate the transform
      gsap.to(item, {
        x: moveX,
        y: moveY,
        duration: 5.6,
        ease: "power2.out",
      });
    });
  });
}

