exports.getLandingPage = (req, res) => {
  console.log(req.session);
  console.log(req.session.id);
  res.render("landingPage/index");
};

exports.getLogin = (req, res) => {
  res.render("login/index");
};

exports.getLibrary = (req, res) => {
  res.render("library/index");
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

      res.render("library/series", { series });
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

      res.render("library/volume", { series, volume });
  } catch (e) {
      console.error(e);
      res.status(500).send("Error loading volume");
  }
};
