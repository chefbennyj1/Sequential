const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ffmpegPath = "E:\\New Site\\ffmpeg\\ffmpeg.exe";
const videoPath = path.join('E:', 'Comic Series', 'No_Overflow', 'Volumes', 'volume-1', 'chapter-2', 'page10', 'assets', 'video', 'nova_walks_through_crowd.mp4');
const outputDirBase = path.join('E:', 'Comic Series', 'No_Overflow', 'Volumes', 'volume-1', 'chapter-2', 'page10', 'assets', 'image', 'nova_walks_through_crowd');

if (!fs.existsSync(outputDirBase)) {
    fs.mkdirSync(outputDirBase, { recursive: true });
}

console.log(`Starting frame extraction for: ${videoPath}`);
console.log(`Output directory: ${outputDirBase}`);

try {
    const command = `"${ffmpegPath}" -i "${videoPath}" -vf fps=8 "${path.join(outputDirBase, '%04d.jpg')}"`;
    console.log(`Executing: ${command}`);
    
    execSync(command, { stdio: 'inherit' });
    
    console.log("Extraction complete.");
} catch (error) {
    console.error("Error during extraction:", error.message);
}
