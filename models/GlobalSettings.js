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
        binaries: {
            win32: { type: String, default: "" },
            linux: { type: String, default: "" },
            darwin: { type: String, default: "" }
        },
        modelPath: { type: String, default: "" },      // e.g. /ai_models/gemma/gemma-3-4b.gguf
        mmprojPath: { type: String, default: "" },     // e.g. /ai_models/gemma/mmproj-gemma-3-4b.gguf
        systemPrompt: { 
            type: String, 
            default: "You are a professional comic book screenplay consultant. Describe the action, character expressions, lighting, and cinematic composition of this panel in one clear, concise sentence." 
        },
        maxTokens: { type: Number, default: 100 },
        temperature: { type: Number, default: 0.2 },
        autoScanOnSave: { type: Boolean, default: true }
    }
}, { timestamps: true });

module.exports = mongoose.model('GlobalSettings', globalSettingsSchema);
