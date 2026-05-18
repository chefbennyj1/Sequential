const fs = require('fs');
const path = require('path');
const VolumeModel = require('../models/Volume');
const mongoose = require('mongoose');

const DEFAULT_JS = `export async function onPageLoad(container, pageInfo) {
    container.addEventListener('view_visible', async () => { console.log(\`Page \${pageInfo.pageId} is visible.\`); });
    container.addEventListener('view_hidden', () => { console.log(\`Page \${pageInfo.pageId} is hidden.\`); });
    container.addEventListener('panel_media_changed', (e) => {
        const { panelSelector, type, fileName, action } = e.detail;
        console.log('Panel ' + panelSelector + ' changed:', { type, fileName, action });
    });
}`;

const DEFAULT_CSS = (pageId) => `@import url('/layouts/styles/base-comic-layout.css');

.\${pageId} {

}`;

async function createVolume({ index, title, seriesId }) {
  const { resolveSeriesPath } = require('./MediaService');
  const Series = require('../models/Series');
  
  const seriesDoc = await Series.findById(seriesId);
  if (!seriesDoc) throw new Error("Series not found");

  const seriesFolderName = seriesDoc.folderName;
  const volumeFolderName = `volume-${index}`;
  
  // Resolve the absolute path for physical directory creation
  const seriesPath = await resolveSeriesPath(seriesFolderName);
  const absoluteVolumePath = path.join(seriesPath, 'Volumes', volumeFolderName);

  // Check if volume with this index already exists for THIS series
  const existing = await VolumeModel.findOne({ index, series: seriesId });
  if (existing) throw Error("Existing Volume for this series");

  // Physical directory creation
  if (!fs.existsSync(absoluteVolumePath)) {
      fs.mkdirSync(absoluteVolumePath, { recursive: true });
  }

  // Store volumePath in the internal format used by the scanner (/Library/Series/Volumes/volume-N)
  const volumePath = `/Library/${seriesFolderName}/Volumes/${volumeFolderName}`;

  const newVolume = new VolumeModel({ 
      series: seriesId,
      index, 
      title, 
      volumePath, 
      chapters: [] 
  });

  await newVolume.save();
  // We pass the absolute path to updateChaptersFromFS to ensure it can scan immediately
  let volumeWithData = await updateChaptersFromFS(newVolume, absoluteVolumePath);
  await volumeWithData.save();
  return true;
}

async function updateChaptersFromFS(volume, explicitPath = null) {
  try {
    const projectRoot = path.resolve(__dirname, '..');
    let volumeBaseDir = explicitPath;
    
    if (!volumeBaseDir) {
        // Resolve series folder name from the volume path (e.g., /Library/No_Overflow/Volumes/volume-1)
        const pathParts = volume.volumePath.split('/').filter(p => p.length > 0);
        const seriesFolderName = pathParts[1]; // Index 1 is the folder name after 'Library'
        
        if (!seriesFolderName) throw new Error("Could not determine series from volumePath: " + volume.volumePath);
        
        const { resolveSeriesPath } = require('./MediaService');
        const seriesPath = await resolveSeriesPath(seriesFolderName);
        
        // Extract the volume subfolder (e.g., volume-1)
        const volumeSubFolder = path.basename(volume.volumePath);
        
        volumeBaseDir = path.join(seriesPath, 'Volumes', volumeSubFolder);
    }
        
    console.log(`[Scanner] Scanning: ${volumeBaseDir}`);
    const chapterFolders = (await fs.promises.readdir(volumeBaseDir, { withFileTypes: true }))
      .filter(d => d.isDirectory() && d.name.startsWith('chapter-'))
      .map(d => d.name)
      .sort((a,b) => (parseInt(a.replace(/\D/g, '')) || 0) - (parseInt(b.replace(/\D/g, '')) || 0));

    // Remove stale chapters
    const fsChapterNums = chapterFolders.map(f => parseInt(f.replace(/\D/g, '')) || 0);
    volume.chapters = volume.chapters.filter(c => fsChapterNums.includes(c.chapterNumber));

    for (const chapFolder of chapterFolders) {
      const chapterNumber = parseInt(chapFolder.replace(/\D/g, '')) || 0;
      const chapterPath = path.join(volumeBaseDir, chapFolder);

      let chapter = volume.chapters.find(c => c.chapterNumber === chapterNumber);
      if (!chapter) {
        chapter = { title: `Chapter ${chapterNumber}`, chapterNumber, pages: [] };
        volume.chapters.push(chapter);
      }

      const pageFolders = (await fs.promises.readdir(chapterPath, { withFileTypes: true }))
        .filter(d => d.isDirectory() && d.name.startsWith('page'))
        .map(d => d.name)
        .sort((a,b) => (parseInt(a.replace(/\D/g, '')) || 0) - (parseInt(b.replace(/\D/g, '')) || 0));

      const pages = [];
      for (const pageFolder of pageFolders) {
        const folderPath = path.join(chapterPath, pageFolder);
        const atomicPath = path.join(folderPath, 'page.json');
        const jsPath = path.join(folderPath, 'page.js');
        const cssPath = path.join(folderPath, 'page.css');

        // 1. AUTO-SCAFFOLDING
        if (!fs.existsSync(atomicPath)) {
            console.log(`[Scanner] Scaffolding ${pageFolder}`);
            const defJson = {
                header: { 
                    version: "2.0", 
                    layouts: {
                        landscape: { id: "Standard_Page", html: "Standard_Page.html", css: "" },
                        portrait: { id: "Standard_Page", html: "Standard_Page.html", css: "" }
                    }
                },
                media: [], scene: []
            };
            
            fs.writeFileSync(atomicPath, JSON.stringify(defJson, null, 2));
        }
        
        // Ensure JS and CSS exist
        if (!fs.existsSync(jsPath)) fs.writeFileSync(jsPath, DEFAULT_JS);
        if (!fs.existsSync(cssPath)) fs.writeFileSync(cssPath, DEFAULT_CSS(pageFolder));

        // 2. PARSE ATOMIC DATA FOR CACHE
        let mediaData = { media: [] };
        let sceneData = [];
        let layouts = { landscape: "Standard_Page", portrait: "Standard_Page" };

        try {
            const raw = fs.readFileSync(atomicPath, 'utf8');
            const atomic = JSON.parse(raw);
            
            // Handle legacy or new structure
            if (atomic.header?.layouts) {
                layouts.landscape = atomic.header.layouts.landscape?.id || "Standard_Page";
                layouts.portrait = atomic.header.layouts.portrait?.id || "Standard_Page";
            } else {
                layouts.landscape = atomic.header?.layout?.id || "Standard_Page";
                layouts.portrait = atomic.header?.portraitLayout?.id || layouts.landscape;
            }

            mediaData = { media: (atomic.media || []).map(m => {
                // If it's an image and has no description/alt, mark it as needing update
                if (m.type === 'image' && m.fileName && (!m.alt || !m.description)) {
                    m.DescriptionUpdateRequired = true;
                }
                return m;
            }) };
            sceneData = atomic.scene || [];
        } catch (e) { console.warn(`[Scanner] Error parsing ${atomicPath}:`, e.message); } 

        const pageIndex = parseInt(pageFolder.replace(/\D/g, '')) || 0;
        const urlPath = `${volume.volumePath}/${chapFolder}/${pageFolder}/page.json`.replace(/\\/g, '/');

        pages.push({ index: pageIndex, path: urlPath, layouts, mediaData, sceneData });
      }
      chapter.pages = pages;
    }

    volume.chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
    volume.markModified('chapters');
    await volume.save();
    console.log(`[Scanner] Volume ${volume.index} updated. Total Chapters: ${volume.chapters.length}`);
    return volume;
  } catch (err) {
    console.error(`[Scanner] Failed:`, err);
    return volume;
  }
}

async function syncSinglePage(volumeId, chapterId, pageId, seriesFolderName = null) {
    try {
        const Volume = require('../models/Volume');
        const Series = require('../models/Series');
        const { resolveSeriesPath } = require('./MediaService');
        
        let volume;
        if (seriesFolderName) {
            const seriesDoc = await Series.findOne({ folderName: seriesFolderName });
            if (seriesDoc) {
                if (mongoose.Types.ObjectId.isValid(volumeId)) {
                    volume = await Volume.findOne({ _id: volumeId, series: seriesDoc._id });
                } else {
                    const volPathRegex = new RegExp(`${volumeId}[\\\\/]?$`, 'i');
                    volume = await Volume.findOne({ volumePath: volPathRegex, series: seriesDoc._id });
                }
            }
        }

        if (!volume && mongoose.Types.ObjectId.isValid(volumeId)) {
            volume = await Volume.findById(volumeId).populate('series');
        }

        if (!volume) throw new Error("Volume not found");

        const actualSeriesFolderName = seriesFolderName || (volume.series ? volume.series.folderName : null) || (() => {
            const pathParts = volume.volumePath.split('/').filter(p => p.length > 0);
            return pathParts[1];
        })();

        if (!actualSeriesFolderName) throw new Error("Could not determine series folder name");
        
        const seriesPath = await resolveSeriesPath(actualSeriesFolderName);
        const volumeSubFolder = path.basename(volume.volumePath);
        const pageFolder = path.join(seriesPath, 'Volumes', volumeSubFolder, chapterId, pageId);
        const atomicPath = path.join(pageFolder, 'page.json');
        console.log(`[Sync] Refreshing ${pageId}`);
        const raw = fs.readFileSync(atomicPath, 'utf8');
        const atomic = JSON.parse(raw);

        const chapterNum = parseInt(chapterId.replace('chapter-', ''));
        const chapter = volume.chapters.find(c => c.chapterNumber === chapterNum);
        if (!chapter) throw new Error("Chapter not in DB");

        const pageIndex = parseInt(pageId.replace('page', '')) || 0;
        const pageEntry = chapter.pages.find(p => p.index === pageIndex);
        
        if (pageEntry) {
            if (atomic.header?.layouts) {
                pageEntry.layouts = {
                    landscape: atomic.header.layouts.landscape?.id || "Standard_Page",
                    portrait: atomic.header.layouts.portrait?.id || "Standard_Page"
                };
            } else {
                pageEntry.layouts = {
                    landscape: atomic.header?.layout?.id || "Standard_Page",
                    portrait: atomic.header?.portraitLayout?.id || (atomic.header?.layout?.id || "Standard_Page")
                };
            }
            pageEntry.mediaData = { media: (atomic.media || []).map(m => {
                if (m.type === 'image' && m.fileName && (!m.alt || !m.description)) {
                    m.DescriptionUpdateRequired = true;
                }
                return m;
            }) };
            pageEntry.sceneData = atomic.scene || [];
            volume.markModified('chapters');
            await volume.save();
            return { ok: true, page: pageEntry };
        }
        return { ok: false, message: "Page not in DB" };
    } catch (err) {
        return { ok: false, message: err.message };
    }
}

async function tryRename(oldP, newP, retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            await fs.promises.rename(oldP, newP);
            return;
        } catch (e) {
            if ((e.code === 'EPERM' || e.code === 'EBUSY' || e.code === 'EACCES') && i < retries - 1) {
                const delay = Math.pow(2, i) * 100; // Exponential backoff: 100ms, 200ms, 400ms, 800ms
                await new Promise(r => setTimeout(r, delay));
            } else {
                e.message = `[Rename Error] Could not move "${path.basename(oldP)}". It may be open in another program (VS Code, File Explorer, etc). Details: ${e.message}`;
                throw e;
            }
        }
    }
}

async function insertPage({ series, volume: volumeFolderName, chapter: chapterFolderName, insertPoint }) {
    const { resolveSeriesPath } = require('./MediaService');
    const Series = require('../models/Series');
    const VolumeModel = require('../models/Volume');

    const seriesFolderName = await (async () => {
        if (mongoose.Types.ObjectId.isValid(series)) {
            const doc = await Series.findById(series);
            return doc ? doc.folderName : null;
        }
        return series;
    })();

    if (!seriesFolderName) throw new Error("Series folder name is required for insertPage");

    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const volumePath = path.join(seriesPath, 'Volumes', volumeFolderName);
    
    if (!fs.existsSync(volumePath)) throw new Error("Volume directory not found");

    const insertIdx = parseInt(insertPoint);
    if (isNaN(insertIdx)) throw new Error("Invalid insert point");

    const chapterDirs = (await fs.promises.readdir(volumePath, { withFileTypes: true }))
        .filter(d => d.isDirectory() && d.name.startsWith('chapter-'))
        .map(d => d.name)
        .sort((a, b) => (parseInt(a.replace(/\D/g, '')) || 0) - (parseInt(b.replace(/\D/g, '')) || 0));

    const targetChapIdx = chapterDirs.indexOf(chapterFolderName);
    if (targetChapIdx === -1) throw new Error("Target chapter not found in volume");

    // --- PHASE 0: PRE-FLIGHT LOCK CHECK ---
    const foldersToMove = [];
    for (let i = targetChapIdx; i < chapterDirs.length; i++) {
        const currentChapName = chapterDirs[i];
        const currentChapPath = path.join(volumePath, currentChapName);
        const isTargetChapter = (i === targetChapIdx);

        if (fs.existsSync(path.join(currentChapPath, '.ignore-shift'))) continue;

        const pageDirs = (await fs.promises.readdir(currentChapPath, { withFileTypes: true }))
            .filter(d => d.isDirectory() && d.name.startsWith('page'))
            .map(d => ({ name: d.name, num: parseInt(d.name.replace(/\D/g, '')) || 0 }))
            .filter(p => isTargetChapter ? p.num >= insertIdx : true)
            .sort((a, b) => b.num - a.num);

        for (const page of pageDirs) {
            foldersToMove.push({
                chapName: currentChapName,
                oldName: page.name,
                newName: `page${page.num + 1}`,
                oldPath: path.join(currentChapPath, page.name),
                newPath: path.join(currentChapPath, `page${page.num + 1}`),
                tempPath: path.join(currentChapPath, `${page.name}_TEMP_SHIFT`)
            });
        }
    }

    // Verify all folders can be touched (Pre-flight)
    for (const item of foldersToMove) {
        try {
            // Attempt a non-destructive rename test to see if file is locked
            const testPath = item.oldPath + "_LOCK_TEST";
            await fs.promises.rename(item.oldPath, testPath);
            await fs.promises.rename(testPath, item.oldPath);
        } catch (e) {
            throw new Error(`PRE-FLIGHT ERROR: The folder "${item.chapName}/${item.oldName}" is currently locked by another process. Please close all applications (VS Code, File Explorer, etc.) that might be using this folder and try again.`);
        }
    }

    // --- PHASE 1: TEMP RENAME (Avoid collisions) ---
    for (const item of foldersToMove) {
        await tryRename(item.oldPath, item.tempPath);
    }

    // --- PHASE 2: FINAL RENAME & INTERNAL UPDATES ---
    for (const item of foldersToMove) {
        await tryRename(item.tempPath, item.newPath);
        await updateInternalFiles(item.newPath, item.oldName, item.newName);
    }

    // --- PHASE 3: SCAFFOLD NEW PAGE ---
    const targetChapterPath = path.join(volumePath, chapterFolderName);
    const newPageName = `page${insertIdx}`;
    const newPagePath = path.join(targetChapterPath, newPageName);

    let cloneSourcePath = path.join(targetChapterPath, `page${insertIdx + 1}`);
    let sourceName = `page${insertIdx + 1}`;
    if (!fs.existsSync(cloneSourcePath)) {
        cloneSourcePath = path.join(targetChapterPath, `page${insertIdx - 1}`);
        sourceName = `page${insertIdx - 1}`;
    }

    if (fs.existsSync(cloneSourcePath)) {
        await fs.promises.cp(cloneSourcePath, newPagePath, { recursive: true });
        await updateInternalFiles(newPagePath, sourceName, newPageName);
        const jsonPath = path.join(newPagePath, 'page.json');
        if (fs.existsSync(jsonPath)) {
            const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            data.media = []; data.scene = [];
            fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
        }
    } else {
        fs.mkdirSync(newPagePath, { recursive: true });
        const jsonPath = path.join(newPagePath, 'page.json');
        const defaultData = {
            header: { version: "2.0", layouts: {
                landscape: { id: "Standard_Page", html: "Standard_Page.html", css: "" },
                portrait: { id: "Standard_Page", html: "Standard_Page.html", css: "" }
            } },
            media: [],
            scene: []
        };
        fs.writeFileSync(jsonPath, JSON.stringify(defaultData, null, 2));
        fs.writeFileSync(path.join(newPagePath, 'page.js'), DEFAULT_JS);
        fs.writeFileSync(path.join(newPagePath, 'page.css'), DEFAULT_CSS(newPageName));
    }

    const seriesDoc = await Series.findOne({ folderName: seriesFolderName });
    const volPathRegex = new RegExp(`${volumeFolderName}[\\\\/]?$`, 'i');
    const volume = await VolumeModel.findOne({ volumePath: volPathRegex, series: seriesDoc ? seriesDoc._id : { $exists: false } });
    if (volume) await updateChaptersFromFS(volume);

    return { ok: true, message: `Global Page Insertion complete at ${insertIdx}. Successfully shifted ${foldersToMove.length} pages.` };
}

async function createChapter({ seriesFolderName, volumeFolderName, title, chapterIndex }) {
    const { resolveSeriesPath } = require('./MediaService');
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const volumePath = path.join(seriesPath, 'Volumes', volumeFolderName);
    if (!fs.existsSync(volumePath)) throw new Error("Volume directory not found");

    const chapIdx = parseInt(chapterIndex);
    const chapterFolderName = `chapter-${chapIdx}`;
    const chapterPath = path.join(volumePath, chapterFolderName);
    if (fs.existsSync(chapterPath)) throw new Error(`Chapter ${chapIdx} already exists.`);

    const dirs = await fs.promises.readdir(volumePath, { withFileTypes: true });
    let maxPageNum = -1;
    for (const d of dirs) {
        if (d.isDirectory() && d.name.startsWith('chapter-')) {
            const chapDir = path.join(volumePath, d.name);
            const pageDirs = await fs.promises.readdir(chapDir, { withFileTypes: true });
            for (const pd of pageDirs) {
                if (pd.isDirectory() && pd.name.startsWith('page')) {
                    const pNum = parseInt(pd.name.replace('page', ''), 10);
                    if (!isNaN(pNum) && pNum > maxPageNum) maxPageNum = pNum;
                }
            }
        }
    }

    const nextPageNum = maxPageNum + 1;
    const firstPageName = `page${nextPageNum}`;
    const firstPagePath = path.join(chapterPath, firstPageName);

    await fs.promises.mkdir(chapterPath, { recursive: true });
    await fs.promises.mkdir(firstPagePath, { recursive: true });

    const pageJson = {
        header: { version: "2.0", pageId: firstPageName, chapter: chapterFolderName, volume: volumeFolderName, layout: { id: "Standard_Page", html: "Standard_Page.html", css: "" } },
        media: [], scene: []
    };
    await fs.promises.writeFile(path.join(firstPagePath, 'page.json'), JSON.stringify(pageJson, null, 2));
    await fs.promises.writeFile(path.join(firstPagePath, 'page.js'), DEFAULT_JS);
    await fs.promises.writeFile(path.join(firstPagePath, 'page.css'), DEFAULT_CSS(firstPageName));
    await fs.promises.mkdir(path.join(firstPagePath, "assets", "image"), { recursive: true });

    const VolumeModel = require('../models/Volume');
    const Series = require('../models/Series');
    const seriesDoc = await Series.findOne({ folderName: seriesFolderName });
    
    const volPathRegex = new RegExp(`${volumeFolderName}[\\\\/]?$`, 'i');
    const volume = await VolumeModel.findOne({ 
        volumePath: volPathRegex,
        series: seriesDoc ? seriesDoc._id : { $exists: false }
    });
    if (volume) await updateChaptersFromFS(volume);

    return { ok: true, message: `Chapter ${chapIdx} created`, chapter: chapterFolderName, pageId: firstPageName };
}

async function updateInternalFiles(dir, oldName, newName) {
    const files = await fs.promises.readdir(dir);
    for (const f of files) {
        if (f.startsWith(oldName)) { 
            const newF = f.replace(oldName, newName);
            await tryRename(path.join(dir, f), path.join(dir, newF));
        }
    }
    const jsonPath = path.join(dir, 'page.json');
    if (fs.existsSync(jsonPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            // Remove redundant fields if they exist
            if (data.header) {
                delete data.header.pageId;
                delete data.header.chapter;
                delete data.header.volume;
                fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
            }
        } catch(e) {}
    }
}

async function getChapterRange({ series, volume: volumeFolderName, chapter: chapterFolderName }) {
    const { resolveSeriesPath } = require('./MediaService');
    const Series = require('../models/Series');

    const seriesFolderName = await (async () => {
        if (mongoose.Types.ObjectId.isValid(series)) {
            const doc = await Series.findById(series);
            return doc ? doc.folderName : null;
        }
        return series;
    })();

    if (!seriesFolderName) throw new Error("Series folder name is required");

    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const chapterPath = path.join(seriesPath, 'Volumes', volumeFolderName, chapterFolderName);
    
    if (!fs.existsSync(chapterPath)) {
        return { min: 0, max: 0, count: 0, pages: [] };
    }

    const pageDirs = (await fs.promises.readdir(chapterPath, { withFileTypes: true }))
        .filter(d => d.isDirectory() && d.name.startsWith('page'))
        .map(d => parseInt(d.name.replace(/\D/g, '')) || 0)
        .sort((a, b) => a - b);

    if (pageDirs.length === 0) {
        return { min: 0, max: 0, count: 0, pages: [] };
    }

    return {
        min: pageDirs[0],
        max: pageDirs[pageDirs.length - 1],
        count: pageDirs.length,
        pages: pageDirs
    };
}

async function reorderPages({ series, volume: volumeFolderName, chapter: chapterFolderName, newOrder }) {
    const { resolveSeriesPath } = require('./MediaService');
    const Series = require('../models/Series');
    const VolumeModel = require('../models/Volume');

    const seriesFolderName = await (async () => {
        if (mongoose.Types.ObjectId.isValid(series)) {
            const doc = await Series.findById(series);
            return doc ? doc.folderName : null;
        }
        return series;
    })();

    if (!seriesFolderName) throw new Error("Series folder name is required");

    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const chapterPath = path.join(seriesPath, 'Volumes', volumeFolderName, chapterFolderName);
    
    if (!fs.existsSync(chapterPath)) throw new Error("Chapter directory not found");

    // 1. Validate the input order
    if (!Array.isArray(newOrder) || newOrder.length === 0) throw new Error("Invalid page order provided");

    // 2. Determine the starting index (we assume they want to keep the same range but different order)
    // Find the smallest index currently in the chapter
    const existingPages = (await fs.promises.readdir(chapterPath, { withFileTypes: true }))
        .filter(d => d.isDirectory() && d.name.startsWith('page'))
        .map(d => parseInt(d.name.replace(/\D/g, '')) || 0)
        .sort((a, b) => a - b);

    if (existingPages.length === 0) throw new Error("No pages found to reorder");
    
    const startIdx = existingPages[0];

    // 3. Temporary rename phase to avoid collisions
    const tempMapping = [];
    for (const oldPageName of newOrder) {
        const oldPath = path.join(chapterPath, oldPageName);
        if (fs.existsSync(oldPath)) {
            const tempName = `reorder_${Math.random().toString(36).substr(2, 9)}_${oldPageName}`;
            const tempPath = path.join(chapterPath, tempName);
            await tryRename(oldPath, tempPath);
            tempMapping.push({ tempPath, tempName });
        } else {
            console.warn(`[Reorder] Page ${oldPageName} not found, skipping.`);
        }
    }

    // 4. Final rename phase to new sequential IDs
    for (let i = 0; i < tempMapping.length; i++) {
        const newIdx = startIdx + i;
        const newPageName = `page${newIdx}`;
        const finalPath = path.join(chapterPath, newPageName);
        
        const { tempPath, tempName } = tempMapping[i];
        
        await tryRename(tempPath, finalPath);
        
        // Use existing helper to update pageId inside page.json and rename assets if needed
        // Note: updateInternalFiles expects (dir, oldName, newName)
        // dir is the newPath, oldName is the ORIGINAL name before temp rename
        const originalName = tempName.split('_').slice(2).join('_'); 
        await updateInternalFiles(finalPath, originalName, newPageName);
    }

    // 5. Sync DB
    const seriesDoc = await Series.findOne({ folderName: seriesFolderName });
    const volPathRegex = new RegExp(`${volumeFolderName}[\\\\/]?$`, 'i');
    const volume = await VolumeModel.findOne({ volumePath: volPathRegex, series: seriesDoc ? seriesDoc._id : { $exists: false } });
    if (volume) await updateChaptersFromFS(volume);

    return { ok: true, message: `Reordered ${tempMapping.length} pages starting from index ${startIdx}` };
}

module.exports = { createVolume, populatePagesFromFS: updateChaptersFromFS, updateChaptersFromFS, syncSinglePage, insertPage, createChapter, getChapterRange, reorderPages };
