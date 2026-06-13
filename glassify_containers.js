const fs = require('fs');
const targetFile = 'E:/Sequential Comic Server/views/dashboard/dashboard.html';
let html = fs.readFileSync(targetFile, 'utf8');

// 1. Update global-settings-form-container
html = html.replace(/id="global-settings-form-container"\s*class="bg-dark padding-30 border-radius-12 border-dim"/g, 
    'id="global-settings-form-container" class="glass glass--dark glass-card"');

// 2. Update volume-metadata-form (if it exists with bg-dark)
html = html.replace(/class="bg-dark padding-30 border-radius-12 border-dim"/g, 
    'class="glass glass--dark glass-card"');

// 3. Update any remaining plain containers
html = html.replace(/class="bg-dark padding-20 border-radius-12 border-dim"/g, 
    'class="glass glass--dark glass-card"');

fs.writeFileSync(targetFile, html, 'utf8');
console.log('Migrated remaining dark containers to glass system');
