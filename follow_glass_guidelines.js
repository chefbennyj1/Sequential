const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

const filesToFix = ['E:/Sequential Comic Server/views/dashboard/dashboard.html'];
walkDir('E:/Sequential Comic Server/views/dashboard/components', (f) => {
    if (f.endsWith('.html') || f.endsWith('.js')) filesToFix.push(f);
});

filesToFix.forEach(filePath => {
    let original = fs.readFileSync(filePath, 'utf8');
    let content = original;

    // 1. Ensure all glass-btn also have the base 'glass' class
    content = content.replace(/class="glass-btn/g, 'class="glass glass-btn');
    // Prevent double 'glass' if it was already there
    content = content.replace(/class="glass glass glass-btn/g, 'class="glass glass-btn');

    // 2. Standardize Cards
    content = content.replace(/class="mode-card/g, 'class="glass glass-card mode-card');
    content = content.replace(/class="chapter-card/g, 'class="glass glass-card chapter-card');
    content = content.replace(/class="glass glass glass-card/g, 'class="glass glass-card');

    // 3. Update Inputs/Selects from 'gov-' to 'glass-'
    content = content.replace(/class="gov-input/g, 'class="glass-input');
    content = content.replace(/class="gov-select/g, 'class="glass-select');

    // 4. Update Dashboard sections to use glass panels
    content = content.replace(/class="([^"]*?dashboard-section[^"]*?)"/g, (match, classes) => {
        if (!classes.includes('glass')) {
            return `class="${classes} glass glass--frosted glass-card"`;
        }
        return match;
    });

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Followed glass guidelines in ${path.basename(filePath)}`);
    }
});
