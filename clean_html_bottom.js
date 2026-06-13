const fs = require('fs');
const targetFile = 'E:/Sequential Comic Server/views/dashboard/dashboard.html';
let html = fs.readFileSync(targetFile, 'utf8');

// Find the last actual section close (Style Lab)
const lastSectionClose = '</div>\n    </div>\n\n</main>';
const lastIndex = html.lastIndexOf('</div>\n    </div>\n\n</main>');

if (lastIndex !== -1) {
    html = html.substring(0, lastIndex + '</div>\n    </div>\n\n</main>'.length);
    fs.writeFileSync(targetFile, html, 'utf8');
    console.log('Cleaned up extra tags at the end of dashboard.html');
} else {
    console.log('Target end marker not found.');
}
