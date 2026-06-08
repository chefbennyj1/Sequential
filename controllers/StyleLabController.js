const Series = require('../models/Series');
const path = require('path');
const fs = require('fs');
const { resolveSeriesPath } = require('../services/MediaService');
const multer = require('multer');

// Configure Multer for temporary storage
const upload = multer({ dest: path.join(__dirname, "..", ".gemini", "tmp") });

class StyleLabController {
    /**
     * GET settings for a series
     */
    static async getSettings(req, res) {
        const { seriesId } = req.params;
        try {
            const series = await Series.findById(seriesId);
            if (!series) return res.status(404).json({ ok: false, message: "Series not found" });

            res.json({ ok: true, settings: series.settings || {} });
        } catch (err) {
            console.error(err);
            res.status(500).json({ ok: false, message: "Server error" });
        }
    }

    /**
     * PUT (update) settings for a series
     */
    static async updateSettings(req, res) {
        const { seriesId } = req.params;
        const { settings } = req.body;

        try {
            const series = await Series.findById(seriesId);
            if (!series) return res.status(404).json({ ok: false, message: "Series not found" });

            series.settings = { ...series.settings, ...settings };
            await series.save();

            res.json({ ok: true, message: "Settings saved", settings: series.settings });
        } catch (err) {
            console.error(err);
            res.status(500).json({ ok: false, message: "Server error" });
        }
    }

    /**
     * POST upload custom CSS file
     */
    static async uploadCss(req, res) {
        const { seriesId } = req.body;
        const file = req.file;

        if (!seriesId || !file) {
            return res.status(400).json({ ok: false, message: "Missing seriesId or file" });
        }

        try {
            const series = await Series.findById(seriesId);
            if (!series) return res.status(404).json({ ok: false, message: "Series not found" });

            const seriesPath = await resolveSeriesPath(series.folderName);
            const customDir = path.join(seriesPath, 'custom', 'styles');

            if (!fs.existsSync(customDir)) fs.mkdirSync(customDir, { recursive: true });

            const targetPath = path.join(customDir, file.originalname);
            fs.copyFileSync(file.path, targetPath);
            fs.unlinkSync(file.path);

            // Add to series settings if not already there
            if (!series.settings.customCssFiles.includes(file.originalname)) {
                series.settings.customCssFiles.push(file.originalname);
                series.markModified('settings.customCssFiles');
                await series.save();
            }

            res.json({ ok: true, message: "CSS uploaded successfully", fileName: file.originalname });
        } catch (err) {
            console.error("CSS Upload Error:", err);
            res.status(500).json({ ok: false, message: "Failed to upload CSS" });
        }
    }

    static async deleteCss(req, res) {
        const { seriesId, fileName } = req.body;

        try {
            const series = await Series.findById(seriesId);
            if (!series) return res.status(404).json({ ok: false, message: "Series not found" });

            const seriesPath = await resolveSeriesPath(series.folderName);
            const filePath = path.join(seriesPath, 'custom', 'styles', fileName);

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            series.settings.customCssFiles = series.settings.customCssFiles.filter(f => f !== fileName);
            series.markModified('settings.customCssFiles');
            await series.save();

            res.json({ ok: true, message: "CSS deleted" });
        } catch (err) {
            console.error(err);
            res.status(500).json({ ok: false, message: "Failed to delete CSS" });
        }
    }
}

StyleLabController.uploadMiddleware = upload.single("cssFile");

module.exports = StyleLabController;
