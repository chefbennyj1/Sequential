const express = require('express');
const path = require('path');
const fs = require('fs');
const Series = require('../models/Series');
const LibraryRoot = require('../models/LibraryRoot');

const router = express.Router();

// Middleware to resolve series and serve content
// URL Pattern: /library/:seriesTitle/*
router.get('/:seriesTitle/*relativePath', async (req, res, next) => {
    try {
        const seriesTitle = req.params.seriesTitle;
        // Express 5: Wildcards must be named. Result might be array of segments or string.
        const rawParam = req.params.relativePath;
        const relativePath = Array.isArray(rawParam) ? rawParam.join('/') : rawParam;

        // 1. Look up Series by folderName (preferred for URL) or title
        const series = await Series.findOne({ 
            $or: [
                { folderName: seriesTitle },
                { title: seriesTitle }
            ]
        }).populate('libraryRoot');

        if (!series) {
            return res.status(404).send('Series not found');
        }

        // 2. Determine Root Path
        let rootPath = "";
        
        if (series.sourcePath) {
             // Explicit override takes precedence
            rootPath = series.sourcePath;
        } else if (series.libraryRoot && series.libraryRoot.path) {
            // Use registered Library Root
            // The structure is: RootPath + SeriesFolderName
            rootPath = path.join(series.libraryRoot.path, series.folderName);
        } else {
            // Fallback to legacy internal path if migration isn't 100%
            rootPath = path.join(__dirname, '..', 'Library', series.folderName);
        }

        // 3. Construct Full Path
        // We decodeURIComponent to handle spaces/special chars in URL
        const decodedRelative = decodeURIComponent(relativePath);
        const absolutePath = path.join(rootPath, decodedRelative);

        // 4. Security Check: Prevent Directory Traversal
        // Ensure the resolved path starts with the intended root
        const resolvedRoot = path.resolve(rootPath);
        if (!absolutePath.startsWith(resolvedRoot)) {
            return res.status(403).send('Access Denied');
        }

        // 5. Serve File
        if (fs.existsSync(absolutePath)) {
            res.sendFile(absolutePath);
        } else {
            // If file missing, pass to next() which might be 404 handler or try static
            next();
        }

    } catch (err) {
        console.error("Content Route Error:", err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
