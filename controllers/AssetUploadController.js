const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const multer = require("multer");
const { resolveSeriesPath } = require("../services/MediaService");
const Volume = require("../models/Volume");
const Series = require("../models/Series");
const VolumeService = require("../services/VolumeService");

// Configure Multer for temporary storage
const upload = multer({ dest: path.join(__dirname, "..", ".gemini", "tmp") });

async function getSeriesFolderName(identifier) {
  if (!identifier) return null;
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    try {
      const series = await Series.findById(identifier);
      if (series) return series.folderName;
    } catch (e) { console.error("Error resolving series ID:", e); }
  }
  try {
    const seriesByFolder = await Series.findOne({ folderName: identifier });
    if (seriesByFolder) return seriesByFolder.folderName;
  } catch (e) { }
  return identifier;
}

async function findVolumeId(volumeFolderName, seriesFolderName) {
  if (!seriesFolderName) throw new Error("seriesFolderName is required for findVolumeId");
  const seriesDoc = await Series.findOne({ folderName: seriesFolderName });
  const query = { volumePath: new RegExp(`[\\/]${volumeFolderName}$`) };
  if (seriesDoc) query.series = seriesDoc._id;
  
  const vol = await Volume.findOne(query);
  return vol ? vol._id : null;
}

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
        await VolumeService.syncSinglePage(volumeId, chapter, pageId, seriesFolderName);
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

exports.uploadMiddleware = upload.single("asset");
