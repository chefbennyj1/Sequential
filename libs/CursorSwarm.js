import * as THREE from '/three/three.module.js';

/**
 * CursorSwarm - A modular Three.js particle effect that follows the cursor.
 * Features advanced GLSL shader-based coloring and pure circular orbit.
 */
export class CursorSwarm {
    constructor(options = {}) {
        this.particleCount = options.particleCount || 500;
        this.particleSize = options.particleSize || 3.5;
        this.orbitRadius = options.orbitRadius || 40;
        this.innerHole = options.innerHole || 0.5; // Multiplier for the center hole
        this.thickness = options.thickness || 1.0; // Multiplier for the ring width
        this.followSpeed = options.followSpeed || 0.05;
        this.orbitSpeed = options.orbitSpeed || 0.015;
        
        this.mouse = new THREE.Vector3(0, 0, 0);
        this.prevMouse = new THREE.Vector3(0, 0, 0);
        this.mouseVelocity = new THREE.Vector3(0, 0, 0);
        this.targetMouse = new THREE.Vector2(0, 0);
        
        this.targetElement = null;
        this.centerPoint = new THREE.Vector3(0, 0, 0);
        this.explosionTimer = 0;
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.particles = null;
        this.particleData = [];
        
        this.startTime = Date.now();
        this.init();
    }

    setTarget(element) {
        this.targetElement = element;
    }

    clearTarget() {
        this.targetElement = null;
    }

    updateCenterPoint() {
        if (!this.targetElement) {
            // If no target, drift slowly or stay centered
            this.centerPoint.lerp(new THREE.Vector3(0, 0, 0), 0.05);
            return;
        }

        const rect = this.targetElement.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        // Convert DOM screen coords to Three.js world coords
        const vector = new THREE.Vector3(
            (centerX / window.innerWidth) * 2 - 1,
            -(centerY / window.innerHeight) * 2 + 1,
            0.5
        );
        vector.unproject(this.camera);
        const dir = vector.sub(this.camera.position).normalize();
        const distance = -this.camera.position.z / dir.z;
        const targetWorldPos = this.camera.position.clone().add(dir.multiplyScalar(distance));

        // Strictly follow the target
        this.centerPoint.lerp(targetWorldPos, 0.15);
    }

    init() {
        this.container = document.createElement('div');
        this.container.id = 'cursor-swarm-container';
        this.container.style.position = 'fixed';
        this.container.style.top = '0';
        this.container.style.left = '0';
        this.container.style.width = '100%';
        this.container.style.height = '100%';
        this.container.style.pointerEvents = 'none';
        this.container.style.zIndex = '10000';
        document.body.appendChild(this.container);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 3000);
        this.camera.position.z = 500;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        this.createParticles();
        this.addEventListeners();
        this.animate();
    }

    createParticles() {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.particleCount * 3);
        const ids = new Float32Array(this.particleCount);
        const rnds = new Float32Array(this.particleCount * 3);
        const shapes = new Float32Array(this.particleCount);

        for (let i = 0; i < this.particleCount; i++) {
            // Initial spread
            positions[i * 3] = (Math.random() - 0.5) * 800;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 800;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 100;

            ids[i] = i / this.particleCount;
            
            rnds[i * 3] = Math.random();
            rnds[i * 3 + 1] = Math.random();
            rnds[i * 3 + 2] = Math.random();

            shapes[i] = Math.floor(Math.random() * 3);

            this.particleData.push({
                velocity: new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5),
                orbitOffset: Math.random() * Math.PI * 2,
                orbitRadius: this.orbitRadius * (this.innerHole + Math.random() * this.thickness), 
                orbitSpeed: this.orbitSpeed * (0.7 + Math.random() * 0.6),
                zOffset: (Math.random() - 0.5) * 50 // Adds volumetric depth
            });
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aId', new THREE.BufferAttribute(ids, 1));
        geometry.setAttribute('aRnd', new THREE.BufferAttribute(rnds, 3));
        geometry.setAttribute('aShape', new THREE.BufferAttribute(shapes, 1));

        this.uniforms = {
            uTime: { value: 0.0 },
            uPointSize: { value: this.particleSize * window.devicePixelRatio }
        };

        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            vertexShader: `
                uniform float uTime;
                uniform float uPointSize;
                attribute float aId;
                attribute vec3 aRnd;
                attribute float aShape;
                varying vec3 vColor;

                vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
                    return a + b * cos(6.28318 * (c * t + d));
                }

                vec3 getShapeColor(int shape, float id, vec3 rnd) {
                    if (shape == 0) return palette(id + uTime * 0.05, vec3(0.5, 0.5, 0.6), vec3(0.3, 0.3, 0.4), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.33, 0.67));
                    if (shape == 1) {
                        float h = (id - 0.5) * 60.0; 
                        float rungZone = fract(h * 0.5);
                        if(rungZone < 0.15 && rnd.y > 0.4) return vec3(0.0, 0.9, 0.4);
                        return palette(id * 0.1, vec3(0.2, 0.6, 0.8), vec3(0.1, 0.3, 0.4), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.2, 0.4));
                    }
                    if (shape == 2) {
                        float layer = floor(rnd.z * 3.0); 
                        if (layer == 2.0) return vec3(1.0, 0.0, 0.5); // Pink
                        if (layer == 1.0) return vec3(0.0, 0.5, 1.0); // Blue
                        return vec3(0.5, 0.0, 1.0); // Purple
                    }
                    return vec3(1.0);
                }

                void main() {
                    vColor = getShapeColor(int(aShape), aId, aRnd);
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = uPointSize * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                void main() {
                    float d = distance(gl_PointCoord, vec2(0.5));
                    if (d > 0.5) discard;
                    float strength = 1.0 - (d * 2.0);
                    gl_FragColor = vec4(vColor, strength);
                }
            `
        });

        this.particles = new THREE.Points(geometry, material);
        this.scene.add(this.particles);
    }

    addEventListeners() {
        window.addEventListener('mousedown', () => this.explode());
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.uniforms.uPointSize.value = this.particleSize * window.devicePixelRatio;
        });
    }

    explode() {
        this.explosionTimer = 30;
        for (let i = 0; i < this.particleCount; i++) {
            const positions = this.particles.geometry.attributes.position.array;
            // Explosion origin is now the centerPoint (the target)
            const dir = new THREE.Vector3(
                positions[i * 3] - this.centerPoint.x, 
                positions[i * 3 + 1] - this.centerPoint.y, 
                positions[i * 3 + 2] - this.centerPoint.z
            ).normalize();
            this.particleData[i].velocity.add(dir.multiplyScalar(15 + Math.random() * 10));
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.uniforms.uTime.value = (Date.now() - this.startTime) * 0.001;
        
        this.mouseVelocity.subVectors(this.mouse, this.prevMouse);
        const speed = this.mouseVelocity.length();
        this.prevMouse.copy(this.mouse);

        this.updateCenterPoint();

        const positions = this.particles.geometry.attributes.position.array;
        const time = this.uniforms.uTime.value;

        for (let i = 0; i < this.particleCount; i++) {
            const data = this.particleData[i];
            const currentPos = new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
            
            if (this.explosionTimer > 0) {
                currentPos.add(data.velocity);
                data.velocity.multiplyScalar(0.96);
            } else {
                const angle = time * data.orbitSpeed + data.orbitOffset;
                // Orbit around the centerPoint (either mouse or target)
                const targetOrbitPos = new THREE.Vector3(
                    this.centerPoint.x + Math.cos(angle) * data.orbitRadius,
                    this.centerPoint.y + Math.sin(angle) * data.orbitRadius,
                    this.centerPoint.z + data.zOffset // Use the zOffset for volumetric depth
                );

                if (speed > 2.0) data.velocity.add(this.mouseVelocity.clone().multiplyScalar(Math.random() * 5));
                const steering = targetOrbitPos.clone().sub(currentPos);
                steering.multiplyScalar(this.followSpeed * (1.0 / (data.orbitRadius / this.orbitRadius)));
                data.velocity.add(steering);
                data.velocity.multiplyScalar(speed > 5.0 ? 0.85 : 0.92);
                currentPos.add(data.velocity);
            }
            positions[i * 3] = currentPos.x;
            positions[i * 3 + 1] = currentPos.y;
            positions[i * 3 + 2] = currentPos.z;
        }

        if (this.explosionTimer > 0) this.explosionTimer--;
        this.particles.geometry.attributes.position.needsUpdate = true;
        this.renderer.render(this.scene, this.camera);
    }

    destroy() {
        if (this.container && this.container.parentNode) this.container.parentNode.removeChild(this.container);
        this.scene.clear();
        this.renderer.dispose();
    }
}
