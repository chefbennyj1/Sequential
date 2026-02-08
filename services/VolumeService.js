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

module.exports = { createVolume, populatePagesFromFS: updateChaptersFromFS, updateChaptersFromFS, syncSinglePage };