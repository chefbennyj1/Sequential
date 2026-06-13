const fs = require('fs');
const targetFile = 'E:/Sequential Comic Server/views/dashboard/dashboard.html';
let html = fs.readFileSync(targetFile, 'utf8');

// The block to move
const libraryBtnStr = `<div class="divider-v"></div>

        <a href="/library" class="glass glass-btn glass-btn--sm glass-btn--ghost" style="text-decoration: none;">
            <ion-icon name="library-outline"></ion-icon>
            <span style="font-size: var(--text-2xs); letter-spacing: 0.1em; font-weight: 600; margin-left: 8px;">LIBRARY</span>
        </a>`;

// Remove it from its current position
html = html.replace(libraryBtnStr, '');

// The target destination
const targetTabListEnd = `</nav>
        </div>`;

const newTabListEnd = `    <a href="/library" class="glass-tab" style="text-decoration: none; display: inline-flex; align-items: center; gap: 5px;" title="Go to Library">
                    <ion-icon name="library-outline"></ion-icon> Library
                </a>
            </nav>
        </div>`;

html = html.replace(targetTabListEnd, newTabListEnd);

fs.writeFileSync(targetFile, html, 'utf8');
console.log('Moved Library View button');
