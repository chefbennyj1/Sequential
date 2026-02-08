const fs = require('fs');
const path = require('path');

const cssPath = 'E:\\Comic Series\\No_Overflow\\Volumes\\volume-1\\chapter-1\\page2\\page.css';
const content = `@import url('/layouts/styles/base-comic-layout.css');`;

try {
    fs.writeFileSync(cssPath, content);
    console.log("Restored Page 2 CSS.");
} catch (e) {
    console.error(e.message);
}