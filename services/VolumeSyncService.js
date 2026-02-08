const fs = require('fs');
const path = require('path');
const Volume = require('../models/Volume.js');
const VolumeManager = require("./VolumeService.js");

async function updateVolumesFromFS() {
  const volumes = await Volume.find();

  for (const vol of volumes) {
    // Populate chapters and pages from filesystem
    // VolumeManager.populatePagesFromFS is now an alias for updateChaptersFromFS
    const updatedVol = await VolumeManager.populatePagesFromFS(vol);

    // Calculate total pages for logging
    const totalPages = updatedVol.chapters.reduce((sum, chapter) => sum + chapter.pages.length, 0);

    // Save changes to MongoDB
    await updatedVol.save();

    console.log(`Updated volume ${updatedVol.title} with ${updatedVol.chapters.length} chapters and ${totalPages} pages.`);
  }
}

module.exports = { updateVolumesFromFS };
