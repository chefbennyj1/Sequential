const path = require('path');
const fs = require('fs');
const mime = require('mime-types');
const streamVideo = require('../ffmpeg/streamVideo.js');
const MediaService = require('../services/MediaService.js');
const SceneService = require('../services/SceneService.js');
const ffmpeg = require('fluent-ffmpeg');

// Ensure ffmpeg path is set (adjust if your environment needs specific paths, 
// matching how reverseVideo.js or other scripts might do it, 
// but usually just require is enough if added to PATH or set globally. 
// Given reverseVideo.js sets it manually, we might need to do so here or assume it's in path for the server process.
// Let's stick to standard require first, but reverseVideo.js used local exe. 
// Let's check where ffmpeg.exe is. It is in /ffmpeg/ffmpeg.exe.
ffmpeg.setFfmpegPath(path.join(__dirname, '..', 'ffmpeg', 'ffmpeg.exe'));
ffmpeg.setFfprobePath(path.join(__dirname, '..', 'ffmpeg', 'ffprobe.exe'));

exports.serveImage = async (req, res) => {
    // Express 5: Wildcards are named. *path returns req.params.path (string or array).
    const seriesFolderName = req.params.series || "No_Overflow";
    const rawPath = req.params.path || req.params[0]; 
    const imagePath = Array.isArray(rawPath) ? rawPath.join('/') : rawPath;
    const resizeWidth = parseInt(req.query.resize, 10);

    const result = await MediaService.serveImage(imagePath, resizeWidth, seriesFolderName);

    if (result.ok) {
        res.type(result.type);
        res.sendFile(result.path);
    } else {
        res.status(result.status).send(result.message);
    }
};

exports.servePageImage = async (req, res) => {
    const { series, volume, chapter, page, file } = req.params;
    const seriesFolderName = series || "No_Overflow";

    try {
        const seriesPath = await MediaService.resolveSeriesPath(seriesFolderName);
        const newPath = path.join(seriesPath, 'Volumes', volume, chapter, page, 'assets', 'image', file);
        const oldPath = path.join(seriesPath, 'Volumes', volume, chapter, page, 'assets', file);

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

exports.streamVideo = async (req, res) => {
  const { series, volume, chapter, pageId, fileName } = req.params;
  const seriesFolderName = series || "No_Overflow";

  try {
    const seriesPath = await MediaService.resolveSeriesPath(seriesFolderName);
    const newPath = path.join(seriesPath, 'Volumes', volume, chapter, pageId, 'assets', 'video', fileName);
    
    if (fs.existsSync(newPath)) {
        const inputFilePath = newPath;
        console.log(`API - Streaming video request for: ${inputFilePath}`);

        const format = path.extname(fileName).slice(1) || 'mp4'; 
        const mimeType = mime.lookup(fileName) || `video/${format}`;

        res.writeHead(200, {
            'Content-Type': mimeType,
            'Accept-Ranges': 'bytes', 
        });

        await streamVideo(inputFilePath, { format, height: null }, res); 
    } else {
        return res.status(404).send('File not found');
    }
  } catch (error) {
    console.error(`API - Error streaming video:`, error);
    if (!res.headersSent) {
      res.status(500).send('Error streaming video');
    } else {
      res.end();
    }
  }
};

exports.servePublicVideo = async (req, res) => {
  const { series, volume, chapter, pageId, fileName } = req.params;
  const seriesFolderName = series || "No_Overflow";

  try {
    const seriesPath = await MediaService.resolveSeriesPath(seriesFolderName);
    const newPath = path.join(seriesPath, 'Volumes', volume, chapter, pageId, 'assets', 'video', fileName);
    
    const sendFileCallback = (err) => {
        if (err) {
            console.error(`Error streaming file:`, err);
            if (!res.headersSent) {
                res.status(500).send('Error sending file');
            }
        }
    };

    if (fs.existsSync(newPath)) {
        res.sendFile(newPath, sendFileCallback);
    } else {
        return res.status(404).send('File not found');
    }
  } catch (err) {
      console.error("Error in servePublicVideo:", err);
      res.status(500).send("Server Error");
  }
};

exports.servePublicAudio = async (req, res) => {
  const { series, volume, chapter, pageId, fileName } = req.params;
  const seriesFolderName = series || "No_Overflow";

  try {
    const seriesPath = await MediaService.resolveSeriesPath(seriesFolderName);
    const pagePath = path.join(seriesPath, 'Volumes', volume, chapter, pageId, 'assets', 'audio', fileName);
    const globalPath = path.join(seriesPath, 'assets', 'audio', fileName);
    
    const sendFileCallback = (err) => {
        if (err) {
            console.error(`Error serving audio file:`, err);
            if (!res.headersSent) {
                res.status(500).send('Error sending file');
            }
        }
    };

    if (fs.existsSync(pagePath)) {
        res.sendFile(pagePath, sendFileCallback);
    } else if (fs.existsSync(globalPath)) {
        res.sendFile(globalPath, sendFileCallback);
    } else {
        return res.status(404).send('File not found');
    }
  } catch (err) {
      console.error("Error in servePublicAudio:", err);
      res.status(500).send("Server Error");
  }
};

exports.getScene = async (req, res) => {
  const { series, volume, chapter, pageId } = req.params;
  const seriesFolderName = series || "No_Overflow";
  const result = await SceneService.getSceneByPageId(volume, chapter, pageId, seriesFolderName);

  if (result.ok) {
    res.json(result);
  } else {
    res.status(result.status).json({ ok: false, message: result.message });
  }
};

exports.getMedia = async (req, res) => {
  const { series, volume, chapter, pageId } = req.params;
  const seriesFolderName = series || "No_Overflow";
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

exports.serveVideoThumbnail = async (req, res) => {
    const { series, volume, chapter, pageId, fileName } = req.params;
    const seriesFolderName = series || "No_Overflow";

    try {
        const seriesPath = await MediaService.resolveSeriesPath(seriesFolderName);
        const videoPath = path.join(seriesPath, 'Volumes', volume, chapter, pageId, 'assets', 'video', fileName);
        
        const cacheDir = path.join(__dirname, '..', 'cache', 'thumbnails');
        const thumbnailName = `${seriesFolderName}_${volume}_${chapter}_${pageId}_${fileName}.png`;
        const thumbnailPath = path.join(cacheDir, thumbnailName);

        if (!fs.existsSync(videoPath)) {
            return res.status(404).send("Video not found");
        }

        if (fs.existsSync(thumbnailPath)) {
            return res.sendFile(thumbnailPath);
        }

        // Ensure cache dir exists
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }

        // Generate thumbnail
        ffmpeg(videoPath)
            .screenshots({
                timestamps: ['5%'], // Take a screenshot at 5% into the video
                filename: thumbnailName,
                folder: cacheDir,
                size: '320x?' // Resize to 320px width, auto height
            })
            .on('end', () => {
                console.log(`Thumbnail generated: ${thumbnailPath}`);
                res.sendFile(thumbnailPath);
            })
            .on('error', (err) => {
                console.error("Error generating thumbnail:", err);
                res.status(500).send("Error generating thumbnail");
            });
    } catch (err) {
        console.error("Error in serveVideoThumbnail:", err);
        res.status(500).send("Server Error");
    }
};

