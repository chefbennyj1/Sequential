const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const GlobalSettings = require("../models/GlobalSettings");
const { decrypt } = require("../utils/encryption");

class GeminiVisionService {
    constructor() {
        this.modelName = "gemini-1.5-flash"; 
    }

    async getClient() {
        let apiKey = process.env.GEMINI_API_KEY;

        try {
            const settings = await GlobalSettings.findOne({ key: "main" });
            if (settings && settings.vision && settings.vision.apiKey) {
                const decrypted = decrypt(settings.vision.apiKey);
                if (decrypted) apiKey = decrypted;
            }
        } catch (e) {
            console.error("[GeminiVision] Failed to fetch API key from DB:", e.message);
        }

        if (!apiKey) {
            throw new Error("Gemini API Key is missing. Please configure it in the Dashboard Settings.");
        }

        return new GoogleGenerativeAI(apiKey);
    }

    async generateImageHash(imagePath) {
        try {
            const buffer = await sharp(imagePath)
                .resize(256, 256, { fit: 'inside' })
                .grayscale()
                .toBuffer();
            
            return crypto.createHash('md5').update(buffer).digest('hex');
        } catch (err) {
            console.error(`[GeminiVision] Hash Generation Error:`, err.message);
            return null;
        }
    }

    async analyzeImage(imagePath, customPrompt = null, context = "") {
        try {
            const genAI = await this.getClient();
            const settings = await GlobalSettings.findOne({ key: "main" });
            
            // Dynamically fetch the user's preferred model, fallback to the 2026 stable default
            const targetModel = (settings && settings.vision && settings.vision.modelName) 
                ? settings.vision.modelName 
                : "gemini-flash-latest";

            const model = genAI.getGenerativeModel({ 
                model: targetModel 
            });
            
            // Build the final prompt with context injection
            let finalPrompt = "";
            if (context) {
                finalPrompt += context + "\n\n";
            }
            
            finalPrompt += customPrompt || (settings?.vision?.systemPrompt) || `Analyze this comic panel in a "Seinen Noir" style (like Ghost in the Shell or Arcane).
            Return a JSON object with:
            - description: A detailed 2-3 sentence description of the action and atmosphere.
            - alt: A concise summary for accessibility.
            - hashtags: An array of 5-7 thematic hashtags including #NoOverflow.`;

            // Detect MIME type based on extension
            const ext = path.extname(imagePath).toLowerCase().replace('.', '');
            const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;

            const imageBuffer = fs.readFileSync(imagePath);
            const imageParts = [
                {
                    inlineData: {
                        data: imageBuffer.toString("base64"),
                        mimeType: mimeType || "image/png", 
                    },
                },
            ];

            console.log(`[GeminiVision] Sending ${path.basename(imagePath)} to ${targetModel}...`);
            const result = await model.generateContent([finalPrompt, ...imageParts]);
            const response = await result.response;
            const text = response.text();
            
            try {
                // Try to find JSON block in the response
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                const jsonStr = jsonMatch ? jsonMatch[0] : text;
                return JSON.parse(jsonStr);
            } catch (e) {
                console.error("[GeminiVision] Failed to parse JSON response:", text);
                return {
                    description: text,
                    alt: text,
                    hashtags: ["#NoOverflow"]
                };
            }
        } catch (err) {
            console.error(`[GeminiVision] Analysis Error:`, err.message);
            throw err;
        }
    }
}

module.exports = new GeminiVisionService();

