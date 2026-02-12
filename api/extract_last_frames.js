const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sourceDir = 'E:/_bak_001/.bak_99/move to other drive';
const ffmpegPath = 'E:/New Site/ffmpeg/ffmpeg.exe';

async function processVideos() {
    try {
        const files = fs.readdirSync(sourceDir);
        const mp4Files = files.filter(f => f.toLowerCase().endsWith('.mp4'));

        console.log(`Found ${mp4Files.length} MP4 files to process.`);

        for (const file of mp4Files) {
            const fileNameNoExt = path.parse(file).name;
            const folderPath = path.join(sourceDir, fileNameNoExt);
            const videoPath = path.join(sourceDir, file);
            const targetVideoPath = path.join(folderPath, file);
            const targetImagePath = path.join(folderPath, `${fileNameNoExt}.jpg`);

            console.log(`Processing: ${file}`);

            // 1. Create Folder
            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
            }

            // 2. Move Video
            fs.renameSync(videoPath, targetVideoPath);

            // 3. Extract Last Frame
            // ffmpeg -sseof -3 -i file -vsync 0 -q:v 31 -update true out.jpg
            const cmd = `"${ffmpegPath}" -sseof -3 -i "${targetVideoPath}" -vsync 0 -q:v 31 -update true "${targetImagePath}"`;
            
            try {
                execSync(cmd, { stdio: 'inherit' });
                console.log(`Successfully extracted frame for: ${file}`);
            } catch (err) {
                console.error(`Failed to extract frame for ${file}:`, err.message);
            }
        }

        console.log('All processing complete.');
    } catch (err) {
        console.error('An error occurred during video processing:', err);
    }
}

processVideos();
