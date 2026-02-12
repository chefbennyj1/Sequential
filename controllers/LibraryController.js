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
        const series = await fetchSeriesByIdOrName(seriesId);
        if (!series) {
            return res.status(404).json({ ok: false, message: "Series not found" });
        }

        const seriesDir = resolveSeriesDir(series);

        if (series.folderName) {
            series.coverImage = await resolveCoverImage(seriesDir, series.folderName, 'folder');
        }

        if (series.volumes) {
            await populateVolumeCovers(series, seriesDir);
        }

        res.json({ ok: true, series });
    } catch (err) {
        console.error(`Error fetching series details for ${seriesId}:`, err);
        res.status(500).json({ ok: false, message: "Server error" });
    }
};

async function fetchSeriesByIdOrName(seriesId) {
    if (mongoose.Types.ObjectId.isValid(seriesId)) {
        return await Series.findById(seriesId).populate('volumes').populate('libraryRoot').lean();
    }
    return await Series.findOne({ 
        $or: [
            { folderName: seriesId }, 
            { title: { $regex: new RegExp(`^${seriesId}$`, 'i') } }
        ] 
    }).populate('volumes').populate('libraryRoot').lean();
}

function resolveSeriesDir(series) {
    if (series.libraryRoot && series.libraryRoot.path) {
        return path.join(series.libraryRoot.path, series.folderName);
    }
    return path.join(libraryRoot, series.folderName);
}

async function resolveCoverImage(dir, folderName, coverName, isVolume = false) {
    const coverFile = await MediaService.findCoverImage(dir, coverName);
    if (!coverFile) return '/views/public/images/folder.png';
    
    if (isVolume) {
        return `/Library/${folderName}/Volumes/${coverName}/${coverFile}`;
    }
    return `/Library/${folderName}/${coverFile}`;
}

async function populateVolumeCovers(series, seriesDir) {
    for (const volume of series.volumes) {
        const volumeDirName = `volume-${volume.index}`; 
        const volumeDir = path.join(seriesDir, 'Volumes', volumeDirName);
        const coverName = `volume-${volume.index}`;
        
        volume.coverImage = await resolveCoverImage(volumeDir, series.folderName, volumeDirName, true);
        // Specifically look for volume-{index} file name
        const specificCover = await MediaService.findCoverImage(volumeDir, coverName);
        if (specificCover) {
            volume.coverImage = `/Library/${series.folderName}/Volumes/${volumeDirName}/${specificCover}`;
        }
    }
}

exports.getLandingLibrary = async (req, res) => {
    try {
        const seriesList = await Series.find({}).sort({ title: 1 }).populate('libraryRoot').populate('volumes').lean();
        const libraryData = await Promise.all(seriesList.map(processSeriesForLanding));

        res.json({ ok: true, library: libraryData.filter(Boolean) });
    } catch (err) {
        console.error("Error fetching landing library:", err);
        res.status(500).json({ ok: false, message: "Server error" });
    }
};

async function processSeriesForLanding(series) {
    if (!series.folderName) return null;

    const firstVolumeId = getFirstVolumeId(series);
    const seriesDir = resolveSeriesDir(series);
    
    // 1. Resolve Carousel Images
    const carouselImages = await resolveCarouselImages(seriesDir, series.folderName);
    
    // 2. Resolve Cover Image with smarter fallback
    let coverImage = await resolveCoverImage(seriesDir, series.folderName, 'folder');
    
    // If folder.png is missing (returns the static fallback), check folder1.png
    if (coverImage === '/views/public/images/folder.png') {
        const altCover = await resolveCoverImage(seriesDir, series.folderName, 'folder1');
        if (altCover !== '/views/public/images/folder.png') {
            coverImage = altCover;
        } else if (carouselImages.length > 0) {
            // Use the first image found in the carousel scan as the cover
            coverImage = carouselImages[0];
        }
    }

    return {
        _id: series._id,
        title: series.title,
        folderName: series.folderName,
        description: series.description,
        coverImage,
        images: carouselImages.length > 0 ? carouselImages : [coverImage],
        firstVolumeId
    };
}

function getFirstVolumeId(series) {
    if (!series.volumes || series.volumes.length === 0) return null;
    series.volumes.sort((a, b) => a.index - b.index);
    return series.volumes[0]._id;
}

async function resolveCarouselImages(seriesDir, folderName) {
    try {
        const files = await fs.readdir(seriesDir);
        const folderImageRegex = /^folder(\d+)\.(png|jpg|jpeg|gif|webp)$/i;
        
        const imageFiles = files
            .filter(file => folderImageRegex.test(file))
            .sort((a, b) => {
                const numA = parseInt(a.match(folderImageRegex)[1]);
                const numB = parseInt(b.match(folderImageRegex)[1]);
                return numA - numB;
            });
        
        return imageFiles.map(file => `/Library/${folderName}/${file}`);
    } catch {
        return [];
    }
}
