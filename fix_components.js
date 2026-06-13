const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

const targetDir = 'E:/Sequential Comic Server/views/dashboard/components';

const replacements = [
    { old: 'class="update__btn w-full margin-t-20"', new: 'class="glass-btn glass-btn--primary w-full margin-t-20"' },
    { old: 'class="update__btn w-full"', new: 'class="glass-btn glass-btn--primary w-full"' },
    { old: 'class="update__btn small"', new: 'class="glass-btn glass-btn--sm glass-btn--primary"' },
    { old: 'class="update__btn flex-1"', new: 'class="glass-btn glass-btn--primary flex-1"' },
    { old: 'class="update__btn flex-2"', new: 'class="glass-btn glass-btn--primary flex-2"' },
    { old: 'class="update__btn width-100 font-size-1-1"', new: 'class="glass-btn glass-btn--primary width-100 font-size-1-1"' },
    { old: 'class="update__btn width-100"', new: 'class="glass-btn glass-btn--primary width-100"' },
    { old: 'class="update__btn"', new: 'class="glass-btn glass-btn--primary"' },
    
    // Legacy action-btn stuff that are just text buttons
    { old: 'class="small mode-back-btn margin-b-15"', new: 'class="glass-btn glass-btn--sm glass-btn--ghost mode-back-btn margin-b-15"' },
    { old: 'class="small back-to-studio-btn margin-b-20"', new: 'class="glass-btn glass-btn--sm glass-btn--ghost back-to-studio-btn margin-b-20"' },
    { old: 'class="small back-to-studio-btn studio-back-btn"', new: 'class="glass-btn glass-btn--sm glass-btn--ghost back-to-studio-btn studio-back-btn"' },
    { old: 'class="small flex-1"', new: 'class="glass-btn glass-btn--sm glass-btn--ghost flex-1"' },
    { old: 'class="small w-full"', new: 'class="glass-btn glass-btn--sm glass-btn--ghost w-full"' },
    { old: 'class="small w-full margin-b-10"', new: 'class="glass-btn glass-btn--sm glass-btn--ghost w-full margin-b-10"' },
    { old: 'class="small btn-apply width-100 margin-t-15"', new: 'class="glass-btn glass-btn--sm glass-btn--primary width-100 margin-t-15"' },
    { old: 'class="small btn-secondary flex-row align-center gap-5"', new: 'class="glass-btn glass-btn--sm glass-btn--ghost flex-row align-center gap-5"' },
    { old: 'class="small btn-secondary flex-1"', new: 'class="glass-btn glass-btn--sm glass-btn--ghost flex-1"' },
    
    // Component specific buttons
    { old: 'class="edit-btn"', new: 'class="glass-btn glass-btn--sm glass-btn--ghost edit-btn"' },
    { old: 'class="delete-btn"', new: 'class="glass-btn glass-btn--sm glass-btn--danger delete-btn"' },
    { old: 'class="gov-btn-cancel flex-1"', new: 'class="glass-btn glass-btn--ghost flex-1"' },
    { old: 'class="gov-btn-action"', new: 'class="glass-btn glass-btn--primary"' },
    { old: 'class="gov-btn-cancel"', new: 'class="glass-btn glass-btn--ghost"' },
    { old: 'class="gov-btn-small"', new: 'class="glass-btn glass-btn--sm glass-btn--ghost"' },
    { old: 'class="small btn-danger-outline delete-geom-btn margin-l-10"', new: 'class="glass-btn glass-btn--sm glass-btn--danger delete-geom-btn margin-l-10"' },
    { old: 'class="small btn-danger-outline"', new: 'class="glass-btn glass-btn--sm glass-btn--danger"' },
    { old: 'class="small root-delete-btn"', new: 'class="glass-btn glass-btn--sm glass-btn--danger root-delete-btn"' },
    { old: 'class="small btn-accent"', new: 'class="glass-btn glass-btn--sm glass-btn--primary"' },
    { old: 'class="small btn-browse"', new: 'class="glass-btn glass-btn--sm glass-btn--ghost btn-browse"' },
    { old: 'class="delete-item-btn"', new: 'class="glass-btn glass-btn--sm glass-btn--danger delete-item-btn"' },
];

let changedCount = 0;

walkDir(targetDir, function(filePath) {
    if (filePath.endsWith('.html') || filePath.endsWith('.js')) {
        let originalContent = fs.readFileSync(filePath, 'utf8');
        let html = originalContent;

        replacements.forEach(r => {
            html = html.split(r.old).join(r.new);
        });

        // For any remaining generic <button class="small">
        html = html.replace(/<button([^>]*?)class="small"([^>]*?)>/g, '<button$1class="glass-btn glass-btn--sm glass-btn--ghost"$2>');

        if (html !== originalContent) {
            fs.writeFileSync(filePath, html, 'utf8');
            console.log('Fixed ' + path.basename(filePath));
            changedCount++;
        }
    }
});

console.log(`Updated ${changedCount} component files.`);
