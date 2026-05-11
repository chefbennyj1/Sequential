require('dotenv').config();
const axios = require('axios');

async function debugGemini() {
    const apiKey = process.env.GEMINI_API_KEY;
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const response = await axios.get(url);
        
        if (response.data && response.data.models) {
            console.log("[Diagnostic] Total models found:", response.data.models.length);
            const generatingModels = response.data.models
                .filter(m => m.supportedGenerationMethods.includes('generateContent'))
                .map(m => m.name);
            
            console.log("[Diagnostic] Models supporting 'generateContent':");
            generatingModels.forEach(name => console.log(`  - ${name}`));
        }
    } catch (err) {
        console.error("[FAIL]", err.message);
    }
}

debugGemini();
