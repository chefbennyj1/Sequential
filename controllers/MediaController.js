const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const mime = require('mime-types');
const MediaService = require('../services/MediaService.js');
const SceneService = require('../services/SceneService.js');

exports.serveImage = async (req, res) => {
    // Express 5: Wildcards are named. *path returns req.params.path (string or array).
    const { series } = req.params;
    const rawPath = req.params.path || req.params[0]; 
    const imagePath = Array.isArray(rawPath) ? rawPath.join('/') : rawPath;
    const resizeWidth = parseInt(req.query.resize, 10);

    try {
        const seriesFolderName = await (async () => {
            if (series && mongoose.Types.ObjectId.isValid(series)) {
                const Series = require('../models/Series');
                const doc = await Series.findById(series);
                return doc ? doc.folderName : null;
            }
            return series;
        })();

        if (!seriesFolderName) return res.status(400).send("Series folder name is required");

        const result = await MediaService.serveImage(imagePath, resizeWidth, seriesFolderName);
        if (result.ok) {
            res.type(result.type);
            res.sendFile(result.path);
        } else {
            res.status(result.status).send(result.message);
        }
    } catch (err) {
        console.error("Error in serveImage:", err);
        res.status(500).send("Server Error");
    }
};

exports.servePageImage = async (req, res) => {
    const { series, volume, chapter, page, pageId, file } = req.params;
    const actualPage = page || pageId;
    
    try {
        const seriesFolderName = await (async () => {
            if (series && mongoose.Types.ObjectId.isValid(series)) {
                const Series = require('../models/Series');
                const doc = await Series.findById(series);
                return doc ? doc.folderName : null;
            }
            return series || "No_Overflow";
        })();

        if (!seriesFolderName) return res.status(400).send("Series folder name is required");

        const seriesPath = await MediaService.resolveSeriesPath(seriesFolderName);
        const newPath = path.join(seriesPath, 'Volumes', volume, chapter, actualPage, 'assets', 'image', file);
        const oldPath = path.join(seriesPath, 'Volumes', volume, chapter, actualPage, 'assets', file);

        console.log(`[servePageImage] Attempting to serve: ${file}`);
        console.log(`  > New Path: ${newPath}`);
        console.log(`  > Old Path: ${oldPath}`);

        const targetPath = fs.existsSync(newPath) ? newPath : fs.existsSync(oldPath) ? oldPath : null;

        if (targetPath) {
            const type = mime.lookup(targetPath) || 'application/octet-stream';
            res.type(type);
            res.sendFile(targetPath, (err) => {
                if (err) {
                    console.error(`Error streaming file: ${targetPath}`, err);
                    if (!res.headersSent) {
                        res.status(500).send('Error sending file');
                    }
                }
            });
        } else {
            res.status(404).send('File not found');
        }
    } catch (err) {
        console.error("Error in servePageImage:", err);
        res.status(500).send("Server Error");
    }
};

exports.getScene = async (req, res) => {
  const { series, volume, chapter, pageId } = req.params;
  const seriesFolderName = series;
  if (!seriesFolderName) return res.status(400).json({ ok: false, message: "Series folder name is required" });
  const result = await SceneService.getSceneByPageId(volume, chapter, pageId, seriesFolderName);

  if (result.ok) {
    res.json(result);
  } else {
    res.status(result.status).json({ ok: false, message: result.message });
  }
};

exports.getMedia = async (req, res) => {
  const { series, volume, chapter, pageId } = req.params;
  const seriesFolderName = series;
  if (!seriesFolderName) return res.status(400).json({ ok: false, message: "Series folder name is required" });
  const result = await MediaService.getMediaItemsByPageId(volume, chapter, pageId, seriesFolderName);

  if (result.ok) {
    res.json(result);
  } else {
    res.status(result.status).json({ ok: false, message: result.message });
  }
};

exports.getLandingPageImages = async (req, res) => {
  const imagesDir = path.join(__dirname, '..', 'views', 'landingPage', 'images');
  
  try {
    const files = await fs.promises.readdir(imagesDir);
    // Filter for image files (png, jpg, jpeg, gif, webp)
    const imageFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext);
    });
    
    res.json({ ok: true, images: imageFiles });
  } catch (error) {
    console.error('Error reading landing page images:', error);
    res.status(500).json({ ok: false, message: 'Failed to retrieve images' });
  }
};