const fs = require('fs');
const targetFile = 'E:/Sequential Comic Server/views/dashboard/dashboard.html';
let html = fs.readFileSync(targetFile, 'utf8');

// 1. Update character form to use glass system
html = html.replace(/id="character-form-container" class="character-gov-form hidden"/g, 
    'id="character-form-container" class="character-gov-form glass glass--frosted glass-card hidden"');

// 2. Update gov buttons in character lab to glass buttons
html = html.replace(/class="gov-btn-small/g, 'class="glass glass-btn glass-btn--sm glass-btn--ghost');
html = html.replace(/class="gov-btn-action/g, 'class="glass glass-btn glass-btn--primary');
html = html.replace(/class="gov-btn-cancel/g, 'class="glass glass-btn glass-btn--ghost');

// 3. Update gov-textarea
html = html.replace(/class="gov-textarea/g, 'class="glass-input" style="min-height: 100px;"');

// 4. Update any remaining dark backgrounds
html = html.replace(/class="bg-dark padding-30 border-radius-12 border-dim"/g, 'class="glass glass--dark glass-card"');
html = html.replace(/class="bg-panel padding-25 border-radius-12 border-dim margin-b-30"/g, 'class="glass glass--dark glass-card margin-b-30"');
html = html.replace(/class="bg-select padding-25 border-radius-12 border-bright margin-b-30"/g, 'class="glass glass--bright glass-card margin-b-30"');
html = html.replace(/class="critic-output bg-dark padding-30 border-radius-12 border-dim"/g, 'class="critic-output glass glass--dark glass-card"');

// 5. Ensure sections use glass-card for consistent shadow/hover
html = html.replace(/class="([^"]*?dashboard-section[^"]*?)"/g, (match, classes) => {
    if (!classes.includes('glass')) {
        return `class="${classes} glass glass--frosted glass-card"`;
    }
    return match;
});

fs.writeFileSync(targetFile, html, 'utf8');
console.log('Final glassification of dashboard elements completed');
