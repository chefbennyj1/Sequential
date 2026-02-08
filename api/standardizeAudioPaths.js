const fs = require('fs');
const path = require('path');

const libraryRoot = 'E:\\Comic Series';

/**
 * Standardizes audioSrc paths in all page.json files.
 * Converts absolute /api/audio/... paths to relative filenames.
 * Also auto-links {id}.mp3 if the file exists and audioSrc is empty.
 */
async function standardize() {
    console.log("Starting Audio Path Standardization...");
    
    // 1. Find all Series folders
    const seriesFolders = fs.readdirSync(libraryRoot).filter(f => 
        fs.statSync(path.join(libraryRoot, f)).isDirectory() && !f.startsWith('.')
    );

    for (const series of seriesFolders) {
        const volumesDir = path.join(libraryRoot, series, 'Volumes');
        if (!fs.existsSync(volumesDir)) continue;

        console.log(`Processing Series: ${series}`);

        // 2. Find all Volume folders
        const volumes = fs.readdirSync(volumesDir).filter(f => 
            fs.statSync(path.join(volumesDir, f)).isDirectory()
        );

        for (const volume of volumes) {
            const volumePath = path.join(volumesDir, volume);
            const chapters = fs.readdirSync(volumePath).filter(f => 
                f.startsWith('chapter-') && fs.statSync(path.join(volumePath, f)).isDirectory()
            );

            for (const chapter of chapters) {
                const chapterPath = path.join(volumePath, chapter);
                const pages = fs.readdirSync(chapterPath).filter(f => 
                    f.startsWith('page') && fs.statSync(path.join(chapterPath, f)).isDirectory()
                );

                for (const page of pages) {
                    const pageDir = path.join(chapterPath, page);
                    const jsonPath = path.join(pageDir, 'page.json');
                    const audioAssetsDir = path.join(pageDir, 'assets', 'audio');

                    if (!fs.existsSync(jsonPath)) continue;

                    try {
                        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                        let modified = false;

                        if (data.scene && Array.isArray(data.scene)) {
                            data.scene.forEach(cue => {
                                const oldSrc = cue.audioSrc;
                                
                                // A. Strip absolute paths to filenames
                                if (cue.audioSrc && typeof cue.audioSrc === 'string' && cue.audioSrc.includes('/')) {
                                    const filename = path.basename(cue.audioSrc);
                                    cue.audioSrc = filename;
                                    modified = true;
                                }

                                // B. Auto-heal missing paths if {id}.mp3 exists
                                if (cue.audioSrc === undefined && cue.id) {
                                    const expectedFile = `${cue.id}.mp3`;
                                    if (fs.existsSync(path.join(audioAssetsDir, expectedFile))) {
                                        cue.audioSrc = expectedFile;
                                        modified = true;
                                    }
                                }

                                if (modified && oldSrc !== cue.audioSrc) {
                                    // console.log(`  [${page}] Fixed: ${oldSrc || 'EMPTY'} -> ${cue.audioSrc}`);
                                }
                            });
                        }

                        if (modified) {
                            fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
                            console.log(`  Updated ${series}/${volume}/${chapter}/${page}`);
                        }
                    } catch (e) {
                        console.error(`  Error processing ${jsonPath}:`, e.message);
                    }
                }
            }
        }
    }

    console.log("Standardization Complete.");
}

standardize();
