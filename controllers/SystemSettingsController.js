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
