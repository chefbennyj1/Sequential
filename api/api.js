// API ENDPOINTS
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();

console.log('[API] Initializing API routes...');

// Controllers
const UserController = require('../controllers/UserController.js');
const VolumeController = require('../controllers/VolumeController.js');
const MediaController = require('../controllers/MediaController.js');
const ExportController = require('../controllers/ExportController.js');
const LibraryController = require('../controllers/LibraryController.js');
const ScheduledTaskController = require('../controllers/ScheduledTaskController.js');
const CharacterController = require('../controllers/CharacterController.js');
const CriticController = require('../controllers/CriticController.js');
const SiteController = require('../controllers/SiteController.js');

// Editor Controllers
const PageLayoutController = require('../controllers/PageLayoutController.js');
const AssetUploadController = require('../controllers/AssetUploadController.js');
const PageDataController = require('../controllers/PageDataController.js');
const PageStructureController = require('../controllers/PageStructureController.js');
const SystemSettingsController = require('../controllers/SystemSettingsController.js');
const VisionController = require('../controllers/VisionController.js');
const StyleLabController = require('../controllers/StyleLabController.js');

const { isAuthApi: isAuth, isModerator, isAdmin } = require('../middleware/auth.js');

// --- Multer: Character Avatar Upload ---
const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const charId = req.params.id;
        if (!charId) return cb(new Error('Character ID is required for upload'));
        const dir = path.join(__dirname, `../views/public/images/characters/${charId}/avatar`);
        const refDir = path.join(__dirname, `../views/public/images/characters/${charId}/references`);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (!fs.existsSync(refDir)) fs.mkdirSync(refDir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `avatar-${Date.now()}${path.extname(file.originalname)}`)
});
const uploadAvatar = multer({ storage: avatarStorage });

// --- Multer: Character Reference Image Upload ---
const referenceStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const charId = req.params.id;
        if (!charId) return cb(new Error('Character ID is required for upload'));
        const dir = path.join(__dirname, `../views/public/images/characters/${charId}/references`);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `ref-${Date.now()}${path.extname(file.originalname)}`)
});
const uploadReference = multer({ storage: referenceStorage });

// --- Multer: User Avatar Upload ---
const userAvatarStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const userId = req.session.userId;
        if (!userId) return cb(new Error('Not authenticated'));
        const dir = path.join(__dirname, `../views/public/images/users/${userId}`);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `avatar${path.extname(file.originalname).toLowerCase()}`)
});
const uploadUserAvatar = multer({
    storage: userAvatarStorage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        allowed.includes(path.extname(file.originalname).toLowerCase())
            ? cb(null, true)
            : cb(new Error('Only image files are allowed.'));
    }
});

// --- TEST ROUTE ---
router.get('/test', (req, res) => res.json({ ok: true, message: "API is working" }));

// --- PLUGIN / SYSTEM NOTIFICATIONS ---
router.all('/toast', (req, res) => {
    // Internal API Security: Validate the runtime secret
    const incomingSecret = req.headers['x-sequential-secret'];
    const systemSecret = req.app.locals.systemSecret;
    
    if (!systemSecret || incomingSecret !== systemSecret) {
        return res.status(403).json({ ok: false, message: "Unauthorized: Invalid or missing API Secret" });
    }
    
    const type = req.query.type || req.body.type || 'info';
    const header = req.query.header || req.body.header || 'Notification';
    const message = req.query.message || req.body.message || '';
    
    if (req.app.locals.io) {
        req.app.locals.io.emit('plugin_toast', { type, title: header, message });
    }
    
    res.json({ ok: true });
});

// --- PLUGIN MANAGEMENT ---
const PluginLoader = require('../services/PluginLoader.js');
router.get('/plugins/list', isAdmin, (req, res) => {
    try {
        const plugins = PluginLoader.getAvailablePlugins();
        res.json({ ok: true, plugins });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

router.get('/plugins/hooks/:hookName', isModerator, (req, res) => {
    try {
        const subscribers = PluginLoader.getHookSubscribers(req.params.hookName);
        res.json({ ok: true, subscribers });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

router.post('/plugins/toggle', isAdmin, (req, res) => {
    try {
        const { folderName, enabled } = req.body;
        PluginLoader.togglePlugin(folderName, enabled);
        res.json({ ok: true, message: `Plugin ${folderName} set to ${enabled ? 'enabled' : 'disabled'}. Note: Requires server restart to take effect.` });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

// --- SYSTEM POWER (shutdown / restart from the dashboard) ---

// Boots a fresh server after this process exits. The delay lets the old
// process release port 3000 before the new one binds it.
function relaunchDetached() {
    const { spawn } = require('child_process');
    const nodePath = process.argv[0];
    const script = process.argv[1];
    if (process.platform === 'win32') {
        const command = `Start-Sleep -Seconds 2; & '${nodePath.replace(/'/g, "''")}' '${script.replace(/'/g, "''")}'`;
        spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', command],
            { detached: true, stdio: 'ignore', cwd: process.cwd() }).unref();
    } else {
        spawn('/bin/sh', ['-c', `sleep 2; "${nodePath}" "${script}"`],
            { detached: true, stdio: 'ignore', cwd: process.cwd() }).unref();
    }
}

router.post('/system/shutdown', isAdmin, async (req, res) => {
    console.log('[System] Shutdown requested from the dashboard.');
    res.json({ ok: true, message: 'Server shutting down.' });
    await PluginLoader.shutdownAll();
    setTimeout(() => process.exit(0), 500);
});

router.post('/system/restart', isAdmin, async (req, res) => {
    console.log('[System] Restart requested from the dashboard.');
    res.json({ ok: true, message: 'Server restarting.' });
    await PluginLoader.shutdownAll();
    relaunchDetached();
    setTimeout(() => process.exit(0), 500);
});

// --- NOTIFICATIONS ---
const NotificationController = require('../controllers/NotificationController.js');
router.get('/notifications', isAuth, (req, res) => NotificationController.list(req, res));
router.post('/notifications', isAuth, (req, res) => NotificationController.create(req, res));
router.put('/notifications/read-all', isAuth, (req, res) => NotificationController.markAllRead(req, res));
router.put('/notifications/:id/read', isAuth, (req, res) => NotificationController.markRead(req, res));

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
router.post('/editor/toggle-spread', isModerator, PageLayoutController.toggleSpread);
router.get('/editor/panels/:series/:volume/:chapter/:pageId', isModerator, PageLayoutController.getPanels);
router.get('/editor/preview/:series/:volume/:chapter/:pageId', isModerator, PageLayoutController.servePreview);

// 2. Asset Management (AssetUploadController)
router.get('/editor/assets/:series/:volume/:chapter/:pageId/:type', isModerator, AssetUploadController.getAssets);
router.post('/editor/upload-asset', isModerator, AssetUploadController.uploadMiddleware, AssetUploadController.uploadAsset);
router.post('/editor/flip-asset', isModerator, AssetUploadController.flipAsset);

// 3. Page Data (PageDataController)
router.get('/editor/scene/:series/:volume/:chapter/:pageId', isModerator, PageDataController.getScene);
router.get('/editor/media/:series/:volume/:chapter/:pageId', isModerator, PageDataController.getMedia);
router.post('/editor/scene/:series/:volume/:chapter/:pageId', isModerator, PageDataController.saveScene);
router.post('/editor/media/:series/:volume/:chapter/:pageId', isModerator, PageDataController.saveMedia);
router.post('/editor/sync-page/:series/:volumeId/:chapter/:pageId', isModerator, PageDataController.syncPage);
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

// --- CHARACTERS ---
router.get('/characters', isAuth, CharacterController.getAll);
router.get('/characters/:name', isAuth, CharacterController.getOne);
router.post('/characters', isAuth, CharacterController.create);
router.put('/characters/:id', isAuth, CharacterController.update);
router.delete('/characters/:id', isAuth, CharacterController.delete);
router.post('/characters/:id/avatar', isAuth, uploadAvatar.single('avatar'), (req, res) => CharacterController.uploadAvatar(req, res));
router.post('/characters/:id/analyze-avatar', isAuth, (req, res) => CharacterController.analyzeAvatar(req, res));
router.post('/characters/:id/reference', isAuth, uploadReference.single('image'), (req, res) => CharacterController.uploadReferenceImage(req, res));

// --- FONTS ---
router.get('/fonts', isAuth, SiteController.getAvailableFonts);

// --- STORY CRITIC ---
router.get('/critic/analyze/:series/:volumeId', isAuth, CriticController.analyzeVolume);

// --- USER ROUTES ---
router.post("/user/register", UserController.registerUser);
router.get('/user', isAuth, UserController.getUser);
router.post('/user/update', isAuth, UserController.updateUser);
router.post('/user/avatar', isAuth, uploadUserAvatar.single('avatar'), UserController.uploadAvatar);

// --- STYLE LAB ROUTES ---
router.get('/style-lab/:seriesId', isModerator, StyleLabController.getSettings);
router.put('/style-lab/:seriesId', isModerator, StyleLabController.updateSettings);
router.post('/style-lab/upload-css', isModerator, StyleLabController.uploadMiddleware, StyleLabController.uploadCss);
router.post('/style-lab/delete-css', isModerator, StyleLabController.deleteCss);

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
