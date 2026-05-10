const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const GlobalSettings = require('../models/GlobalSettings');
const axios = require('axios');
const crypto = require('crypto');

const sharp = require('sharp');

class VisionService {
    constructor() {
        this.process = null;
        this.isStarting = false;
        this.shutdownTimer = null;
        this.port = 8081; 
        this.baseUrl = `http://localhost:${this.port}`;
        this.inactivityTimeout = 60000; 
        this.isAnalyzing = false;
    }

    async generateImageHash(imagePath) {
        try {
            const buffer = await sharp(imagePath)
                .resize(256, 256, { fit: 'inside' }) // Small size for fast hashing
                .grayscale() // Remove color to focus on structure
                .toBuffer();
            
            return crypto.createHash('md5').update(buffer).digest('hex');
        } catch (err) {
            console.error(`[Vision] Hash Generation Error:`, err.message);
            return null;
        }
    }

    async getSettings() {
        let settings = await GlobalSettings.findOne({ key: "main" });
        if (!settings) {
            settings = new GlobalSettings({ key: "main" });
            await settings.save();
        }
        return settings;
    }

    async startServer() {
        if (this.process || this.isStarting) return true;

        const settings = await this.getSettings();
        if (!settings.vision.enabled) {
            throw new Error("Vision AI is disabled in settings.");
        }

        const platform = process.platform;
        const binaryName = platform === 'win32' ? 'llama-server.exe' : 'llama-server';
        const binaryPath = path.join(__dirname, '..', 'bin', platform, binaryName);
        const modelPath = settings.vision.modelPath;
        const mmprojPath = settings.vision.mmprojPath;

        if (!binaryPath || !fs.existsSync(binaryPath)) {
            throw new Error(`llama-server binary not found for platform ${platform} at: ${binaryPath}`);
        }
        if (!modelPath || !fs.existsSync(modelPath)) {
            throw new Error(`Gemma model not found at: ${modelPath}`);
        }
        if (!mmprojPath || !fs.existsSync(mmprojPath)) {
            throw new Error(`Multimodal Projector (mmproj) not found at: ${mmprojPath}`);
        }

        console.log(`[Vision] Starting llama-server on port ${this.port}...`);
        this.isStarting = true;

        // Command arguments for llama-server
        const args = [
            '-m', modelPath,
            '--mmproj', mmprojPath,
            '--port', this.port.toString(),
            '--ctx-size', '4096', // Increased for vision tasks
            '--threads', '4',
            '--n-gpu-layers', '0',
            '--ubatch-size', '256', // Smaller batches for CPU stability
            '--batch-size', '256'
        ];

        this.process = spawn(binaryPath, args, {
            detached: false,
            stdio: 'pipe'
        });

        // Log output for debugging
        this.process.stdout.on('data', (data) => console.log(`[Llama-STDOUT] ${data}`));
        this.process.stderr.on('data', (data) => console.log(`[Llama-STDERR] ${data}`));

        this.process.on('close', (code) => {
            console.log(`[Vision] llama-server exited with code ${code}`);
            this.process = null;
            this.isStarting = false;
        });

        // Wait for server to be responsive
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds timeout
        while (attempts < maxAttempts) {
            try {
                await axios.get(`${this.baseUrl}/health`);
                console.log(`[Vision] llama-server is healthy and ready.`);
                this.isStarting = false;
                this.resetShutdownTimer();
                return true;
            } catch (err) {
                attempts++;
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        this.stopServer();
        throw new Error("llama-server failed to start within timeout.");
    }

    stopServer() {
        if (this.process) {
            console.log(`[Vision] Stopping llama-server...`);
            this.process.kill();
            this.process = null;
        }
        if (this.shutdownTimer) {
            clearTimeout(this.shutdownTimer);
            this.shutdownTimer = null;
        }
    }

    resetShutdownTimer() {
        if (this.shutdownTimer) clearTimeout(this.shutdownTimer);
        
        // CRITICAL: Do not start the shutdown timer if an analysis is in progress!
        if (this.isAnalyzing) return;

        this.shutdownTimer = setTimeout(() => {
            console.log(`[Vision] Shutting down llama-server due to inactivity.`);
            this.stopServer();
        }, this.inactivityTimeout);
    }

    async analyzeImage(imagePath, customPrompt = null) {
        this.isAnalyzing = true;
        if (this.shutdownTimer) {
            clearTimeout(this.shutdownTimer);
            this.shutdownTimer = null;
        }

        try {
            await this.startServer();

            const settings = await this.getSettings();
            const prompt = customPrompt || settings.vision.systemPrompt;

            // 1. Process image: Resize to 448px max to speed up CPU encoding
            const sharp = require('sharp');
            console.log(`[Vision] Optimizing image for i3 CPU analysis (448px): ${path.basename(imagePath)}`);

            const optimizedBuffer = await sharp(imagePath)
                .resize(448, 448, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 70 })
                .toBuffer();
            const base64Image = optimizedBuffer.toString('base64');

            console.log(`[Vision] Sending to Gemma 3...`);

            // Llama-server OpenAI compatible multimodal request
            const response = await axios.post(`${this.baseUrl}/v1/chat/completions`, {
                model: "gpt-4o", 
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: prompt },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:image/png;base64,${base64Image}`
                                }
                            }
                        ]
                    }
                ],
                max_tokens: settings.vision.maxTokens,
                temperature: settings.vision.temperature
            }, {
                timeout: 600000 // 10 minutes for laptop CPU processing
            });

            return response.data.choices[0].message.content.trim();
        } catch (err) {
            console.error(`[Vision] Analysis Error:`, err.message);
            throw err;
        } finally {
            this.isAnalyzing = false;
            this.resetShutdownTimer();
        }
    }
}

module.exports = new VisionService();
