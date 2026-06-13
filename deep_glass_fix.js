const fs = require('fs');
const targetFile = 'E:/Sequential Comic Server/views/dashboard/dashboard.html';
let html = fs.readFileSync(targetFile, 'utf8');

// 1. Fix Edit Page Container - change dark glass to bright glass for light theme
html = html.replace(/<div class="glass glass--dark glass-card margin-b-30">\s*<div class="form-group">\s*<label>Structural Layout<\/label>/g, 
    `<div class="glass glass--bright glass-card margin-b-30">
                        <div class="form-group">
                            <label>Structural Layout</label>`);

// 2. Search and replace any remaining bg-dark/bg-panel/bg-black-10 that might be hardcoded
html = html.replace(/class="([^"]*?)bg-dark([^"]*?)"/g, 'class="$1glass glass--dark glass-card$2"');
html = html.replace(/class="([^"]*?)bg-panel([^"]*?)"/g, 'class="$1glass glass--dark$2"');
html = html.replace(/class="([^"]*?)bg-black-10([^"]*?)"/g, 'class="$1glass glass--dark$2"');

// 3. Ensure all dashboard sections use glass--frosted for light theme
html = html.replace(/class="([^"]*?dashboard-section[^"]*?)"/g, (match, classes) => {
    if (!classes.includes('glass--frosted')) {
        return `class="${classes.replace('glass--dark', '')} glass glass--frosted glass-card"`;
    }
    return match;
});

fs.writeFileSync(targetFile, html, 'utf8');
console.log('Deep glassification and light theme adjustments for edit-page and containers completed');
