const GlobalSettings = require('../models/GlobalSettings');
const { encrypt, decrypt } = require('../utils/encryption');

exports.getGlobalSettings = async (req, res) => {
    try {
        let settings = await GlobalSettings.findOne({ key: "main" });
        if (!settings) {
            settings = new GlobalSettings({ key: "main" });
            await settings.save();
        }

        // Mask the API key for the response
        const settingsObj = settings.toObject();
        if (settingsObj.vision && settingsObj.vision.apiKey) {
            const decrypted = decrypt(settingsObj.vision.apiKey);
            if (decrypted) {
                settingsObj.vision.apiKey = decrypted.substring(0, 4) + "****" + decrypted.substring(decrypted.length - 4);
            }
        }

        res.json({ ok: true, settings: settingsObj });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
};

exports.updateGlobalSettings = async (req, res) => {
    const { settings } = req.body;
    try {
        // If an API key is provided and it's NOT the masked version, encrypt it
        if (settings.vision && settings.vision.apiKey && !settings.vision.apiKey.includes('****')) {
            settings.vision.apiKey = encrypt(settings.vision.apiKey);
        } else if (settings.vision && settings.vision.apiKey && settings.vision.apiKey.includes('****')) {
            // It's the masked version, don't update the field
            delete settings.vision.apiKey;
        }

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
