const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const globalSettingsSchema = new Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        default: "main"
    },
    vision: {
        enabled: { type: Boolean, default: false },
        apiKey: { type: String, default: "" }, // Encrypted
        modelName: { type: String, default: "gemini-1.5-flash" },
        systemPrompt: { 
            type: String, 
            default: "Describe the action, character expressions, lighting, and cinematic composition of this panel in one clear, concise sentence. Return ONLY the description. Do NOT include any introductory text, conversational filler, or markdown formatting like asterisks." 
        },
        maxTokens: { type: Number, default: 100 },
        temperature: { type: Number, default: 0.2 },
        autoScanOnSave: { type: Boolean, default: true }
    }
}, { timestamps: true });

module.exports = mongoose.model('GlobalSettings', globalSettingsSchema);
