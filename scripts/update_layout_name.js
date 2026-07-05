const fs = require('fs');
const path = require('path');

const targetFiles = [
  "E:\\Comic Series\\No_Overflow\\Volumes\\volume-1\\chapter-8\\page94\\page.json",
  "E:\\Comic Series\\No_Overflow\\Volumes\\volume-2\\chapter-1\\page2\\page.json",
  "E:\\Comic Series\\No_Overflow\\Volumes\\volume-2\\chapter-1\\page3\\page.json",
  "E:\\Comic Series\\No_Overflow\\Volumes\\volume-2\\chapter-3\\page40\\page.json",
  "E:\\Comic Series\\No_Overflow\\Volumes\\volume-2\\chapter-3\\page48\\page.json",
  "E:\\Comic Series\\No_Overflow\\Volumes\\volume-2\\chapter-5\\page63\\page.json"
];

const oldName = "Two_Col_Sidebar";
const newName = "3_Panel_Stack";

let updatedCount = 0;

targetFiles.forEach(file => {
    try {
        if (!fs.existsSync(file)) {
            console.error(`File not found: ${file}`);
            return;
        }

        let content = fs.readFileSync(file, 'utf8');
        
        // Simple string replace for the layout ID and HTML name
        // This is safer as it preserves all custom formatting
        if (content.includes(oldName)) {
            content = content.replace(new RegExp(oldName, 'g'), newName);
            fs.writeFileSync(file, content, 'utf8');
            console.log(`Updated ${file}`);
            updatedCount++;
        } else {
            console.log(`Pattern not found in ${file}`);
        }
    } catch (e) {
        console.error(`Failed to update ${file}: ${e.message}`);
    }
});

console.log(`Successfully updated ${updatedCount} page.json files.`);

// Rename the layout file
const oldLayoutPath = "E:\\Sequential Comic Server\\Library\\layouts\\portrait\\Two_Col_Sidebar.html";
const newLayoutPath = "E:\\Sequential Comic Server\\Library\\layouts\\portrait\\3_Panel_Stack.html";

if (fs.existsSync(oldLayoutPath)) {
    try {
        fs.renameSync(oldLayoutPath, newLayoutPath);
        console.log(`Renamed layout file to 3_Panel_Stack.html`);
    } catch (e) {
        console.error(`Failed to rename layout file: ${e.message}`);
    }
} else {
    console.error(`Layout file not found: ${oldLayoutPath}`);
}
