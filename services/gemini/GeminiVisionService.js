const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const GlobalSettings = require("../../models/GlobalSettings");
const { decrypt } = require("../../utils/encryption");

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
            if (!fs.existsSync(imagePath)) return null;
            const stats = fs.statSync(imagePath);
            if (stats.size === 0) {
                console.warn(`[GeminiVision] Skipping 0-byte file: ${imagePath}`);
                return null;
            }

            // Logging for native crash diagnosis
            console.log(`[GeminiVision] [Hash] Starting Sharp process for: ${path.basename(imagePath)}`);
            
            const buffer = await sharp(imagePath)
                .resize(256, 256, { fit: 'inside' })
                .grayscale()
                .toBuffer();
            
            console.log(`[GeminiVision] [Hash] Sharp finished for: ${path.basename(imagePath)}`);
            return crypto.createHash('md5').update(buffer).digest('hex');
        } catch (err) {
            console.error(`[GeminiVision] Hash Generation Error for ${imagePath}:`, err.message);
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
            // Add a 60-second timeout to the AI request to prevent hanging
            const result = await model.generateContent([finalPrompt, ...imageParts], { timeout: 60000 });
            const response = await result.response;
            const text = response.text();
            
            console.log(`[GeminiVision] Raw AI Response for ${path.basename(imagePath)}:`, text);

            try {
                // Try to find JSON block in the response
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                const jsonStr = jsonMatch ? jsonMatch[0] : text;
                const parsed = JSON.parse(jsonStr);
                
                console.log(`[GeminiVision] Successfully parsed JSON for ${path.basename(imagePath)}:`, JSON.stringify(parsed, null, 2));
                return parsed;
            } catch (e) {
                console.error(`[GeminiVision] Failed to parse JSON response for ${path.basename(imagePath)}:`, e.message);
                console.error("[GeminiVision] Problematic response text:", text);
                return {
                    description: text.substring(0, 1000),
                    alt: text.substring(0, 200),
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

