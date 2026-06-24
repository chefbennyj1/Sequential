const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const multer = require("multer");
const { resolveSeriesPath } = require("../services/MediaService");
const { getSeriesFolderName, findVolumeId } = require('../services/HierarchyLookupService');
const Volume = require("../models/Volume");
const Series = require("../models/Series");
const VolumeService = require("../services/VolumeService");
const sharp = require("sharp");
const GeminiVisionService = require("../services/gemini/GeminiVisionService");

// Configure Multer for temporary storage
const upload = multer({ dest: path.join(__dirname, "..", ".gemini", "tmp") });

exports.uploadAsset = async (req, res) => {
  const { series, volume, chapter, pageId, panel, scope } = req.body;
  const file = req.file;

  if (!volume || !chapter || !pageId || !panel || !file) {
    return res
      .status(400)
      .json({ ok: false, message: "Missing required fields or file" });
  }

  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const volumesDir = path.join(seriesPath, "Volumes");

    let assetsDir;
    let pageJsonPath;
    let updatePageJson = true;

    if (scope === 'volume') {
      assetsDir = path.join(volumesDir, volume, 'assets');
      updatePageJson = false;
    } else {
      const pageDir = path.join(volumesDir, volume, chapter, pageId);
      if (!fs.existsSync(pageDir)) {
        return res.status(404).json({ ok: false, message: "Page not found" });
      }
      assetsDir = path.join(pageDir, 'assets');
      pageJsonPath = path.join(pageDir, "page.json");
    }

    const isImage = file.mimetype.startsWith("image/");
    let assetType = "unknown";
    let subFolder = "";

    if (isImage) { assetType = "image"; subFolder = "image"; }
    else { return res.status(400).json({ ok: false, message: "Unsupported file type. Only images are allowed." }); }

    const targetDir = path.join(assetsDir, subFolder);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const targetPath = path.join(targetDir, file.originalname);
    fs.copyFileSync(file.path, targetPath);
    fs.unlinkSync(file.path);

    if (updatePageJson && panel !== 'upload') {
      let pageData = { media: [], header: {} };
      if (fs.existsSync(pageJsonPath)) {
        pageData = JSON.parse(fs.readFileSync(pageJsonPath, "utf8"));
      }

      const existingIndex = pageData.media.findIndex((m) => m.panel === panel);
      const newEntry = { panel: panel, type: assetType, fileName: file.originalname };

      if (existingIndex > -1) pageData.media[existingIndex] = { ...pageData.media[existingIndex], ...newEntry };
      else pageData.media.push(newEntry);

      fs.writeFileSync(pageJsonPath, JSON.stringify(pageData, null, 2));

      const volumeId = await findVolumeId(volume, seriesFolderName);
      if (volumeId) {
        // Fire-and-forget: the filesystem is the source of truth.
        // The DB cache update runs in the background so the client is not blocked.
        VolumeService.syncSinglePage(volumeId, chapter, pageId, seriesFolderName)
          .catch(err => console.error('[AssetUpload] Background DB sync failed:', err.message));
      }
    }
    res.json({ ok: true, message: "Asset uploaded.", assetPath: targetPath });
  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ ok: false, message: "Failed to upload asset" });
  }
};

exports.getAssets = async (req, res) => {
  const { series, volume, chapter, pageId, type } = req.params;
  const scope = req.query.scope || 'page';

  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const volumesDir = path.join(seriesPath, "Volumes");
    let assetsDir;

    if (scope === 'series') {
      assetsDir = path.join(volumesDir, '..', 'assets', type);
    } else if (scope === 'volume') {
      assetsDir = path.join(volumesDir, volume, 'assets', type);
    } else {
      assetsDir = path.join(volumesDir, volume, chapter, pageId, "assets", type);
    }

    if (!assetsDir || !fs.existsSync(assetsDir)) return res.json({ ok: true, files: [] });

    const files = fs.readdirSync(assetsDir).filter(file => fs.statSync(path.join(assetsDir, file)).isFile()).map(file => {
      const stats = fs.statSync(path.join(assetsDir, file));
      return { name: file, mtime: stats.mtimeMs };
    });
    res.json({ ok: true, files });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Failed to list assets" });
  }
};

exports.flipAsset = async (req, res) => {
  const { series, volume, chapter, pageId, panel, fileName, direction } = req.body;
  console.log(`[AssetUploadController] Flip request: ${panel} (${direction}) for ${fileName} in ${pageId}`);

  if (!series || !volume || !chapter || !pageId || !panel || !fileName || !direction) {
    return res.status(400).json({ ok: false, message: "Missing required fields" });
  }

  try {
    const seriesFolderName = await getSeriesFolderName(series);
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const pageDir = path.join(seriesPath, "Volumes", volume, chapter, pageId);
    const assetPath = path.join(pageDir, "assets", "image", fileName);
    const pageJsonPath = path.join(pageDir, "page.json");

    console.log(`[AssetUploadController] Resolved path: ${assetPath}`);

    if (!fs.existsSync(assetPath)) {
      console.error(`[AssetUploadController] Asset not found at: ${assetPath}`);
      return res.status(404).json({ ok: false, message: "Asset not found" });
    }

    // Flip the image using sharp
    const buffer = fs.readFileSync(assetPath);
    let sharpInstance = sharp(buffer);

    if (direction === 'horizontal') {
      sharpInstance = sharpInstance.flop();
    } else if (direction === 'vertical') {
      sharpInstance = sharpInstance.flip();
    } else {
      return res.status(400).json({ ok: false, message: "Invalid flip direction" });
    }

    const outputBuffer = await sharpInstance.toBuffer();
    fs.writeFileSync(assetPath, outputBuffer);
    console.log(`[AssetUploadController] Successfully flipped image: ${fileName}`);

    // Update page.json with new hash to keep vision in sync
    if (fs.existsSync(pageJsonPath)) {
      const pageData = JSON.parse(fs.readFileSync(pageJsonPath, "utf8"));
      // Flexible matching for panel (handle dots)
      const sanitizedPanel = panel.startsWith('.') ? panel : `.${panel}`;
      const mediaEntry = pageData.media?.find(m => (m.panel === panel || m.panel === sanitizedPanel || m.panel === panel.replace('.', '')) && m.fileName === fileName);
      
      if (mediaEntry) {
        console.log(`[AssetUploadController] Scheduling background hash + sync for panel: ${mediaEntry.panel}`);
        // Fire-and-forget: hash regeneration and DB sync run in the background.
        (async () => {
          try {
            const newHash = await GeminiVisionService.generateImageHash(assetPath);
            if (newHash) {
              mediaEntry.imageHash = newHash;
              fs.writeFileSync(pageJsonPath, JSON.stringify(pageData, null, 2));
              const volumeId = await findVolumeId(volume, seriesFolderName);
              if (volumeId) {
                await VolumeService.syncSinglePage(volumeId, chapter, pageId, seriesFolderName);
              }
            }
          } catch (bgErr) {
            console.error('[AssetUpload] Background hash/sync failed after flip:', bgErr.message);
          }
        })();
      } else {
        console.warn(`[AssetUploadController] No media entry found in page.json for panel: ${panel}`);
      }
    }

    res.json({ ok: true, message: `Image flipped ${direction}` });
  } catch (err) {
    console.error("[AssetUploadController] Flip Error:", err);
    res.status(500).json({ ok: false, message: "Failed to flip image: " + err.message });
  }
};

exports.uploadMiddleware = upload.single("asset");
