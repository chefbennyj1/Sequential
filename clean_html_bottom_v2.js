const fs = require('fs');
const targetFile = 'E:/Sequential Comic Server/views/dashboard/dashboard.html';
let html = fs.readFileSync(targetFile, 'utf8');

const pivot = '<div id="style-lab-preview"';
const pivotIndex = html.indexOf(pivot);

if (pivotIndex !== -1) {
    const mainClose = html.indexOf('</main>', pivotIndex);
    if (mainClose !== -1) {
        html = html.substring(0, mainClose + '</main>'.length);
        fs.writeFileSync(targetFile, html, 'utf8');
        console.log('Successfully cleaned HTML bottom');
    } else {
        console.log('No </main> found after style-lab-preview');
    }
} else {
    console.log('Pivot point not found');
}
