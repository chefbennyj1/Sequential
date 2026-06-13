const fs = require('fs');
const targetFile = 'E:/Sequential Comic Server/views/dashboard/ui-kit/glass-system/glass_components.css';
let css = fs.readFileSync(targetFile, 'utf8');

// Identify the start and end of the MESSY duplicate blocks
// We want to keep ONLY the most modern one we wrote, and remove all others.

const startMarker = '/* --------------------------------------------------------------------------\r\n       6. DYNAMIC BACKGROUND';
const startMarkerAlt = '/* --------------------------------------------------------------------------\n       6. DYNAMIC BACKGROUND';

// Find the very FIRST occurrence of Section 6
let firstIndex = css.indexOf('6. DYNAMIC BACKGROUND');
if (firstIndex !== -1) {
    // Back up to the comment block
    let searchArea = css.substring(0, firstIndex);
    let commentStart = searchArea.lastIndexOf('/* ----');
    
    // Find the very LAST occurrence of Section 7 (where we should stop)
    let section7Index = css.indexOf('7. GLASS UTILITY CLASSES');
    let nextCommentStart = css.lastIndexOf('/* 7.', section7Index);
    
    // The clean version we want
    const cleanDynamicBg = `/* --------------------------------------------------------------------------
       6. DYNAMIC BACKGROUND
       -------------------------------------------------------------------------- */
.scene {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
    background: #0b0e1a;
}

.scene__blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(160px); /* Massive blur to remove circle edges */
    opacity: 0.3;        /* Low opacity for subtle environmental glow */
    animation: blob-drift var(--dur, 20s) ease-in-out infinite alternate;
}

[data-theme="light"] .scene__blob {
    opacity: 0.12;
}

.scene__blob--1 {
    width: 900px;
    height: 900px;
    background: radial-gradient(circle, #5ee7df, #3b82f6);
    top: -300px;
    left: -200px;
    --dur: 25s;
}

.scene__blob--2 {
    width: 800px;
    height: 800px;
    background: radial-gradient(circle, #b490f5, #ec4899);
    bottom: -300px;
    right: -200px;
    --dur: 20s;
    animation-delay: -10s;
}

.scene__blob--3 {
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, #ffd27f, #f7a8c4);
    top: 35%;
    left: 45%;
    --dur: 30s;
    animation-delay: -15s;
}

@keyframes blob-drift {
    0% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(120px, -80px) scale(1.15); }
    66% { transform: translate(-80px, 120px) scale(0.85); }
    100% { transform: translate(60px, 60px) scale(1.05); }
}

`;

    // Replace EVERYTHING between the first sign of Section 6 and the start of Section 7
    css = css.substring(0, commentStart) + cleanDynamicBg + css.substring(nextCommentStart);
}

// Ensure glass--dark is solid enough
css = css.replace('.glass--dark {\n    background: var(--glass-dark-md);\n    border-color: rgba(255, 255, 255, 0.1);\n}', '.glass--dark {\n    background: rgba(10, 12, 25, 0.65);\n    border-color: rgba(255, 255, 255, 0.12);\n}');

fs.writeFileSync(targetFile, css, 'utf8');
console.log('Successfully consolidated Dynamic Background and improved opacity.');
