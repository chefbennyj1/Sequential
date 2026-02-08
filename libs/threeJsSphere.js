import * as THREE from '/three/three.module.js';

export function renderLogoSphere(logoCanvas) {
  // Set fixed pixel dimensions
  const width = 150;
  const height = 150;

  // Scene & camera setup
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  camera.position.z = 3;

  // Renderer setup
  const renderer = new THREE.WebGLRenderer({
    canvas: logoCanvas,
    antialias: true,
    alpha: true,
  });

  renderer.setSize(width, height, false);
  renderer.setPixelRatio(window.devicePixelRatio); // crisp edges on hi-dpi
  renderer.setClearColor(0x000000, 0); // transparent background

  const geometry = new THREE.SphereGeometry(1, 10, 8); // (radius, widthSegments, heightSegments)

  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0.0 }
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
        uniform float time;
        varying vec2 vUv;

      void main() {
        // Generate a smooth color gradient based on UVs and time
        vec3 baseColor = vec3(0.263, 0.784, 1.0);   // Blue
        vec3 wave = vec3(1.0, 1.0, 1.0); // White waves
        vec3 color = baseColor + wave;

        gl_FragColor = vec4(color, 1.0);
      }
   `
  });


  const wireframe = new THREE.LineSegments(geometry, material);

  //wireframe.scale.set(1.01, 1.01, 1.01); // slightly larger so it sits cleanly above faces
  scene.add(wireframe);

  wireframe.rotation.z = THREE.MathUtils.degToRad(45);

  wireframe.scale.set(0.01, 0.01, 0.01);
  const targetScale = 1.1; // normal size
  const growSpeed = 0.01;
  // Animation loop
  function animate() {
    requestAnimationFrame(animate);
    // Rotate wireframe independently
    wireframe.rotation.y -= 0.01;

    // Grow wireframe until it reaches target size
    if (wireframe.scale.x < targetScale) {
      wireframe.scale.x += growSpeed;
      wireframe.scale.y += growSpeed;
      wireframe.scale.z += growSpeed;

      // Clamp to targetScale so it doesn't overshoot
      if (wireframe.scale.x > targetScale) {
        wireframe.scale.set(targetScale, targetScale, targetScale);
        // Convert to PNG            
        // const pngURL = renderer.domElement.toDataURL('image/png');
        // document.getElementById("sphere-logo").src = pngURL; // returns a base64 PNG string
      }
    }
    renderer.render(scene, camera);
  }

  animate();

  //Optional: keep size consistent on resize
  window.addEventListener("resize", () => {
    const newWidth = 250;
    const newHeight = 250;
    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(newWidth, newHeight, false);
  });
}
