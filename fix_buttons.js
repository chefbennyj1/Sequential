const fs = require('fs');
const path = require('path');

const targetFile = 'E:/Sequential Comic Server/views/dashboard/dashboard.html';
let html = fs.readFileSync(targetFile, 'utf8');

// The black box fix for avatar
html = html.replace('class="avatar char-avatar-small"', 'class="avatar"');

// Targeted button replacements
const replacements = [
    { old: 'class="update__btn w-full margin-t-20"', new: 'class="glass-btn glass-btn--primary w-full margin-t-20"' },
    { old: 'class="update__btn w-full"', new: 'class="glass-btn glass-btn--primary w-full"' },
    { old: 'class="update__btn small"', new: 'class="glass-btn glass-btn--sm glass-btn--primary"' },
    { old: 'class="update__btn flex-1"', new: 'class="glass-btn glass-btn--primary flex-1"' },
    { old: 'class="update__btn flex-2"', new: 'class="glass-btn glass-btn--primary flex-2"' },
    { old: 'class="update__btn width-100 font-size-1-1"', new: 'class="glass-btn glass-btn--primary width-100 font-size-1-1"' },
    { old: 'class="update__btn"', new: 'class="glass-btn glass-btn--primary"' },
    { old: 'class="small mode-back-btn margin-b-15"', new: 'class="glass-btn glass-btn--sm glass-btn--ghost mode-back-btn margin-b-15"' },
    { old: 'class="small back-to-studio-btn margin-b-20"', new: 'class="glass-btn glass-btn--sm glass-btn--ghost back-to-studio-btn margin-b-20"' },
    { old: 'class="small back-to-studio-btn studio-back-btn"', new: 'class="glass-btn glass-btn--sm glass-btn--ghost back-to-studio-btn studio-back-btn"' },
    { old: 'class="small flex-1"', new: 'class="glass-btn glass-btn--sm glass-btn--ghost flex-1"' },
    { old: 'class="small w-full"', new: 'class="glass-btn glass-btn--sm glass-btn--ghost w-full"' },
    { old: 'class="small w-full margin-b-10"', new: 'class="glass-btn glass-btn--sm glass-btn--ghost w-full margin-b-10"' },
    { old: 'class="small btn-apply width-100 margin-t-15"', new: 'class="glass-btn glass-btn--sm glass-btn--primary width-100 margin-t-15"' },
    { old: 'class="small btn-secondary flex-row align-center gap-5"', new: 'class="glass-btn glass-btn--sm glass-btn--ghost flex-row align-center gap-5"' },
    { old: 'class="delete-item-btn"', new: 'class="glass-btn glass-btn--sm glass-btn--danger delete-item-btn"' }
];

replacements.forEach(r => {
    html = html.split(r.old).join(r.new);
});

// For any remaining <button id="..." class="small"> or <button class="small">
html = html.replace(/<button([^>]*?)class="small"([^>]*?)>/g, '<button$1class="glass-btn glass-btn--sm glass-btn--ghost"$2>');

fs.writeFileSync(targetFile, html, 'utf8');
console.log('Fixed dashboard.html');
