import * as THREE from '/three/three.module.js';

    const canvas = document.getElementById("three-canvas");
    const _heroVideo = document.getElementById("hero-video");
    export const scene = new THREE.Scene();
    export const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 3;
    //camera.near = 0.01;
    camera.updateProjectionMatrix();
    export const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true, // <-- allow transparency
    });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0); // <-- transparent background

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;


export const videoCube = (() => {
    const geometry = new THREE.BoxGeometry(1.43, 0.9, 0.1);
    updateVideoUVs(geometry, 1.08, 0, 0); // zoom=1.2, offset slightly right and up
    const videoTexture = new THREE.VideoTexture(_heroVideo);
    videoTexture.encoding = THREE.sRGBEncoding;
    renderer.outputEncoding = THREE.sRGBEncoding;
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.format = THREE.RGBAFormat;
    const videoMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tVideo: { value: videoTexture },
        brightness: { value: 1.05 },
        contrast: { value: 1.05 },
        saturation: { value: 1.1 }
      },
      vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
      fragmentShader: `
    uniform sampler2D tVideo;
    uniform float brightness;
    uniform float contrast;
    uniform float saturation;
    varying vec2 vUv;

    vec3 adjustSaturation(vec3 color, float s) {
      float l = dot(color, vec3(0.299, 0.587, 0.114));
      return mix(vec3(l), color, s);
    }

    void main() {
      vec4 tex = texture2D(tVideo, vUv);
      vec3 color = tex.rgb;
      color = (color - 0.5) * contrast + 0.5;
      color = color * brightness;
      color = adjustSaturation(color, saturation);
      gl_FragColor = vec4(color, tex.a);
    }
  `
    });
    const c = new THREE.Mesh(geometry, videoMaterial);
    updateCubeScale(c, camera);
    scene.add(c);
    return c;
})();



  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    updateCubeScale(videoCube, camera, _heroVideo);
  });

  

function updateVideoUVs(geometry, zoom = 1, offsetX = 0, offsetY = 0) {
  const uvs = geometry.attributes.uv.array;

  for (let i = 0; i < uvs.length; i += 2) {
    let u = uvs[i];
    let v = uvs[i + 1];

    // Center UV and scale (zoom)
    u = 0.5 + (u - 0.5) / zoom;
    v = 0.5 + (v - 0.5) / zoom;

    // Apply offsets
    u += offsetX;
    v += offsetY;

    uvs[i] = u;
    uvs[i + 1] = v;
  }

  geometry.attributes.uv.needsUpdate = true;
}

function updateCubeScale(cube, camera) {
  const fov = camera.fov * (Math.PI / 180); // vertical fov in radians
  const heightAtZ = 2 * Math.tan(fov / 2) * camera.position.z;
  const widthAtZ = heightAtZ * camera.aspect;

  const targetHeight = heightAtZ * 0.69; // 75% of viewport height
  const targetWidth = widthAtZ * 0.72;   // 75% of viewport width

  // Geometry is 1.6 (w) x 0.9 (h)
  const scaleX = targetWidth / 1.6;
  const scaleY = targetHeight / 0.9;
  const scaleZ = (scaleX + scaleY) / 2; // proportional depth

  cube.scale.set(scaleX, scaleY, scaleZ);

  // Center cube
  cube.position.set(0, -0.15, 0);
}

