const fs = require('fs');
const targetFile = 'E:/Sequential Comic Server/views/dashboard/dashboard.html';
let html = fs.readFileSync(targetFile, 'utf8');

const sceneBlock = `<!-- BACKGROUND SCENE -->
<div class="scene">
    <div class="scene__blob scene__blob--1"></div>
    <div class="scene__blob scene__blob--2"></div>
    <div class="scene__blob scene__blob--3"></div>
</div>`;

if (html.includes(sceneBlock)) {
    html = html.replace(sceneBlock, '');
    fs.writeFileSync(targetFile, html, 'utf8');
    console.log('Removed background scene blobs');
} else {
    console.log('Background scene blobs not found');
}
