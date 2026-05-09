const GlobalSettings = require('../models/GlobalSettings');

exports.getGlobalSettings = async (req, res) => {
    try {
        let settings = await GlobalSettings.findOne({ key: "main" });
        if (!settings) {
            settings = new GlobalSettings({ key: "main" });
            await settings.save();
        }
        res.json({ ok: true, settings });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
};

exports.updateGlobalSettings = async (req, res) => {
    const { settings } = req.body;
    try {
        const updated = await GlobalSettings.findOneAndUpdate(
            { key: "main" },
            { $set: settings },
            { upsert: true, new: true }
        );
        res.json({ ok: true, settings: updated });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
};

exports.triggerModelDownload = async (req, res) => {
    const { type } = req.body; // 'model' or 'mmproj'
    const DownloadService = require('../services/DownloadService');
    const path = require('path');

    const urls = {
        model: "https://huggingface.co/bartowski/google_gemma-3-4b-it-GGUF/resolve/main/google_gemma-3-4b-it-Q4_K_M.gguf",
        mmproj: "https://huggingface.co/bartowski/google_gemma-3-4b-it-GGUF/resolve/main/mmproj-google_gemma-3-4b-it-f16.gguf"
    };

    const filenames = {
        model: "google_gemma-3-4b-it-Q4_K_M.gguf",
        mmproj: "mmproj-google_gemma-3-4b-it-f16.gguf"
    };

    if (!urls[type]) return res.status(400).json({ ok: false, message: "Invalid model type" });

    const destPath = path.join(__dirname, '..', 'ai_models', 'gemma', filenames[type]);
    const io = req.app.locals.io;

    try {
        // Run in background
        DownloadService.downloadFile(urls[type], destPath, type, io)
            .catch(err => console.error(`[Downloader] Background error for ${type}:`, err.message));

        res.json({ ok: true, message: `Download started for ${type}`, filename: filenames[type], path: `./ai_models/gemma/${filenames[type]}` });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
};
