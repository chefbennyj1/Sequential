const fs = require('fs');
const targetFile = 'E:/Sequential Comic Server/views/dashboard/dashboard.html';
let html = fs.readFileSync(targetFile, 'utf8');

// 1. Task Panels
html = html.split('<div class="task-panel">').join('<div class="task-panel glass glass--dark border-radius-12 border-dim">');

// 2. Add Root Form
html = html.split('<div class="add-root-form margin-t-20">').join('<div class="add-root-form margin-t-20 glass glass--dark border-radius-8 border-dim">');

// 3. Targeted Scan Options
html = html.split('<div class="targeted-scan-options margin-t-15 border-dim padding-10 border-radius-4 bg-black-10">').join('<div class="targeted-scan-options margin-t-15 glass glass--dark padding-10 border-radius-8 border-dim">');

// 4. Stop Button
html = html.split('class="small btn-danger-outline">Stop</button>').join('class="glass-btn glass-btn--sm glass-btn--danger">Stop</button>');

// 5. Back to studio button in scanner
html = html.split('<button class="small back-to-studio-btn" style="margin-bottom: 15px;">').join('<button class="glass-btn glass-btn--sm glass-btn--ghost back-to-studio-btn" style="margin-bottom: 15px;">');

fs.writeFileSync(targetFile, html, 'utf8');
console.log('Successfully applied glass styling to scanner elements');
