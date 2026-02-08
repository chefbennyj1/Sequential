require('dotenv').config(); // Load environment variables from .env file
const fs = require('fs');
const path = require('path');
const https = require('https'); // For making HTTP requests to ElevenLabs API

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
if (!ELEVENLABS_API_KEY) {
    console.error('ELEVENLABS_API_KEY is not set in your .env file.');
    process.exit(1);
}

// --- CONFIGURATION ---
// Map character names from scene.json to ElevenLabs Voice IDs
// USER: Fill this map with your character names and their corresponding ElevenLabs Voice IDs
const characterVoiceMap = {
    // Example:
    "Lila": "YOUR_LILA_VOICE_ID",
    "Nova": "YOUR_NOVA_VOICE_ID",
    "Jax": "YOUR_JAX_VOICE_ID",
    "Rin": "YOUR_RIN_VOICE_ID",
    // "Default": "A_FALLBACK_VOICE_ID" // A fallback voice ID if character is not found
};

// ElevenLabs API endpoint
const ELEVENLABS_API_URL = 'api.elevenlabs.io';
const ELEVENLABS_MODEL_ID = 'eleven_monolingual_v1'; // USER: Verify this model ID is compatible with v3 or update as needed.

// --- MAIN SCRIPT ---
async function generateSceneAudio() {
    let sceneFiles = await findSceneFiles(path.join(__dirname, '../Library/No_Overflow/Volumes'));

    let limit = -1; // Default to no limit
    const args = process.argv.slice(2); // Get arguments after 'node script.js'

    const limitIndex = args.indexOf('--limit');
    if (limitIndex > -1 && args[limitIndex + 1]) {
        const parsedLimit = parseInt(args[limitIndex + 1], 10);
        if (!isNaN(parsedLimit) && parsedLimit > 0) {
            limit = parsedLimit;
            console.log(`Processing limited to the first ${limit} scene.json files.`);
        }
    }
    
    // Apply limit if specified
    if (limit > -1 && sceneFiles.length > limit) {
        sceneFiles = sceneFiles.slice(0, limit);
        console.log(`Adjusted sceneFiles array to process ${sceneFiles.length} files.`);
    }

    for (const filePath of sceneFiles) {
        console.log(`Processing ${filePath}`);
        try {
            const fileContent = await fs.promises.readFile(filePath, 'utf8');
            let sceneData = JSON.parse(fileContent);
            let modified = false;

            const urlParts = filePath.split(path.sep);
            const pageFolder = urlParts[urlParts.length - 2]; // e.g., "page1"
            const chapterFolder = urlParts[urlParts.length - 3]; // e.g., "chapter-1"
            const volumeFolder = urlParts[urlParts.length - 4]; // e.g., "volume-1"

            const audioAssetsDir = path.join(
                __dirname, 
                '../Library/No_Overflow/Volumes',
                volumeFolder, 
                chapterFolder, 
                pageFolder, 
                'assets'
            );
            await fs.promises.mkdir(audioAssetsDir, { recursive: true });

            if (Array.isArray(sceneData)) {
                for (let i = 0; i < sceneData.length; i++) {
                    const item = sceneData[i];

                    if (!item.id) {
                        console.warn(`Skipping item ${i} in ${filePath}: Missing ID. Run generateSceneIds first.`);
                        continue;
                    }
                    if (!item.text) {
                        console.warn(`Skipping item ${i} (ID: ${item.id}) in ${filePath}: Missing text.`);
                        continue;
                    }
                    // Skip items with character "Narrator" as per user request
                    if (item.character === "Narrator") {
                        console.log(`Skipping item ${item.id} (Character: "Narrator") in ${filePath}.`);
                        continue;
                    }
                    if (!item.character) {
                        console.warn(`Skipping item ${i} (ID: ${item.id}) in ${filePath}: Missing character name.`);
                        continue;
                    }

                    const voiceId = characterVoiceMap[item.character] || characterVoiceMap['Default'];
                    if (!voiceId) {
                        console.warn(`Skipping item ${item.id} (Character: "${item.character}") in ${filePath}: No voice ID found. Please update characterVoiceMap.`);
                        continue;
                    }

                    const audioFileName = `${item.id}.mp3`;
                    const audioFilePath = path.join(audioAssetsDir, audioFileName);
                    const relativeAudioSrc = `/api/audio/${volumeFolder}/${chapterFolder}/${pageFolder}/assets/${audioFileName}`;

                    // Check if audio file already exists
                    if (fs.existsSync(audioFilePath)) {
                        console.log(`Audio for item ${item.id} already exists. Skipping generation.`);
                        // Ensure audioSrc is correctly set in scene.json if it was missing
                        if (item.audioSrc !== relativeAudioSrc) {
                            item.audioSrc = relativeAudioSrc;
                            modified = true;
                        }
                        continue;
                    }
                    
                    // Clean text for ElevenLabs API call: remove <br/> tags
                    let textForElevenLabs = item.text.replace(/<br\s*\/?>/gi, ' ').trim();
                    // Ensure textForElevenLabs is not empty after cleaning
                    if (textForElevenLabs.length === 0) {
                        console.warn(`Skipping audio generation for item ${item.id}: Text is empty after cleaning <br/> tags.`);
                        continue;
                    }

                    console.log(`Generating audio for item ${item.id} (${item.character}) in ${filePath}...`);
                    try {
                        const audioBuffer = await textToSpeech(textForElevenLabs, voiceId); // Use cleaned text
                        await fs.promises.writeFile(audioFilePath, audioBuffer);
                        item.audioSrc = relativeAudioSrc;
                        modified = true;
                        console.log(`Successfully generated audio for item ${item.id}.`);
                    } catch (elevenLabsError) {
                        console.error(`Error generating audio for item ${item.id}:`, elevenLabsError.message);
                    }
                }
            } else {
                console.warn(`Skipping ${filePath}: Expected JSON array, but found a different structure.`);
            }

            if (modified) {
                await fs.promises.writeFile(filePath, JSON.stringify(sceneData, null, 2), 'utf8');
                console.log(`Updated ${filePath} with new audioSrc paths.`);
            }

        } catch (error) {
            console.error(`Error processing ${filePath}:`, error.message);
        }
    }
    console.log('Finished generating scene audio.');
}

// Helper to make ElevenLabs API call
function textToSpeech(text, voiceId) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            text: text,
            model_id: ELEVENLABS_MODEL_ID,
            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.5
            }
        });

        const options = {
            hostname: ELEVENLABS_API_URL,
            path: `/v3/text-to-speech/${voiceId}`, // Targeting ElevenLabs v3 API
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': postData.length,
                'xi-api-key': ELEVENLABS_API_KEY
            }
        };

        const req = https.request(options, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(buffer);
                } else {
                    const errorDetails = buffer.toString('utf8');
                    reject(new Error(`ElevenLabs API error: ${res.statusCode} - ${errorDetails}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(postData);
        req.end();
    });
}

// Helper to find all scene.json files recursively
async function findSceneFiles(startPath) {
    const results = [];
    const files = await fs.promises.readdir(startPath, { withFileTypes: true });

    for (const file of files) {
        const fullPath = path.join(startPath, file.name);
        if (file.isDirectory()) {
            results.push(...await findSceneFiles(fullPath));
        } else if (file.isFile() && file.name === 'scene.json') {
            results.push(fullPath);
        }
    }
    return results;
}

// Run the script
generateSceneAudio();
