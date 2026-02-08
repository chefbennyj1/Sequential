const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Helper to parse args
const getArg = (flag) => {
    const index = process.argv.indexOf(flag);
    return (index > -1 && process.argv[index + 1]) ? process.argv[index + 1] : null;
};

const inputDir = getArg('--input');
const bgImagePath = getArg('--bg');
const outputDir = getArg('--output');

if (!inputDir || !bgImagePath || !outputDir) {
    console.error('Usage: node api/bulkOverlay.js --input <dir> --bg <file> --output <dir>');
    process.exit(1);
}

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

async function processImages() {
    try {
        // 1. Get initial Background Metadata
        const bgMetadata = await sharp(bgImagePath).metadata();
        const initialBgHeight = bgMetadata.height;

        console.log(`Background Template loaded: ${bgMetadata.width}x${bgMetadata.height} (${bgMetadata.format})`);

        // 2. Read Input Directory
        const files = fs.readdirSync(inputDir).filter(file => {
            const isImage = /\.(png|jpg|jpeg)$/i.test(file);
            const isBg = path.resolve(path.join(inputDir, file)) === path.resolve(bgImagePath);
            return isImage && !isBg;
        });

        if (files.length === 0) {
            console.log('No PNG files found in input directory.');
            return;
        }

        console.log(`Found ${files.length} images to process...`);

        // 3. Process Each Image
        for (const file of files) {
            const inputPath = path.join(inputDir, file);
            const outputPath = path.join(outputDir, file);

            try {
                const inputMetadata = await sharp(inputPath).metadata();
                const inputHeight = inputMetadata.height;
                const inputWidth = inputMetadata.width;

                // Rule: Always match the height of the smallest image.
                const targetHeight = Math.floor(Math.min(inputHeight, initialBgHeight));

                // Prepare Background (Resize if needed)
                const bgResizedBuffer = await sharp(bgImagePath)
                    .resize({ height: targetHeight })
                    .toBuffer();
                
                const bgResizedMetadata = await sharp(bgResizedBuffer).metadata();
                const actualBgWidth = bgResizedMetadata.width;
                const actualBgHeight = bgResizedMetadata.height;

                // Prepare Input
                // We use fit: 'cover' to ensure it matches the BG dimensions exactly by cropping if needed.
                const finalInputBuffer = await sharp(inputPath)
                    .resize(actualBgWidth, actualBgHeight, {
                        fit: 'cover',
                        position: 'center'
                    })
                    .toBuffer();

                const finalInputMetadata = await sharp(finalInputBuffer).metadata();

                console.log(`- ${file}: BG ${actualBgWidth}x${actualBgHeight}, Input ${finalInputMetadata.width}x${finalInputMetadata.height}`);

                // Composite
                await sharp(bgResizedBuffer)
                    .composite([{
                        input: finalInputBuffer,
                        gravity: 'center'
                    }])
                    .toFile(outputPath);

                console.log(`Processed: ${file} (Height: ${targetHeight}px)`);
            } catch (err) {
                console.error(`Error processing ${file}:`, err.message);
            }
        }

        console.log('Batch processing complete.');

    } catch (err) {
        console.error('Fatal Error:', err);
    }
}

processImages();
