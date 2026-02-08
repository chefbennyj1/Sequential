import * as THREE from 'three';

// Utility to create a random point on a sphere
function randomSpherePoint(radius) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);
    return [x, y, z];
}

export function init(container) {
    if (!container) {
        console.error("CRT Sphere: container not provided.");
        return;
    }

    let scene, renderer, camera, animationFrameId;

    const initializeSphere = () => {
        // Create scene
        scene = new THREE.Scene();
        scene.background = null; // Transparent background

        // Create camera
        camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 2000);
        camera.position.z = 650;

        // Create renderer
        try {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            renderer.setSize(container.clientWidth, container.clientHeight);
            renderer.setPixelRatio(window.devicePixelRatio);
            container.appendChild(renderer.domElement);
        } catch (error) {
            console.error('WebGL renderer creation failed:', error);
            return;
        }

        // Define sphere radius
        const radius = 320;

        // Create nodes
        const names = [];
        const colors = ['#4ecdc4', '#ff6b6b', '#ffd93d'];

        for (let i = 0; i < 40; i++) {
            names.push({
                name: `Node${i}`,
                color: colors[Math.floor(Math.random() * colors.length)],
                position: randomSpherePoint(radius)
            });
        }

        const dotGeometry = new THREE.SphereGeometry(3.5, 16, 16);
        const dotMaterials = {
            '#4ecdc4': new THREE.MeshBasicMaterial({ color: 0x4ecdc4 }),
            '#ff6b6b': new THREE.MeshBasicMaterial({ color: 0xff6b6b }),
            '#ffd93d': new THREE.MeshBasicMaterial({ color: 0xffd93d })
        };

        names.forEach((node) => {
            const material = dotMaterials[node.color];
            const dot = new THREE.Mesh(dotGeometry, material);
            dot.position.set(...node.position);
            scene.add(dot);
        });

        // Connect nodes
        const maxConnections = 5;
        const maxDistance = radius * 1.5;

        names.forEach((node, index) => {
            const distances = names.map((otherNode, otherIndex) => {
                if (index === otherIndex) return { index: otherIndex, distance: Infinity };
                const dx = node.position[0] - otherNode.position[0];
                const dy = node.position[1] - otherNode.position[1];
                const dz = node.position[2] - otherNode.position[2];
                return { index: otherIndex, distance: Math.sqrt(dx * dx + dy * dy + dz * dz) };
            });

            distances.sort((a, b) => a.distance - b.distance);
            const connectCount = Math.floor(Math.random() * maxConnections) + 1;

            for (let i = 0; i < connectCount && i < distances.length; i++) {
                if (distances[i].distance > maxDistance) continue;
                if (distances[i].index > index) {
                    const otherNode = names[distances[i].index];
                    const points = [];
                    const startPos = new THREE.Vector3(...node.position).normalize();
                    const endPos = new THREE.Vector3(...otherNode.position).normalize();
                    const segments = 12;

                    for (let j = 0; j <= segments; j++) {
                        const t = j / segments;
                        const interpVec = new THREE.Vector3().copy(startPos).lerp(endPos, t).normalize();
                        const pointOnSphere = interpVec.multiplyScalar(radius);
                        points.push(pointOnSphere);
                    }

                    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
                    const opacity = Math.max(0.25, 0.45 - (distances[i].distance / maxDistance) * 0.2);
                    const lineMaterial = new THREE.LineBasicMaterial({
                        color: 0xadd8e6,
                        transparent: true,
                        opacity: opacity
                    });
                    const line = new THREE.Line(lineGeometry, lineMaterial);
                    scene.add(line);
                }
            }
        });

        const rotationSpeed = 0.0005;
        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            scene.rotation.y += rotationSpeed;
            scene.rotation.x += rotationSpeed / 2;
            renderer.render(scene, camera);
        };
        animate();
    };

    const handleResize = () => {
        if (!camera || !renderer) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    };

    initializeSphere();
    window.addEventListener('resize', handleResize);

    // Return a cleanup function
    return () => {
        window.removeEventListener('resize', handleResize);
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        if (scene) scene.clear();
        if (renderer) renderer.dispose();
    };
}
