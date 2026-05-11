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

exports.forceVisionFlag = async (req, res) => {
    const Volume = require('../models/Volume');
    try {
        console.log("[Vision] Forcing DescriptionUpdateRequired flag on all image panels...");
        
        // We have to iterate and update since it's a nested array of mixed objects
        const volumes = await Volume.find({});
        let updatedCount = 0;

        for (const vol of volumes) {
            let volChanged = false;
            for (const chap of vol.chapters) {
                for (const page of chap.pages) {
                    if (page.mediaData && page.mediaData.media) {
                        page.mediaData.media.forEach(m => {
                            if (m.type === 'image' && m.fileName) {
                                m.DescriptionUpdateRequired = true;
                                updatedCount++;
                                volChanged = true;
                            }
                        });
                    }
                }
            }
            if (volChanged) {
                vol.markModified('chapters');
                await vol.save();
            }
        }

        res.json({ ok: true, message: `Flagged ${updatedCount} panels for AI analysis.` });
    } catch (err) {
        console.error("[Vision] Force flag error:", err);
        res.status(500).json({ ok: false, message: err.message });
    }
};
