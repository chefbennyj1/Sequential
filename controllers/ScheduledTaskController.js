const LibraryRoot = require('../models/LibraryRoot');
const { scanLibrary } = require('../api/scanLibrary');
const fs = require('fs');
const path = require('path');

class ScheduledTaskController {
    
    async getLibraryRoots(req, res) {
        try {
            const roots = await LibraryRoot.find().sort({ name: 1 });
            res.json({ ok: true, roots });
        } catch (e) {
            res.status(500).json({ ok: false, message: e.message });
        }
    }

    async addLibraryRoot(req, res) {
        const { name, path: rootPath } = req.body;

        if (!name || !rootPath) {
            return res.status(400).json({ ok: false, message: "Name and Path are required." });
        }

        if (!fs.existsSync(rootPath)) {
            return res.status(400).json({ ok: false, message: "Path does not exist on server." });
        }

        try {
            const newRoot = new LibraryRoot({ name, path: rootPath });
            await newRoot.save();
            res.json({ ok: true, message: "Library Root added.", root: newRoot });
        } catch (e) {
            // Check for duplicate key error (code 11000)
            if (e.code === 11000) {
                return res.status(400).json({ ok: false, message: "Name or Path already exists." });
            }
            res.status(500).json({ ok: false, message: e.message });
        }
    }

    async deleteLibraryRoot(req, res) {
        try {
            await LibraryRoot.findByIdAndDelete(req.params.id);
            res.json({ ok: true, message: "Library Root removed." });
        } catch (e) {
            res.status(500).json({ ok: false, message: e.message });
        }
    }

    async triggerScan(req, res) {
        try {
            // Run scan (this might take time, so we might want to just start it and return 'started')
            // For now, we await it to show results immediately.
            const results = await scanLibrary();
            res.json({ ok: true, message: "Scan complete.", results });
        } catch (e) {
            console.error("Manual Scan Error:", e);
            res.status(500).json({ ok: false, message: "Scan failed: " + e.message });
        }
    }
}

module.exports = new ScheduledTaskController();
