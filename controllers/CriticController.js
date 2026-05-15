const ScriptService = require("../services/ScriptService");
const GeminiCriticService = require("../services/gemini/GeminiCriticService");
const Volume = require("../models/Volume");
const fs = require("fs");
const path = require("path");

exports.analyzeVolume = async (req, res) => {
    const { series, volumeId } = req.params;

    try {
        const volumeDoc = await Volume.findById(volumeId).lean();
        if (!volumeDoc) return res.status(404).json({ ok: false, message: "Volume not found" });

        const volumeFolderName = path.basename(volumeDoc.volumePath);
        
        // 1. Generate the script string
        // We reuse ScriptService.generateVolumeScript but we need the raw string, not the file write.
        // Actually ScriptService.generateVolumeScript writes to disk. 
        // I'll manually call the formatted components to get a string.
        
        const seriesId = volumeDoc.series;
        // We need to resolve volume folder name correctly
        const scriptData = await ScriptService.generateVolumeScript(seriesId, volumeFolderName);
        
        // Read the generated file back
        const scriptText = fs.readFileSync(scriptData.outputPath, 'utf8');

        // 2. Send to Gemini
        const critique = await GeminiCriticService.analyzeStory(scriptText);

        res.json({ ok: true, critique });

    } catch (err) {
        console.error("[CriticController] Analysis error:", err);
        res.status(500).json({ ok: false, message: err.message });
    }
};
