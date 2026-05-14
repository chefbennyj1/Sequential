exports.getLandingPage = (req, res) => {
  console.log(req.session);
  console.log(req.session.id);
  res.render("reader/landing/index", { config: req.app.get('APP_CONFIG') });
};

exports.getLogin = (req, res) => {
  res.render("auth/index", { config: req.app.get('APP_CONFIG') });
};

exports.getLibrary = (req, res) => {
  res.render("reader/browser/index", { config: req.app.get('APP_CONFIG') });
};

exports.getSeriesVolumes = async (req, res) => {
  const { seriesId } = req.params;
  const Series = require('../models/Series');
  const MediaService = require('../services/MediaService');
  const path = require('path');
  const libraryRoot = path.join(__dirname, '..', 'Library');

  try {
      const series = await Series.findById(seriesId).populate('volumes').populate('libraryRoot').lean();
      if (!series) return res.status(404).send("Series not found");
      
      // Determine Series Directory
      let seriesDir;
      if (series.libraryRoot && series.libraryRoot.path) {
          seriesDir = path.join(series.libraryRoot.path, series.folderName);
      } else {
          seriesDir = path.join(libraryRoot, series.folderName);
      }

      // Resolve Volume Covers
      if (series.volumes) {
          for (const volume of series.volumes) {
              let volumeDirName = `volume-${volume.index}`; 
              const volumeDir = path.join(seriesDir, 'Volumes', volumeDirName);
              const coverName = `volume-${volume.index}`;
              const coverFile = await MediaService.findCoverImage(volumeDir, coverName);

              if (coverFile) {
                  volume.coverImage = `/Library/${series.folderName}/Volumes/${volumeDirName}/${coverFile}`;
              } else {
                  volume.coverImage = '/views/public/images/folder.png';
              }
          }
      }

      // Sort volumes
      series.volumes.sort((a, b) => a.index - b.index);

      res.render("reader/browser/series", { series, config: req.app.get('APP_CONFIG') });
  } catch (e) {
      console.error(e);
      res.status(500).send("Error loading series");
  }
};

exports.getVolumeChapters = async (req, res) => {
  const { seriesId, volumeId } = req.params;
  const Volume = require('../models/Volume');
  const Series = require('../models/Series');

  try {
      const volume = await Volume.findById(volumeId).lean();
      const series = await Series.findById(seriesId).lean();
      
      if (!volume || !series) return res.status(404).send("Content not found");

      // Sort chapters
      volume.chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);

      res.render("reader/browser/volume", { series, volume, config: req.app.get('APP_CONFIG') });
  } catch (e) {
      console.error(e);
      res.status(500).send("Error loading volume");
  }
};

exports.getAvailableFonts = async (req, res) => {
    const fs = require('fs');
    const path = require('path');
    const fontsDir = path.join(__dirname, '..', 'views', 'public', 'styles', 'fonts');
    const fontsCssPath = path.join(__dirname, '..', 'views', 'public', 'styles', 'fonts.css');

    try {
        let files = [];
        if (fs.existsSync(fontsDir)) {
            files = fs.readdirSync(fontsDir).filter(f => /\.(ttf|otf|woff|woff2)$/i.test(f));
        }

        let cssVariables = [];
        if (fs.existsSync(fontsCssPath)) {
            const content = fs.readFileSync(fontsCssPath, 'utf8');
            const matches = content.match(/--font-family-[a-zA-Z0-9-]+/g);
            if (matches) {
                cssVariables = [...new Set(matches)];
            }
        }

        res.json({ files, cssVariables });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to load fonts" });
    }
};
