//API ENDPOINTS
const express = require("express");
const router = express.Router();

// Controllers
const UserController = require('../controllers/UserController.js');
const VolumeController = require('../controllers/VolumeController.js');
const MediaController = require('../controllers/MediaController.js');
const EditorController = require('../controllers/EditorController.js');

const { isAuthApi: isAuth } = require('../middleware/auth.js');

// --- EDITOR ROUTES ---
router.get('/editor/layouts', isAuth, EditorController.getLayouts);
router.get('/editor/preview/:series/:volume/:chapter/:pageId', isAuth, EditorController.servePreview);
router.get('/editor/scene/:series/:volume/:chapter/:pageId', isAuth, EditorController.getScene);
router.post('/editor/create-page', isAuth, EditorController.createPage);
router.post('/editor/upload-asset', isAuth, EditorController.uploadMiddleware, EditorController.uploadAsset);
router.post('/editor/ambient-audio', isAuth, EditorController.uploadMiddleware, EditorController.uploadAmbientAudio);
router.post('/editor/set-ambient', isAuth, EditorController.setPageAmbientAudio);
router.post('/editor/ambient-volume', isAuth, EditorController.updateAmbientVolume);
router.get('/editor/panels/:series/:volume/:chapter/:pageId', isAuth, EditorController.getPanels);
router.get('/editor/assets/:series/:volume/:chapter/:pageId/:type', isAuth, EditorController.getAssets);
router.post('/editor/scene/:series/:volume/:chapter/:pageId', isAuth, EditorController.saveScene);
router.post('/editor/media/:series/:volume/:chapter/:pageId', isAuth, EditorController.saveMedia);
router.post('/editor/sync-page/:volumeId/:chapter/:pageId', isAuth, EditorController.syncPage);
router.post('/editor/change-layout', isAuth, EditorController.changeLayout);

// --- USER ROUTES ---
router.post("/user/register", UserController.registerUser);
router.get('/user', isAuth, UserController.getUser);
router.post('/user/update', isAuth, UserController.updateUser);

// --- VOLUME ROUTES ---
const LibraryController = require('../controllers/LibraryController.js');
router.get('/library/series', isAuth, LibraryController.getSeries);
router.get('/library/series/:seriesId', isAuth, LibraryController.getSeriesDetails);

router.post('/volume/create', isAuth, VolumeController.createVolume);
router.get('/volumes', isAuth, VolumeController.getVolumes);
router.get('/volumes/:volumeId/chapters', isAuth, VolumeController.getChapters);
router.get('/volumes/:volumeId/chapters/:chapterId', isAuth, VolumeController.getChapterDetails);
router.put('/volumes/:volumeId/chapters/:chapterId', isAuth, VolumeController.updateChapter);

router.get('/volumes/:volumeId/audio-map', isAuth, VolumeController.getAudioMap);
router.post('/volumes/:volumeId/audio-map', isAuth, VolumeController.updateAudioMap);

// --- VOLUME VIEW ROUTES (Public/Auth) ---
router.get('/volume/:id', isAuth, VolumeController.getVolumeById);
router.get('/volume/:id/chapter/:chapterNumber', isAuth, VolumeController.getChapterPages);

// --- MEDIA ROUTES ---
router.get('/images/:series/volumes/*path', isAuth, MediaController.serveImage); // Named series
router.get('/images/volumes/*path', isAuth, MediaController.serveImage); // Legacy fallback
router.get("/images/:series/:volume/:chapter/:page/assets/:file", isAuth, MediaController.servePageImage);
router.get("/api/images/:series/:volume/:chapter/:pageId/assets/:file", isAuth, MediaController.servePageImage); 

// --- SCENE & MEDIA DATA ROUTES ---
router.get('/scene/:series/:volume/:chapter/:pageId', isAuth, MediaController.getScene);
router.get('/media/:series/:volume/:chapter/:pageId', isAuth, MediaController.getMedia);
router.get('/scene/:volume/:chapter/:pageId', isAuth, MediaController.getScene); // Legacy
router.get('/media/:volume/:chapter/:pageId', isAuth, MediaController.getMedia); // Legacy
router.get('/landing-page/images', MediaController.getLandingPageImages);
router.get('/landing-page/library', LibraryController.getLandingLibrary);

const ScheduledTaskController = require('../controllers/ScheduledTaskController.js');

// --- SCHEDULED TASKS & LIBRARY ROUTES ---
router.get('/library/roots', isAuth, ScheduledTaskController.getLibraryRoots);
router.post('/library/roots', isAuth, ScheduledTaskController.addLibraryRoot);
router.delete('/library/roots/:id', isAuth, ScheduledTaskController.deleteLibraryRoot);
router.post('/library/scan', isAuth, ScheduledTaskController.triggerScan);

module.exports = router;
