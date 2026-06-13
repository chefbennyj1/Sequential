const fs = require('fs');

// 1. Revert the JS logic that hides blobs
const jsFile = 'E:/Sequential Comic Server/views/dashboard/studio/js/EventHandlers.js';
let js = fs.readFileSync(jsFile, 'utf8');
js = js.replace(/if \(targetPage === 'scheduled-tasks'\) \{[\s\S]*?\} else \{[\s\S]*?\}/, '');
fs.writeFileSync(jsFile, js, 'utf8');
console.log('Reverted JS hide-blob logic');

// 2. Fix the background blobs in CSS (More blur, lower opacity, removed duplicates)
const cssFile = 'E:/Sequential Comic Server/views/dashboard/ui-kit/glass-system/glass_components.css';
let css = fs.readFileSync(cssFile, 'utf8');

const softerBlobs = `/* --------------------------------------------------------------------------
       6. DYNAMIC BACKGROUND
       -------------------------------------------------------------------------- */
.scene {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
    background: #0b0e1a; /* Ensure there is a base dark background */
}

body.hide-dashboard-blobs .scene {
    display: none !important;
}

.scene__blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(140px); /* Increased blur from 80px to remove "circle" feel */
    opacity: 0.35;       /* Reduced opacity for a softer look */
    animation: blob-drift var(--dur, 18s) ease-in-out infinite alternate;
}

[data-theme="light"] .scene__blob {
    opacity: 0.15;
}

.scene__blob--1 {
    width: 800px;
    height: 800px;
    background: radial-gradient(circle, #5ee7df, #3b82f6);
    top: -250px;
    left: -200px;
    --dur: 22s;
}

.scene__blob--2 {
    width: 700px;
    height: 700px;
    background: radial-gradient(circle, #b490f5, #ec4899);
    bottom: -250px;
    right: -150px;
    --dur: 17s;
    animation-delay: -8s;
}

.scene__blob--3 {
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, #ffd27f, #f7a8c4);
    top: 30%;
    left: 40%;
    --dur: 25s;
    animation-delay: -13s;
}

@keyframes blob-drift {
    0% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(100px, -60px) scale(1.1); }
    66% { transform: translate(-60px, 100px) scale(0.9); }
    100% { transform: translate(50px, 50px) scale(1.05); }
}`;

// Use a more generic search for the DYNAMIC BACKGROUND section to ensure we hit the target
const startTag = '/* --------------------------------------------------------------------------';
const endTag = '/* --------------------------------------------------------------------------';
const startIndex = css.indexOf('6. DYNAMIC BACKGROUND');
if (startIndex !== -1) {
    const realStart = css.lastIndexOf(startTag, startIndex);
    const nextSection = css.indexOf('7. GLASS UTILITY CLASSES', startIndex);
    if (nextSection !== -1) {
        const realEnd = css.lastIndexOf(endTag, nextSection);
        css = css.substring(0, realStart) + softerBlobs + '\n\n' + css.substring(realEnd);
    }
}

fs.writeFileSync(cssFile, css, 'utf8');
console.log('Softened background blobs in CSS');

// 3. Update main-content and body to be transparent so blobs are visible
const layoutFile = 'E:/Sequential Comic Server/views/dashboard/ui-kit/layout.css';
let layout = fs.readFileSync(layoutFile, 'utf8');
layout = layout.replace(/background: var\(--bg\) !important;/g, 'background: transparent !important;');
fs.writeFileSync(layoutFile, layout, 'utf8');

const baseFile = 'E:/Sequential Comic Server/views/dashboard/ui-kit/base.css';
let base = fs.readFileSync(baseFile, 'utf8');
base = base.replace(/background: var\(--bg\);/g, 'background: transparent;');
fs.writeFileSync(baseFile, base, 'utf8');
console.log('Made dashboard containers transparent for glass effect');

// 4. Update vars.css to use a better dark base color
const varsFile = 'E:/Sequential Comic Server/views/dashboard/ui-kit/vars.css';
let vars = fs.readFileSync(varsFile, 'utf8');
vars = vars.replace('--bg: #303030;', '--bg: transparent;');
fs.writeFileSync(varsFile, vars, 'utf8');
console.log('Updated global variables for glass system');
