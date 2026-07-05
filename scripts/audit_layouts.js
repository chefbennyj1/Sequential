const fs = require('fs');
const path = require('path');

// Recursive function to find all page.json files
function findPageJsons(dir, fileList = []) {
    if (!fs.existsSync(dir)) {
        console.error(`Directory not found: ${dir}`);
        return fileList;
    }

    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            findPageJsons(filePath, fileList);
        } else if (file === 'page.json') {
            fileList.push(filePath);
        }
    }
    return fileList;
}

function auditLayouts(baseDir) {
    console.log(`Scanning for page.json files in: ${baseDir}\n`);
    const pageFiles = findPageJsons(baseDir);
    
    if (pageFiles.length === 0) {
        console.log("No page.json files found.");
        return;
    }

    const layoutUsage = {};
    let parseErrors = 0;

    pageFiles.forEach(file => {
        try {
            const data = fs.readFileSync(file, 'utf8');
            const pageData = JSON.parse(data);
            
            if (pageData.header && pageData.header.layout && pageData.header.layout.id) {
                const layoutId = pageData.header.layout.id;
                if (!layoutUsage[layoutId]) {
                    layoutUsage[layoutId] = [];
                }
                // Store a relative or shortened path for readability
                const relativePath = path.relative(baseDir, file);
                layoutUsage[layoutId].push(relativePath);
            } else {
                if (!layoutUsage['NO_LAYOUT_ID']) layoutUsage['NO_LAYOUT_ID'] = [];
                layoutUsage['NO_LAYOUT_ID'].push(path.relative(baseDir, file));
            }
        } catch (err) {
            console.error(`Error parsing ${file}: ${err.message}`);
            parseErrors++;
        }
    });

    console.log(`--- AUDIT RESULTS ---`);
    console.log(`Total Pages Scanned: ${pageFiles.length}`);
    if (parseErrors > 0) console.log(`Parse Errors: ${parseErrors}`);
    console.log(`Unique Layouts Found: ${Object.keys(layoutUsage).length}\n`);

    // Sort layouts by usage count descending
    const sortedLayouts = Object.keys(layoutUsage).sort((a, b) => layoutUsage[b].length - layoutUsage[a].length);

    sortedLayouts.forEach(layoutId => {
        const pages = layoutUsage[layoutId];
        console.log(`\nLayout ID: "${layoutId}" (Used ${pages.length} times)`);
        
        // Show up to 5 examples to keep output clean, unless user wants to see all
        const displayPages = pages.slice(0, 10);
        displayPages.forEach(p => console.log(`  - ${p}`));
        
        if (pages.length > 10) {
            console.log(`  ... and ${pages.length - 10} more pages`);
        }
    });
}

const targetDir = process.argv[2] || "E:\\Comic Series\\No_Overflow\\Volumes";
auditLayouts(targetDir);
