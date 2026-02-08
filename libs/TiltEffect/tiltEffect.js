export function initPageTiltEffects() {
  const tiltElements = document.querySelectorAll('.tilt-element');
  const containers = document.querySelectorAll('.tilt-container');

  tiltElements.forEach((tiltElement, i) => {
    const container = containers[i];
    if (!container) return; // skip if not enough containers

    let targetRotateX = 0;
    let targetRotateY = 0;
    let targetShadowX = 0;
    let targetShadowY = 0;

    let currentRotateX = 0;
    let currentRotateY = 0;
    let currentShadowX = 0;
    let currentShadowY = 0;

    container.addEventListener('mousemove', (e) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      targetRotateY = ((x / rect.width) - 0.5) * 4;
      targetRotateX = ((y / rect.height) - 0.5) * -4;

      targetShadowX = ((x / rect.width) - 0.5) * 50;
      targetShadowY = ((y / rect.height) - 0.5) * 50;
    });

    function animate() {
      currentRotateX += (targetRotateX - currentRotateX) * 0.1;
      currentRotateY += (targetRotateY - currentRotateY) * 0.2;
      currentShadowX += (targetShadowX - currentShadowX) * 0.1;
      currentShadowY += (targetShadowY - currentShadowY) * 0.2;

      tiltElement.style.transform = `
        rotateX(${currentRotateX}deg) 
        rotateY(${currentRotateY}deg)
      `;

      // optional: update shadow if _heroVideo exists
    //   if (typeof _heroVideo !== "undefined" && _heroVideo)
    //     _heroVideo.style.boxShadow = `
    //       ${-currentShadowX}px ${currentShadowY}px 40px rgba(0, 0, 0, 0.3)
    //     `;

      requestAnimationFrame(animate);
    }

    animate();

    container.addEventListener('mouseleave', () => {
      targetRotateX = 0;
      targetRotateY = 0;
      targetShadowX = 0;
      targetShadowY = 0;
    });
  });
}
