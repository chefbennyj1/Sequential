const fs = require('fs');
const path = require('path');

const base = 'E:\\Comic Series\\No_Overflow_Redux\\Volumes\\volume-1';
for (let i = 4; i <= 8; i++) {
    const p = path.join(base, `chapter-${i}`, '.ignore-shift');
    fs.writeFileSync(p, 'SHIFT_COMPLETE_2026_05_18');
}
console.log('Ignored chapters 4-8');
