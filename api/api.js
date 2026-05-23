//API ENDPOINTS
const express = require("express");
const router = express.Router();

// Controllers
const UserController = require('../controllers/UserController.js');
const VolumeController = require('../controllers/VolumeController.js');
const MediaController = require('../controllers/MediaController.js');
const ExportController = require('../controllers/ExportController.js');
const LibraryController = require('../controllers/LibraryController.js');
const ScheduledTaskController = require('../controllers/ScheduledTaskController.js');

// New Specialized Editor Controllers
const PageLayoutController = require('../controllers/PageLayoutController.js');
const AssetUploadController = require('../controllers/AssetUploadController.js');
const PageDataController = require('../controllers/PageDataController.js');
const PageStructureController = require('../controllers/PageStructureController.js');
const SystemSettingsController = require('../controllers/SystemSettingsController.js');
const VisionController = require('../controllers/VisionController.js');

const { isAuthApi: isAuth, isModerator, isAdmin } = require('../middleware/auth.js');

// --- SYSTEM SETTINGS ---
router.get('/settings/global', isAdmin, SystemSettingsController.getGlobalSettings);
router.put('/settings/global', isAdmin, SystemSettingsController.updateGlobalSettings);
router.post('/vision/scan', isModerator, (req, res) => VisionController.processPendingDescriptions(req, res));
router.post('/vision/stop', isModerator, (req, res) => VisionController.stopVisionScan(req, res));

// --- EDITOR ROUTES ---

// 1. Layout & Panels (PageLayoutController)
router.get('/editor/layouts', isModerator, PageLayoutController.getLayouts);
router.get('/editor/next-panel-id', isModerator, PageLayoutController.getNextPanelId);
router.post('/editor/change-layout', isModerator, PageLayoutController.changeLayout);
router.get('/editor/panels/:series/:volume/:chapter/:pageId', isModerator, PageLayoutController.getPanels);
router.get('/editor/preview/:series/:volume/:chapter/:pageId', isModerator, PageLayoutController.servePreview);

// 2. Asset Management (AssetUploadController)
router.get('/editor/assets/:series/:volume/:chapter/:pageId/:type', isModerator, AssetUploadController.getAssets);
router.post('/editor/upload-asset', isModerator, AssetUploadController.uploadMiddleware, AssetUploadController.uploadAsset);

// 3. Page Data (PageDataController)
router.get('/editor/scene/:series/:volume/:chapter/:pageId', isModerator, PageDataController.getScene);
router.get('/editor/media/:series/:volume/:chapter/:pageId', isModerator, PageDataController.getMedia);
router.post('/editor/scene/:series/:volume/:chapter/:pageId', isModerator, PageDataController.saveScene);
router.post('/editor/media/:series/:volume/:chapter/:pageId', isModerator, PageDataController.saveMedia);
router.post('/editor/sync-page/:volumeId/:chapter/:pageId', isModerator, PageDataController.syncPage);
router.get('/editor/plot-board/:series', isModerator, PageDataController.getPlotBoard);
router.post('/editor/plot-board/:series', isModerator, PageDataController.savePlotBoard);

// 4. Page Structure & Scaffolding (PageStructureController)
router.get('/editor/next-page-id', isModerator, PageStructureController.getNextPageId);
router.get('/editor/chapter-range', isModerator, PageStructureController.getChapterRange);
router.post('/editor/create-page', isAdmin, PageStructureController.createPage);
router.post('/editor/insert-page', isAdmin, PageStructureController.insertPage);
router.post('/editor/reorder-pages', isAdmin, PageStructureController.reorderPages);
router.post('/editor/create-chapter', isAdmin, PageStructureController.createChapter);

// --- EXPORT ROUTES ---
router.post('/editor/export-volume/:series/:volume', isAdmin, ExportController.exportVolume);
router.post('/editor/export-script/:series/:volume', isModerator, ExportController.exportScript);

// --- USER ROUTES ---
router.post("/user/register", UserController.registerUser);
router.get('/user', isAuth, UserController.getUser);
router.post('/user/update', isAdmin, UserController.updateUser); 

// --- LIBRARY & VOLUME ROUTES ---
router.get('/library/series', isAuth, LibraryController.getSeries);
router.get('/library/series/:seriesId', isAuth, LibraryController.getSeriesDetails);
router.put('/library/series/:seriesId/settings', isModerator, LibraryController.updateSeriesSettings);
router.get('/landing-page/library', LibraryController.getLandingLibrary);

router.post('/volume/create', isAdmin, VolumeController.createVolume);
router.get('/volumes', isModerator, VolumeController.getVolumes);
router.get('/volumes/:volumeId/chapters', isModerator, VolumeController.getChapters);
router.get('/volumes/:volumeId/chapters/:chapterId', isModerator, VolumeController.getChapterDetails);
router.put('/volumes/:volumeId/chapters/:chapterId', isModerator, VolumeController.updateChapter);

// --- VOLUME VIEW ROUTES (Public/Auth) ---
router.get('/volume/:id', isAuth, VolumeController.getVolumeById);
router.get('/volume/:id/chapter/:chapterNumber', isAuth, VolumeController.getChapterPages);

// --- MEDIA ROUTES ---
router.get('/images/:series/volumes/*path', isAuth, MediaController.serveImage); 
router.get('/images/volumes/*path', isAuth, MediaController.serveImage); 
router.get("/images/:series/:volume/:chapter/:pageId/assets/:file", isAuth, MediaController.servePageImage); 
router.get("/images/:series/characters/:charId/:type/:file", isAuth, MediaController.serveCharacterImage); 
router.get('/scene/:series/:volume/:chapter/:pageId', isAuth, MediaController.getScene);
router.get('/media/:series/:volume/:chapter/:pageId', isAuth, MediaController.getMedia);
router.get('/landing-page/images', MediaController.getLandingPageImages);

// --- SCHEDULED TASKS & ADMIN ROUTES ---
router.get('/library/roots', isAdmin, ScheduledTaskController.getLibraryRoots);
router.post('/library/roots', isAdmin, ScheduledTaskController.addLibraryRoot);
router.delete('/library/roots/:id', isAdmin, ScheduledTaskController.deleteLibraryRoot);
router.post('/library/scan', isAdmin, ScheduledTaskController.triggerScan);

module.exports = router;
