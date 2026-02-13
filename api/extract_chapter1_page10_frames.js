const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ffmpegPath = path.join('E:', 'ffmpeg', 'ffmpeg.exe');
const pageDir = path.join('E:', 'Comic Series', 'No_Overflow', 'Volumes', 'volume-1', 'chapter-1', 'page10');
const videoDir = path.join(pageDir, 'assets', 'video');
const imageDir = path.join(pageDir, 'assets', 'image');

if (!fs.existsSync(videoDir)) {
    console.error("Video directory not found:", videoDir);
    process.exit(1);
}

const videos = fs.readdirSync(videoDir).filter(f => f.endsWith('.mp4'));

videos.forEach(video => {
    const videoPath = path.join(videoDir, video);
    const videoName = video.replace('.mp4', '');
    const outputDir = path.join(imageDir, videoName);

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`Extracting frames from: ${video}`);
    try {
        const command = `"${ffmpegPath}" -i "${videoPath}" -vf fps=8 "${path.join(outputDir, '%04d.jpg')}"`;
        execSync(command, { stdio: 'inherit' });
        console.log(`Finished: ${video}`);
    } catch (e) {
        console.error(`Error extracting ${video}:`, e.message);
    }
});

console.log("All extractions complete.");
