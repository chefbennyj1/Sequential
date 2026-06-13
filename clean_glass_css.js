const fs = require('fs');
const targetFile = 'E:/Sequential Comic Server/views/dashboard/ui-kit/glass-system/glass_components.css';
let css = fs.readFileSync(targetFile, 'utf8');

// The file has duplicated sections and messy blob definitions.
// I will rewrite it to be clean.

// Remove the duplicated DYNAMIC BACKGROUND sections
css = css.replace(/\/\* --------------------------------------------------------------------------\s+6\. DYNAMIC BACKGROUND[\s\S]*?\/\* --------------------------------------------------------------------------\s+7\. GLASS UTILITY CLASSES/g, '/* 6. DYNAMIC BACKGROUND placeholder */\n\n/* 7. GLASS UTILITY CLASSES');

// Now inject the CLEAN dynamic background section once
const cleanDynamicBg = `/* --------------------------------------------------------------------------
       6. DYNAMIC BACKGROUND
       -------------------------------------------------------------------------- */
.scene {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
}

body.hide-dashboard-blobs .scene {
    display: none !important;
}

.scene__blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.45;
    animation: blob-drift var(--dur, 18s) ease-in-out infinite alternate;
}

[data-theme="light"] .scene__blob {
    opacity: 0.15;
}

.scene__blob--1 {
    width: 700px;
    height: 700px;
    background: radial-gradient(circle, #5ee7df, #3b82f6);
    top: -200px;
    left: -150px;
    --dur: 22s;
}

.scene__blob--2 {
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, #b490f5, #ec4899);
    bottom: -200px;
    right: -100px;
    --dur: 17s;
    animation-delay: -8s;
}

.scene__blob--3 {
    width: 400px;
    height: 400px;
    background: radial-gradient(circle, #ffd27f, #f7a8c4);
    top: 40%;
    left: 50%;
    --dur: 25s;
    animation-delay: -13s;
}

@keyframes blob-drift {
    0% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(60px, -40px) scale(1.08); }
    66% { transform: translate(-40px, 60px) scale(0.94); }
    100% { transform: translate(30px, 30px) scale(1.04); }
}

`;

css = css.replace('/* 6. DYNAMIC BACKGROUND placeholder */', cleanDynamicBg);

// Also fix the glass--dark opacity to be more solid as requested for background masking
css = css.replace('.glass--dark {\n    background: var(--glass-dark-md);\n    border-color: rgba(255, 255, 255, 0.1);\n}', '.glass--dark {\n    background: rgba(0, 0, 0, 0.45);\n    border-color: rgba(255, 255, 255, 0.1);\n}');

fs.writeFileSync(targetFile, css, 'utf8');
console.log('Cleaned and fixed glass_components.css');
