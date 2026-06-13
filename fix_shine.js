const fs = require('fs');
const targetFile = 'E:/Sequential Comic Server/views/dashboard/ui-kit/glass-system/glass_components.css';
let css = fs.readFileSync(targetFile, 'utf8');

// 1. Reduce reflection opacity in Light Mode
// Original: rgba(255, 255, 255, 0.65) -> New: rgba(255, 255, 255, 0.25)
css = css.replace(/--reflection-top:\s*linear-gradient\(135deg,\s*rgba\(255,\s*255,\s*255,\s*0\.65\)\s*0%,\s*rgba\(255,\s*255,\s*255,\s*0\)\s*50%\);/g, 
    '--reflection-top: linear-gradient(135deg, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0) 50%);');

// 2. Reduce reflection opacity in Dark Mode (Global root)
// Original: rgba(255, 255, 255, 0.4) -> New: rgba(255, 255, 255, 0.15)
css = css.replace(/--reflection-top:\s*linear-gradient\(135deg,\s*rgba\(255,\s*255,\s*255,\s*0\.4\)\s*0%,\s*rgba\(255,\s*255,\s*255,\s*0\)\s*50%\);/g, 
    '--reflection-top: linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0) 50%);');

// 3. Fix the layering issue. 
// The shine is currently at z-index: 1 inside .glass and .glass-btn.
// We need to move it UNDER the content. 
// Standard .glass children should have a relative position or higher z-index, 
// OR we move the shine to z-index: -1.

// Let's set the shine to -1 so it's always behind children
css = css.replace('z-index: 1;\n    border-radius: inherit;', 'z-index: -1;\n    border-radius: inherit;');
// Also for buttons
css = css.replace('.glass-btn::before {\n    content: "";\n    position: absolute;\n    inset: 0;\n    border-radius: inherit;\n    background: var(--reflection-top);\n    pointer-events: none;\n}', 
    '.glass-btn::before {\n    content: "";\n    position: absolute;\n    inset: 0;\n    border-radius: inherit;\n    background: var(--reflection-top);\n    pointer-events: none;\n    z-index: -1;\n}');

// Ensure content area doesn't have an overflow issue with negative z-index
css = css.replace('.glass {\n    backdrop-filter: var(--blur-md);\n    -webkit-backdrop-filter: var(--blur-md);\n    background: var(--glass-white);\n    border: 1px solid var(--glass-border);\n    box-shadow: var(--shadow-glass);\n    position: relative;\n    overflow: hidden;\n}', 
    '.glass {\n    backdrop-filter: var(--blur-md);\n    -webkit-backdrop-filter: var(--blur-md);\n    background: var(--glass-white);\n    border: 1px solid var(--glass-border);\n    box-shadow: var(--shadow-glass);\n    position: relative;\n    overflow: hidden;\n    z-index: 1;\n}');

fs.writeFileSync(targetFile, css, 'utf8');
console.log('Fixed glass shine opacity and layering');
