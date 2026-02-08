/**
 * services/public/CameraManager.js
 * Centralized GSAP animations for panels and images.
 * Loaded dynamically to avoid blocking main page initialization.
 */

let gsapLoaded = false;

async function ensureGsap() {
    if (window.gsap) return true;
    
    try {
        // Dynamically inject script tags if not present
        if (!document.getElementById('gsap-core')) {
            const script = document.createElement('script');
            script.id = 'gsap-core';
            script.src = '/libs/gsap/gsap.min.js';
            document.head.appendChild(script);
            
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
            });
        }
        return !!window.gsap;
    } catch (e) {
        console.warn("CameraManager: GSAP failed to load dynamically.");
        return false;
    }
}

export async function applyCameraAction(panel, action, overrideDuration = null) {
    if (!panel || !action || action.type === 'none') return;

    const hasGsap = await ensureGsap();
    if (!hasGsap) return;

    const target = (panel.tagName === 'IMG' || panel.tagName === 'VIDEO') 
        ? panel 
        : panel.querySelector('img, video');

    if (!target && action.type !== 'shake') return;

    console.log(`CameraManager: Applying ${action.type}`);

    // Use passed duration if provided, otherwise fallback to action duration or default
    const duration = overrideDuration !== null ? overrideDuration : (action.duration || 1000);

    switch (action.type) {
        case 'shake':
            shake(panel, action.intensity || 1, duration);
            break;
        case 'zoomIn':
            zoomIn(target, action.scale || 1.2, duration);
            break;
        case 'zoomOut':
            zoomOut(target, action.scale || 1.0, duration);
            break;
        case 'kenBurns':
            kenBurns(target, duration);
            break;
        case 'pan':
            pan(target, action.direction || 'right', action.distance || '20%', duration);
            break;
        case 'panLeft':
            pan(target, 'left', action.distance || '20%', duration);
            break;
        case 'panRight':
            pan(target, 'right', action.distance || '20%', duration);
            break;
        case 'cinematicPan':
            cinematicPan(target, action.direction || 'right', action.scale || 1.5, duration);
            break;
        case 'blurToSharpen':
            blurToSharpen(target, action.intensity || 20, duration);
            break;
        case 'breathe':
            breathe(target);
            break;
    }
}

/**
 * Common reset to ensure element is visible and centered/reset after animation
 */
function finalReset(target) {
    if (!target) return;
    gsap.set(target, { 
        clearProps: "all", // Clear GSAP-injected styles
        opacity: 1, 
        scale: 1, 
        x: 0, 
        y: 0, 
        xPercent: 0, 
        yPercent: 0,
        filter: "none"
    });
    if (target.tagName === 'VIDEO') {
        target.currentTime = 0;
    }
}

/**
 * Starts with a blur and animates to clear focus.
 */
function blurToSharpen(target, intensity = 20, durationMs = 3000) {
    const duration = durationMs / 1000;
    // Set initial state
    gsap.set(target, { filter: `blur(${intensity}px)`, opacity: 1 });
    // Animate to clear
    gsap.to(target, {
        filter: "blur(0px)",
        duration: duration,
        ease: "power1.inOut"
    });
}

/**
 * Scales up, pans across the entire overflow.
 * Removed the fade-out logic to keep panel populated.
 */
function cinematicPan(target, direction = 'right', scale = 1.5, durationMs = 10000) {
    const duration = durationMs / 1000;
    const tl = gsap.timeline();

    // 1. Initial Scale (Instant or very fast)
    tl.set(target, { scale: scale, xPercent: 0, yPercent: 0, opacity: 1 });

    // 2. Determine Pan Values based on scale
    const moveAmount = (scale - 1) * 50; 
    let vars = { duration: duration, ease: "linear" };

    if (direction === 'right') {
        tl.set(target, { xPercent: -moveAmount });
        vars.xPercent = moveAmount;
    } else if (direction === 'left') {
        tl.set(target, { xPercent: moveAmount });
        vars.xPercent = -moveAmount;
    } else if (direction === 'up') {
        tl.set(target, { yPercent: -moveAmount });
        vars.yPercent = moveAmount;
    } else if (direction === 'down') {
        tl.set(target, { yPercent: moveAmount });
        vars.yPercent = -moveAmount;
    }

    // 3. Execute Pan
    tl.to(target, vars);
}

function shake(element, intensity = 1, durationMs = 500) {
    const amount = 5 * intensity;
    gsap.to(element, {
        x: `random(-${amount}, ${amount})`,
        y: `random(-${amount}, ${amount})`,
        duration: 0.05,
        repeat: Math.floor(durationMs / 50),
        yoyo: true,
        onComplete: () => gsap.set(element, { x: 0, y: 0 }) // Keep reset for shake only
    });
}

function zoomIn(target, scale = 1.2, durationMs = 1000) {
    const targetScale = parseFloat(scale) || 1.2;
    gsap.fromTo(target, 
        { scale: 1.0 },
        { 
            scale: targetScale, 
            duration: durationMs / 1000, 
            ease: "power2.out"
        }
    );
}

function zoomOut(target, scale = 1.2, durationMs = 1000) {
    // If user provides a scale (e.g. 1.5), we start there and go to 1.0
    const startScale = parseFloat(scale) || 1.2;
    gsap.fromTo(target, 
        { scale: startScale },
        { 
            scale: 1.0, 
            duration: durationMs / 1000, 
            ease: "power2.inOut"
        }
    );
}

function kenBurns(target, durationMs = 5000) {
    gsap.fromTo(target, 
        { scale: 1, xPercent: 0, yPercent: 0, opacity: 1 },
        { 
            scale: 1.15, 
            xPercent: 5, 
            yPercent: 5, 
            duration: durationMs / 1000, 
            ease: "sine.inOut"
        }
    );
}

function pan(target, direction = 'right', distance = '15%', durationMs = 2000) {
    // Ensure numeric distance
    const distVal = parseFloat(distance) || 15;
    
    // Scale logic: We need enough bleed to cover the movement.
    // Bleed per side = (scale - 1) / 2 * 100.
    // We need Bleed > distVal.
    // scale = (distVal * 2 / 100) + 1 + buffer
    const requiredScale = (distVal * 2 / 100) + 1.05; 
    const safeScale = Math.max(requiredScale, 1.2);

    const duration = durationMs / 1000;
    const tl = gsap.timeline();

    // 1. Set Initial Scale
    tl.set(target, { scale: safeScale, opacity: 1, xPercent: 0, yPercent: 0 });

    let startVars = {};
    let endVars = { duration: duration, ease: "power1.inOut" };

    if (direction === 'up') {
        // Camera Up -> Content Down (Start high, move low)
        startVars.yPercent = -distVal; 
        endVars.yPercent = distVal;
    } else if (direction === 'down') {
        // Camera Down -> Content Up (Start low, move high)
        startVars.yPercent = distVal; 
        endVars.yPercent = -distVal;
    } else if (direction === 'left') {
        // Camera Left -> Content Right
        startVars.xPercent = -distVal; 
        endVars.xPercent = distVal;
    } else { // right
        // Camera Right -> Content Left
        startVars.xPercent = distVal; 
        endVars.xPercent = -distVal;
    }

    tl.fromTo(target, startVars, endVars);
}

function breathe(target) {
    gsap.to(target, { scale: 1.03, duration: 3, repeat: -1, yoyo: true, ease: "sine.inOut" });
}

export async function resetCamera(panel) {
    if (!window.gsap) return;
    const target = (panel.tagName === 'IMG' || panel.tagName === 'VIDEO') 
        ? panel 
        : panel.querySelector('img, video');
    
    if (target) {
        gsap.killTweensOf(target);
        finalReset(target);
    }
    gsap.killTweensOf(panel);
    gsap.set(panel, { x: 0, y: 0 });
}
