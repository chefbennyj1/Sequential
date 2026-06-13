const fs = require('fs');
const targetFile = 'E:/Sequential Comic Server/views/dashboard/ui-kit/glass-system/glass_components.css';
let css = fs.readFileSync(targetFile, 'utf8');

// Regex to remove the blob definitions from the CSS
css = css.replace(/\.scene__blob[\s\S]*?\}\s*\[data-theme="light"\] \.scene__blob[\s\S]*?\}\s*\.scene__blob--1[\s\S]*?\}\s*\.scene__blob--2[\s\S]*?\}\s*\.scene__blob--3[\s\S]*?\}/, '');

fs.writeFileSync(targetFile, css, 'utf8');
console.log('Cleaned blob CSS');
