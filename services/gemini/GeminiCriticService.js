const { GoogleGenerativeAI } = require("@google/generative-ai");
const GlobalSettings = require("../../models/GlobalSettings");
const { decrypt } = require("../../utils/encryption");

class GeminiCriticService {
    async getClient() {
        let apiKey = process.env.GEMINI_API_KEY;
        try {
            const settings = await GlobalSettings.findOne({ key: "main" });
            if (settings && settings.vision && settings.vision.apiKey) {
                const decrypted = decrypt(settings.vision.apiKey);
                if (decrypted) apiKey = decrypted;
            }
        } catch (e) {
            console.error("[GeminiCritic] Failed to fetch API key:", e.message);
        }

        if (!apiKey) throw new Error("Gemini API Key is missing.");
        return new GoogleGenerativeAI(apiKey);
    }

    async analyzeStory(script) {
        try {
            const genAI = await this.getClient();
            const settings = await GlobalSettings.findOne({ key: "main" });
            const targetModel = (settings?.vision?.modelName) || "gemini-flash-latest";

            const model = genAI.getGenerativeModel({ model: targetModel });

            const systemPrompt = `You are the "Sequential Story Critic," a world-class narrative consultant specializing in Seinen Noir and Cyberpunk manga/comics.
            
            Your task is to analyze the provided Screenplay Script of a comic volume.
            Provide a professional, constructive, and slightly "noir-hardened" critique.
            
            Focus on:
            1. Pacing & Flow: Is the transition between pages and chapters effective?
            2. Character Voice: Are the character voices distinct and consistent?
            3. Thematic Consistency: Does the dialogue and action align with the "No Overflow" cyberpunk setting?
            4. Strengths: What works exceptionally well?
            5. Blind Spots: Point out logic holes, info-dumps, or weak character motivations.
            
            Format your response in Markdown with clear sections. Be direct and avoid fluff.`;

            const prompt = `${systemPrompt}\n\nHere is the volume script:\n\n${script}`;

            console.log(`[GeminiCritic] Analyzing volume story with ${targetModel}...`);
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        } catch (err) {
            console.error(`[GeminiCritic] Analysis Error:`, err.message);
            throw err;
        }
    }
}

module.exports = new GeminiCriticService();
