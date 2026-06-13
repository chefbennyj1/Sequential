const fs = require('fs');
const targetFile = 'E:/Sequential Comic Server/views/dashboard/dashboard.html';
let html = fs.readFileSync(targetFile, 'utf8');

// Replace using regex to ignore whitespace differences
html = html.replace(/<!-- BACKGROUND SCENE -->[\s\S]*?<div class="scene">[\s\S]*?<div class="scene__blob scene__blob--1"><\/div>[\s\S]*?<div class="scene__blob scene__blob--2"><\/div>[\s\S]*?<div class="scene__blob scene__blob--3"><\/div>[\s\S]*?<\/div>/i, '');

fs.writeFileSync(targetFile, html, 'utf8');
console.log('Force removed background scene');