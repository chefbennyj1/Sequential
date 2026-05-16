const fs = require('fs');
const path = require('path');

const targets = [
    { file: "E:/Comic Series/No_Overflow_Redux/Volumes/volume-1/chapter-1/page2/page.json", panels: [".panel-A"] },
    { file: "E:/Comic Series/No_Overflow_Redux/Volumes/volume-1/chapter-1/page7/page.json", panels: [".panel-B"] },
    { file: "E:/Comic Series/No_Overflow_Redux/Volumes/volume-1/chapter-1/page8/page.json", panels: [".panel-A", ".panel-B", ".panel-D"] },
    { file: "E:/Comic Series/No_Overflow_Redux/Volumes/volume-1/chapter-4/page40/page.json", panels: [".panel-A", ".panel-B"] },
    { file: "E:/Comic Series/No_Overflow_Redux/Volumes/volume-1/chapter-6/page58/page.json", panels: [".panel-E", ".panel-F"] },
    { file: "E:/Comic Series/No_Overflow_Redux/Volumes/volume-1/chapter-7/page70/page.json", panels: [".panel-A", ".panel-C"] },
    { file: "E:/Comic Series/No_Overflow_Redux/Volumes/volume-1/chapter-7/page77/page.json", panels: [".panel-B", ".panel-C", ".panel-D"] },
    { file: "E:/Comic Series/No_Overflow_Redux/Volumes/volume-1/chapter-8/page89/page.json", panels: [".panel-A"] }
];

targets.forEach(target => {
    if (!fs.existsSync(target.file)) {
        console.log(`File not found: ${target.file}`);
        return;
    }

    try {
        const data = JSON.parse(fs.readFileSync(target.file, 'utf8'));
        let modified = false;

        if (data.media && Array.isArray(data.media)) {
            data.media.forEach(item => {
                if (target.panels.includes(item.panel)) {
                    console.log(`Cleaning ${target.file} | ${item.panel}`);
                    item.description = "";
                    item.alt = "";
                    item.hashtags = [];
                    item.DescriptionUpdateRequired = true; // Flag for standard scan
                    modified = true;
                }
            });
        }

        if (modified) {
            fs.writeFileSync(target.file, JSON.stringify(data, null, 2));
            console.log(`Successfully saved: ${target.file}`);
        }
    } catch (e) {
        console.error(`Error processing ${target.file}: ${e.message}`);
    }
});
