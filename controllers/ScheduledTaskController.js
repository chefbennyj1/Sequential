const LibraryRoot = require('../models/LibraryRoot');
const { scanLibrary } = require('../api/scanLibrary');
const fs = require('fs');
const path = require('path');

class ScheduledTaskController {
    
    async getLibraryRoots(req, res) {
        try {
            const roots = await LibraryRoot.find({ name: { $ne: "Internal Library" } }).sort({ name: 1 });
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
            const root = await LibraryRoot.findById(req.params.id);
            if (root && root.name === "Internal Library") {
                return res.status(403).json({ ok: false, message: "Cannot delete internal system root." });
            }
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
            const io = req.app.locals.io;
            const results = await scanLibrary(io);
            res.json({ ok: true, message: "Scan complete.", results });
        } catch (e) {
            console.error("Manual Scan Error:", e);
            res.status(500).json({ ok: false, message: "Scan failed: " + e.message });
        }
    }
}

module.exports = new ScheduledTaskController();
