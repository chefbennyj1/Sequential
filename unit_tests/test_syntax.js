const fs = require('fs');
const content = fs.readFileSync('E:/Sequential Comic Server/views/reader/viewer/index.ejs', 'utf8');
const scriptMatch = content.match(/<script type="module">([\s\S]*?)<\/script>/);

if (scriptMatch) {
    const code = scriptMatch[1];
    try {
        new require('vm').Script(code);
        console.log('No syntax errors found.');
    } catch (e) {
        console.error(e.stack);
    }
} else {
    console.error('Script tag not found.');
}
