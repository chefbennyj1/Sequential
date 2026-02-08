const mongoose = require('mongoose');
const Series = require('../models/Series');
const MediaService = require('../services/MediaService');
const path = require('path');
const fs = require('fs').promises;

const libraryRoot = path.join(__dirname, '..', 'Library');

exports.getSeries = async (req, res) => {
    try {
        // Convert to lean() to allow modification of the result object
        const seriesList = await Series.find({}).sort({ title: 1 }).populate('libraryRoot').lean();

        for (const series of seriesList) {
            if (series.folderName) {
                // Determine Series Directory
                let seriesDir;
                if (series.libraryRoot && series.libraryRoot.path) {
                    seriesDir = path.join(series.libraryRoot.path, series.folderName);
                } else {
                    seriesDir = path.join(libraryRoot, series.folderName);
                }

                const coverFile = await MediaService.findCoverImage(seriesDir, 'folder');
                
                if (coverFile) {
                    // Force forward slashes for URLs
                    series.coverImage = `/Library/${series.folderName}/${coverFile}`;
                } else {
                    series.coverImage = '/views/public/images/folder.png'; // Default
                }
            }
        }

        res.json({ ok: true, series: seriesList });
    } catch (err) {
        console.error("Error fetching series:", err);
        res.status(500).json({ ok: false, message: "Server error" });
    }
};

exports.getSeriesDetails = async (req, res) => {
    const { seriesId } = req.params;
    try {
        let series;
        
        if (mongoose.Types.ObjectId.isValid(seriesId)) {
            series = await Series.findById(seriesId).populate('volumes').populate('libraryRoot').lean();
        } else {
            // Try finding by folderName or title (case-insensitive for convenience)
            series = await Series.findOne({ 
                $or: [
                    { folderName: seriesId }, 
                    { title: { $regex: new RegExp(`^${seriesId}$`, 'i') } }
                ] 
            }).populate('volumes').populate('libraryRoot').lean();
        }

        if (!series) {
            return res.status(404).json({ ok: false, message: "Series not found" });
        }

        // Determine Series Directory
        let seriesDir;
        if (series.libraryRoot && series.libraryRoot.path) {
            seriesDir = path.join(series.libraryRoot.path, series.folderName);
        } else {
            seriesDir = path.join(libraryRoot, series.folderName);
        }

        // 1. Resolve Series Cover (same as getSeries)
        if (series.folderName) {
            const coverFile = await MediaService.findCoverImage(seriesDir, 'folder');
            if (coverFile) {
                series.coverImage = `/Library/${series.folderName}/${coverFile}`;
            } else {
                series.coverImage = '/views/public/images/folder.png';
            }
        }

        // 2. Resolve Volume Covers
        if (series.volumes) {
            for (const volume of series.volumes) {
                // Determine Volume Folder Name
                // If volumePath exists (e.g., "Library/No_Overflow/Volumes/volume-1/"), use it.
                // Otherwise, construct it from index.
                let volumeDirName = `volume-${volume.index}`; 
                
                // Construct the absolute path to the volume folder
                // We assume the standard structure: Library/{Series}/Volumes/{VolumeDir}
                const volumeDir = path.join(seriesDir, 'Volumes', volumeDirName);

                // Look for 'volume-{index}.ext'
                const coverName = `volume-${volume.index}`;
                const coverFile = await MediaService.findCoverImage(volumeDir, coverName);

                if (coverFile) {
                    volume.coverImage = `/Library/${series.folderName}/Volumes/${volumeDirName}/${coverFile}`;
                } else {
                    volume.coverImage = '/views/public/images/folder.png';
                }
            }
        }

        res.json({ ok: true, series });
    } catch (err) {
        console.error(`Error fetching series details for ${seriesId}:`, err);
        res.status(500).json({ ok: false, message: "Server error" });
    }
};

exports.getLandingLibrary = async (req, res) => {
    try {
        // Populate volumes to get the first one
        const seriesList = await Series.find({}).sort({ title: 1 }).populate('libraryRoot').populate('volumes').lean();
        const libraryData = [];

        for (const series of seriesList) {
            if (!series.folderName) continue;

            // Determine First Volume ID
            let firstVolumeId = null;
            if (series.volumes && series.volumes.length > 0) {
                // Sort by index to be safe
                series.volumes.sort((a, b) => a.index - b.index);
                firstVolumeId = series.volumes[0]._id;
            }

            // Determine Series Directory
            let seriesDir;
            if (series.libraryRoot && series.libraryRoot.path) {
                seriesDir = path.join(series.libraryRoot.path, series.folderName);
            } else {
                seriesDir = path.join(libraryRoot, series.folderName);
            }

            // Resolve Cover
            let coverImage = '/views/public/images/folder.png';
            const coverFile = await MediaService.findCoverImage(seriesDir, 'folder');
            if (coverFile) {
                coverImage = `/Library/${series.folderName}/${coverFile}`;
            }

            // Resolve Carousel Images (Assets)
            // Strategy: Look for 'folder1.ext', 'folder2.ext', etc. in the SERIES ROOT.
            // This is easier for users than managing a separate assets folder for cover art.
            let carouselImages = [];
            
            try {
                const files = await fs.readdir(seriesDir);
                
                // Filter for "folderN.ext" pattern
                const folderImageRegex = /^folder(\d+)\.(png|jpg|jpeg|gif|webp)$/i;
                
                const imageFiles = files.filter(file => folderImageRegex.test(file));
                
                // Sort numerically by the number in the filename (folder1, folder2, folder10...)
                imageFiles.sort((a, b) => {
                    const numA = parseInt(a.match(folderImageRegex)[1]);
                    const numB = parseInt(b.match(folderImageRegex)[1]);
                    return numA - numB;
                });
                
                // Map to public URLs
                carouselImages = imageFiles.map(file => `/Library/${series.folderName}/${file}`);

            } catch (err) {
                // console.warn(`Error scanning series root for ${series.folderName}`, err);
            }

            // Ensure we have at least the cover if no assets
            if (carouselImages.length === 0 && coverFile) {
                carouselImages.push(coverImage);
            }

            libraryData.push({
                _id: series._id,
                title: series.title,
                folderName: series.folderName,
                description: series.description,
                coverImage: coverImage,
                images: carouselImages,
                firstVolumeId: firstVolumeId // Send this to the frontend
            });
        }

        res.json({ ok: true, library: libraryData });

    } catch (err) {
        console.error("Error fetching landing library:", err);
        res.status(500).json({ ok: false, message: "Server error" });
    }
};
