const fs = require('fs');
const targetFile = 'E:/Sequential Comic Server/views/dashboard/dashboard.html';
let html = fs.readFileSync(targetFile, 'utf8');

// 1. Standardize Studio Hub mode cards
html = html.replace(/<div class="glass glass-card mode-card" data-target="([^"]+)">\s*<ion-icon name="([^"]+)"><\/ion-icon>\s*<h4>([^<]+)<\/h4>\s*<p>([^<]+)<\/p>\s*<\/div>/g, 
    `<div class="glass glass-card mode-card" data-target="$1">
        <ion-icon name="$2"></ion-icon>
        <h3 class="glass-card__title">$3</h3>
        <p class="glass-card__body">$4</p>
    </div>`);

// 2. Fix the disabled "Coming Soon" card
html = html.replace(/<div class="glass glass-card mode-card disabled opacity-50 cursor-not-allowed">\s*<ion-icon name="([^"]+)"><\/ion-icon>\s*<h4>([^<]+)<\/h4>\s*<p>([^<]+)<\/p>\s*<\/div>/g,
    `<div class="glass glass-card mode-card disabled opacity-50 cursor-not-allowed">
        <ion-icon name="$1"></ion-icon>
        <h3 class="glass-card__title">$2</h3>
        <p class="glass-card__body">$3</p>
    </div>`);

// 3. Standardize Page Tool mode cards
html = html.replace(/<div class="glass glass-card mode-card width-200 padding-30" id="([^"]+)">\s*<ion-icon name="([^"]+)"><\/ion-icon>\s*<h4>([^<]+)<\/h4>\s*<\/div>/g,
    `<div class="glass glass-card mode-card" id="$1">
        <ion-icon name="$2"></ion-icon>
        <h3 class="glass-card__title">$3</h3>
    </div>`);

// 4. Clean up other containers to use glass system
html = html.replace(/class="global-settings bg-dark padding-20 border-radius-12 border-dim margin-b-30"/g, 'class="global-settings glass glass--dark glass-card margin-b-30"');
html = html.replace(/class="bg-dark padding-30 border-radius-12 border-dim hidden"/g, 'class="glass glass--dark glass-card hidden"');
html = html.replace(/class="flex-1 bg-dark padding-30 border-radius-12 border-dim"/g, 'class="flex-1 glass glass--dark glass-card"');

fs.writeFileSync(targetFile, html, 'utf8');
console.log('Followed glass guidelines for mode-cards and containers');
