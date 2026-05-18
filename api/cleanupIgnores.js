const fs = require('fs');
const path = require('path');

const base = 'E:\\Comic Series\\No_Overflow_Redux\\Volumes\\volume-1';
for (let i = 3; i <= 8; i++) {
    const p = path.join(base, `chapter-${i}`, '.ignore-shift');
    if (fs.existsSync(p)) {
        fs.unlinkSync(p);
    }
}
console.log('Cleaned up .ignore-shift files');
