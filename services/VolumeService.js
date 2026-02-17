const fs = require('fs');
const path = require('path');
const VolumeModel = require('../models/Volume');

async function createVolume({ index, title, volumePath }) {
  const existing = await VolumeModel.findOne({ index });
  if (existing) throw Error("Existing Volume");

  const newVolume = new VolumeModel({ index, title, volumePath, chapters: [] });
  await newVolume.save();
  let volumeWithData = await updateChaptersFromFS(newVolume);
  await volumeWithData.save();
  return true;
}

async function updateChaptersFromFS(volume, explicitPath = null) {
  try {
    const projectRoot = path.resolve(__dirname, '..');
    let volumeBaseDir = explicitPath;
    
    if (!volumeBaseDir) {
        volumeBaseDir = volume.volumePath.startsWith('/Library') 
            ? path.join(projectRoot, volume.volumePath) 
            : (path.isAbsolute(volume.volumePath) ? volume.volumePath : path.join(projectRoot, volume.volumePath));
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
        chapter = { title: `Chapter ${chapterNumber}`, chapterNumber, pages: [], backgroundAudioSrc: null };
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
                header: { version: "2.0", pageId: pageFolder, chapter: chapFolder, volume: path.basename(volume.volumePath),
                          layout: { id: "Standard_Page", html: "Standard_Page.html", css: "" }, ambientAudio: {} },
                media: [], scene: []
            };
            const defJs = "export async function onPageLoad(container, pageInfo) {\n" +
                "    container.addEventListener('view_visible', async () => { console.log(`Page ${pageInfo.pageId} is visible.`); });\n" +
                "    container.addEventListener('view_hidden', () => { console.log(`Page ${pageInfo.pageId} is hidden.`); });\n" +
                "    container.addEventListener('panel_media_changed', (e) => {\n" +
                "        const { panelSelector, type, fileName, action } = e.detail;\n" +
                "        console.log('Panel ' + panelSelector + ' changed:', { type, fileName, action });\n" +
                "    });\n}";
            const defCss = `@import url('/layouts/styles/base-comic-layout.css');\n\n.${pageFolder} {\n\n}`;            fs.writeFileSync(atomicPath, JSON.stringify(defJson, null, 2));
            if (!fs.existsSync(jsPath)) fs.writeFileSync(jsPath, defJs);
            if (!fs.existsSync(cssPath)) fs.writeFileSync(cssPath, defCss);
        }

        // 2. PARSE ATOMIC DATA FOR CACHE
        let mediaData = { media: [], ambientAudio: {} };
        let sceneData = [];
        let layoutId = "Standard_Page";

        try {
            const raw = fs.readFileSync(atomicPath, 'utf8');
            const atomic = JSON.parse(raw);
            layoutId = atomic.header?.layout?.id || layoutId;
            mediaData = { media: atomic.media || [], ambientAudio: atomic.header?.ambientAudio || {} };
            sceneData = atomic.scene || [];
        } catch (e) { console.warn(`[Scanner] Error parsing ${atomicPath}:`, e.message); } 

        const pageIndex = parseInt(pageFolder.replace(/\D/g, '')) || 0;
        const urlPath = `${volume.volumePath}/${chapFolder}/${pageFolder}/page.json`.replace(/\\/g, '/');

        pages.push({ index: pageIndex, path: urlPath, layoutId, mediaData, sceneData });
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

async function syncSinglePage(volumeId, chapterId, pageId) {
    try {
        const Volume = require('../models/Volume');
        const { resolveSeriesPath } = require('./MediaService');
        const volume = await Volume.findById(volumeId);
        if (!volume) throw new Error("Volume not found");

        const pathParts = volume.volumePath.split('/').filter(p => p.length > 0);
        const seriesFolderName = pathParts[1]; 
        const seriesPath = await resolveSeriesPath(seriesFolderName);
        const pageFolder = path.join(seriesPath, 'Volumes', path.basename(volume.volumePath), chapterId, pageId);
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
            pageEntry.layoutId = atomic.header?.layout?.id || "Standard_Page";
            pageEntry.mediaData = { media: atomic.media || [], ambientAudio: atomic.header?.ambientAudio || {} };
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

async function insertPage({ seriesFolderName, volumeFolderName, chapterFolderName, insertPoint }) {
    const { resolveSeriesPath } = require('./MediaService');
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const chapterPath = path.join(seriesPath, 'Volumes', volumeFolderName, chapterFolderName);
    
    if (!fs.existsSync(chapterPath)) throw new Error("Chapter directory not found");

    const insertIdx = parseInt(insertPoint);
    if (isNaN(insertIdx)) throw new Error("Invalid insert point");

    console.log(`[VolumeService] Inserting page at index ${insertIdx} in: ${chapterPath}`);

    // 1. Identify Pages to Shift
    const dirs = await fs.promises.readdir(chapterPath, { withFileTypes: true });
    let pagesToShift = [];

    for (const d of dirs) {
        if (d.isDirectory() && d.name.startsWith('page')) {
            const num = parseInt(d.name.replace('page', ''), 10);
            if (!isNaN(num) && num >= insertIdx) {
                pagesToShift.push(num);
            }
        }
    }
    
    // Sort descending to avoid overwriting
    pagesToShift.sort((a, b) => b - a);

    // 2. Execute Shift
    for (const num of pagesToShift) {
        const oldName = `page${num}`;
        const newName = `page${num + 1}`;
        const oldPath = path.join(chapterPath, oldName);
        const newPath = path.join(chapterPath, newName);

        if (fs.existsSync(newPath)) {
            console.log(`  Target ${newName} already exists. Skipping move of ${oldName}.`);
            continue; 
        }

        console.log(`  Moving ${oldName} -> ${newName}`);
        await tryRename(oldPath, newPath);

        // Renumber internal files in the MOVED page
        await updateInternalFiles(newPath, `page${num}`, `page${num + 1}`);
    }

    // 3. Clone Previous Page -> New Page
    const sourceIdx = insertIdx - 1;
    const sourceName = `page${sourceIdx}`;
    const newName = `page${insertIdx}`;
    const sourcePage = path.join(chapterPath, sourceName);
    const newPage = path.join(chapterPath, newName);

    if (fs.existsSync(sourcePage)) {
        console.log(`  Cloning ${sourceName} -> ${newName}`);
        await fs.promises.cp(sourcePage, newPage, { recursive: true });

        // Update New Page Internals
        await updateInternalFiles(newPage, sourceName, newName);

        // Reset JSON
        const jsonPath = path.join(newPage, 'page.json');
        if (fs.existsSync(jsonPath)) {
            const data = JSON.parse(await fs.promises.readFile(jsonPath, 'utf8'));
            if (data.header) data.header.pageId = newName;
            data.scene = []; // Clear scene as it's a "new" page
            await fs.promises.writeFile(jsonPath, JSON.stringify(data, null, 2));
        }
    } else {
        console.log(`  No source page ${sourceName} found. Creating blank page.`);
        await fs.promises.mkdir(newPage, { recursive: true });
        // updateChaptersFromFS will handle scaffolding missing files
    }

    // 4. Update Database
    const VolumeModel = require('../models/Volume');
    const volPathRegex = new RegExp(`${volumeFolderName}[\\\\/]?$`, 'i');
    const volume = await VolumeModel.findOne({ volumePath: volPathRegex });
    if (volume) {
        await updateChaptersFromFS(volume);
    }

    return { ok: true, message: `Page inserted at ${insertIdx}` };
}

async function createChapter({ seriesFolderName, volumeFolderName, title, chapterIndex }) {
    const { resolveSeriesPath } = require('./MediaService');
    const seriesPath = await resolveSeriesPath(seriesFolderName);
    const volumePath = path.join(seriesPath, 'Volumes', volumeFolderName);
    
    if (!fs.existsSync(volumePath)) throw new Error("Volume directory not found");

    const chapIdx = parseInt(chapterIndex);
    if (isNaN(chapIdx)) throw new Error("Invalid chapter index");

    const chapterFolderName = `chapter-${chapIdx}`;
    const chapterPath = path.join(volumePath, chapterFolderName);

    // Safety: Don't overwrite existing chapters
    if (fs.existsSync(chapterPath)) {
        throw new Error(`Chapter ${chapIdx} already exists on disk.`);
    }

    // 1. Determine Next GLOBAL Page Number
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

    // 2. Create Folders
    await fs.promises.mkdir(chapterPath, { recursive: true });
    await fs.promises.mkdir(firstPagePath, { recursive: true });

    // 3. Initialize first page (Atomic scaffold)
    const pageId = firstPageName;
    const pageJson = {
        header: {
            version: "2.0",
            pageId: pageId,
            chapter: chapterFolderName,
            volume: volumeFolderName,
            layout: { id: "Standard_Page", html: "Standard_Page.html", css: "" },
            ambientAudio: {}
        },
        media: [],
        scene: []
    };

    const css = `@import url('/layouts/styles/base-comic-layout.css');\n\n.${pageId} {\n\n}`;
    const js = "export async function onPageLoad(container, pageInfo) {\n" +
               "    container.addEventListener('view_visible', async () => { console.log(`Page ${pageInfo.pageId} is visible.`); });\n" +
               "    container.addEventListener('view_hidden', () => { console.log(`Page ${pageInfo.pageId} is hidden.`); });\n" +
               "    container.addEventListener('panel_media_changed', (e) => {\n" +
               "        const { panelSelector, type, fileName, action } = e.detail;\n" +
               "        console.log(`Panel ${panelSelector} changed:`, { type, fileName, action });\n" +
               "    });\n}";

    await fs.promises.writeFile(path.join(firstPagePath, 'page.json'), JSON.stringify(pageJson, null, 2));
    await fs.promises.writeFile(path.join(firstPagePath, 'page.js'), js);
    await fs.promises.writeFile(path.join(firstPagePath, 'page.css'), css);
    
    // Create asset subfolders
    await fs.promises.mkdir(path.join(firstPagePath, "assets", "image"), { recursive: true });
    await fs.promises.mkdir(path.join(firstPagePath, "assets", "video"), { recursive: true });
    await fs.promises.mkdir(path.join(firstPagePath, "assets", "audio"), { recursive: true });

    // 4. Update Database
    const VolumeModel = require('../models/Volume');
    const volPathRegex = new RegExp(`${volumeFolderName}[\\\\/]?$`, 'i');
    const volume = await VolumeModel.findOne({ volumePath: volPathRegex });
    if (volume) {
        await updateChaptersFromFS(volume);
    }

    return { 
        ok: true, 
        message: `Chapter ${chapIdx} created with ${firstPageName}`,
        chapter: chapterFolderName,
        pageId: firstPageName
    };
}

async function updateInternalFiles(dir, oldName, newName) {
    const files = await fs.promises.readdir(dir);
    for (const f of files) {
        if (f.startsWith(oldName)) { 
            const newF = f.replace(oldName, newName);
            await tryRename(path.join(dir, f), path.join(dir, newF));
        }
    }
    
    // Update JSON pageId
    const jsonPath = path.join(dir, 'page.json');
    if (fs.existsSync(jsonPath)) {
        try {
            const data = JSON.parse(await fs.promises.readFile(jsonPath, 'utf8'));
            if (data.header && data.header.pageId === oldName) {
                data.header.pageId = newName;
                await fs.promises.writeFile(jsonPath, JSON.stringify(data, null, 2));
            }
        } catch(e) {}
    }
}

async function tryRename(oldP, newP, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            await fs.promises.rename(oldP, newP);
            return;
        } catch (e) {
            if (e.code === 'EPERM' && i < retries - 1) {
                console.log(`    Locked... retrying ${path.basename(oldP)} (${i+1}/${retries})`);
                await new Promise(r => setTimeout(r, 500));
            } else {
                throw e;
            }
        }
    }
}

module.exports = { createVolume, populatePagesFromFS: updateChaptersFromFS, updateChaptersFromFS, syncSinglePage, insertPage, createChapter };