//API ENDPOINTS
const express = require("express");
const router = express.Router();

// Controllers
const UserController = require('../controllers/UserController.js');
const VolumeController = require('../controllers/VolumeController.js');
const MediaController = require('../controllers/MediaController.js');
const EditorController = require('../controllers/EditorController.js');
const ExportController = require('../controllers/ExportController.js');

const { isAuthApi: isAuth, isModerator, isAdmin } = require('../middleware/auth.js');

// --- EDITOR ROUTES ---
router.get('/editor/layouts', isModerator, EditorController.getLayouts);
router.get('/editor/next-page-id', isModerator, EditorController.getNextPageId);
router.get('/editor/next-panel-id', isModerator, EditorController.getNextPanelId);
router.get('/editor/chapter-range', isModerator, EditorController.getChapterRange);
router.post('/editor/export-volume/:series/:volume', isAdmin, ExportController.exportVolume);
router.post('/editor/export-script/:series/:volume', isModerator, ExportController.exportScript);
router.get('/editor/preview/:series/:volume/:chapter/:pageId', isModerator, EditorController.servePreview);
router.get('/editor/scene/:series/:volume/:chapter/:pageId', isModerator, EditorController.getScene);
router.get('/editor/media/:series/:volume/:chapter/:pageId', isModerator, EditorController.getMedia);
router.post('/editor/create-page', isAdmin, EditorController.createPage);
router.post('/editor/upload-asset', isModerator, EditorController.uploadMiddleware, EditorController.uploadAsset);
router.get('/editor/panels/:series/:volume/:chapter/:pageId', isModerator, EditorController.getPanels);
router.get('/editor/assets/:series/:volume/:chapter/:pageId/:type', isModerator, EditorController.getAssets);
router.post('/editor/scene/:series/:volume/:chapter/:pageId', isModerator, EditorController.saveScene);
router.post('/editor/media/:series/:volume/:chapter/:pageId', isModerator, EditorController.saveMedia);
router.post('/editor/sync-page/:volumeId/:chapter/:pageId', isModerator, EditorController.syncPage);
router.post('/editor/change-layout', isModerator, EditorController.changeLayout);
router.post('/editor/insert-page', isAdmin, EditorController.insertPage);
router.post('/editor/create-chapter', isAdmin, EditorController.createChapter);

// Plot Lab Routes
router.get('/editor/plot-board/:series', isModerator, EditorController.getPlotBoard);
router.post('/editor/plot-board/:series', isModerator, EditorController.savePlotBoard);

// --- USER ROUTES ---
router.post("/user/register", UserController.registerUser);
router.get('/user', isAuth, UserController.getUser);
router.post('/user/update', isAdmin, UserController.updateUser); // Only admin can update users

// --- VOLUME ROUTES ---
const LibraryController = require('../controllers/LibraryController.js');
router.get('/library/series', isAuth, LibraryController.getSeries);
router.get('/library/series/:seriesId', isAuth, LibraryController.getSeriesDetails);
router.put('/library/series/:seriesId/settings', isModerator, LibraryController.updateSeriesSettings);

router.post('/volume/create', isAdmin, VolumeController.createVolume);
router.get('/volumes', isModerator, VolumeController.getVolumes);
router.get('/volumes/:volumeId/chapters', isModerator, VolumeController.getChapters);
router.get('/volumes/:volumeId/chapters/:chapterId', isModerator, VolumeController.getChapterDetails);
router.put('/volumes/:volumeId/chapters/:chapterId', isModerator, VolumeController.updateChapter);

// --- VOLUME VIEW ROUTES (Public/Auth) ---
router.get('/volume/:id', isAuth, VolumeController.getVolumeById);
router.get('/volume/:id/chapter/:chapterNumber', isAuth, VolumeController.getChapterPages);

// --- MEDIA ROUTES ---
router.get('/images/:series/volumes/*path', isAuth, MediaController.serveImage); // Named series
router.get('/images/volumes/*path', isAuth, MediaController.serveImage); // Legacy fallback
router.get("/images/:series/:volume/:chapter/:pageId/assets/:file", isAuth, MediaController.servePageImage); 

// --- SCENE & MEDIA DATA ROUTES ---
router.get('/scene/:series/:volume/:chapter/:pageId', isAuth, MediaController.getScene);
router.get('/media/:series/:volume/:chapter/:pageId', isAuth, MediaController.getMedia);
router.get('/scene/:volume/:chapter/:pageId', isAuth, MediaController.getScene); // Legacy
router.get('/media/:volume/:chapter/:pageId', isAuth, MediaController.getMedia); // Legacy
router.get('/landing-page/images', MediaController.getLandingPageImages);
router.get('/landing-page/library', LibraryController.getLandingLibrary);

const ScheduledTaskController = require('../controllers/ScheduledTaskController.js');

// --- SCHEDULED TASKS & LIBRARY ROUTES ---
router.get('/library/roots', isAdmin, ScheduledTaskController.getLibraryRoots);
router.post('/library/roots', isAdmin, ScheduledTaskController.addLibraryRoot);
router.delete('/library/roots/:id', isAdmin, ScheduledTaskController.deleteLibraryRoot);
router.post('/library/scan', isAdmin, ScheduledTaskController.triggerScan);

module.exports = router;
