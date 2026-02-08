const express = require("express");
const router = express.Router();

// Controllers
const SiteController = require('../controllers/SiteController.js');
const DashboardController = require('../controllers/DashboardController.js');
const ViewerController = require('../controllers/ViewerController.js');

const { isAuth } = require('../middleware/auth.js');

// LANDING PAGE
router.get("/", SiteController.getLandingPage);

// LIBRARY
router.get("/library", isAuth, SiteController.getLibrary);
router.get("/library/series/:seriesId", isAuth, SiteController.getSeriesVolumes);
router.get("/library/series/:seriesId/volume/:volumeId", isAuth, SiteController.getVolumeChapters);

// LOGIN PAGE
router.get('/login', SiteController.getLogin);

// DASHBOARD
router.get('/dashboard', isAuth, DashboardController.getDashboard);

// VIEWER
router.get("/viewer", isAuth, ViewerController.getViewer);

// API ROUTES
const ScheduledTaskController = require('../controllers/ScheduledTaskController.js');
router.get('/api/library/roots', isAuth, ScheduledTaskController.getLibraryRoots);
router.post('/api/library/roots', isAuth, ScheduledTaskController.addLibraryRoot);
router.delete('/api/library/roots/:id', isAuth, ScheduledTaskController.deleteLibraryRoot);
router.post('/api/library/scan', isAuth, ScheduledTaskController.triggerScan);

const CharacterController = require('../controllers/CharacterController.js');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const charId = req.params.id;
        if (!charId) return cb(new Error('Character ID is required for upload'));
        
        const dir = path.join(__dirname, `../views/public/images/characters/${charId}/avatar`);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        // Also create references folder while we are at it
        const refDir = path.join(__dirname, `../views/public/images/characters/${charId}/references`);
        if (!fs.existsSync(refDir)) fs.mkdirSync(refDir, { recursive: true });

        cb(null, dir);
    },
    filename: (req, file, cb) => {
        // Keep original name or standardize? Let's use 'avatar' + ext to keep it simple, or timestamp.
        // Timestamp avoids caching issues.
        const uniqueSuffix = Date.now();
        cb(null, `avatar-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});
const uploadAvatar = multer({ storage: avatarStorage });

const referenceStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const charId = req.params.id;
        if (!charId) return cb(new Error('Character ID is required for upload'));
        
        const dir = path.join(__dirname, `../views/public/images/characters/${charId}/references`);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now();
        cb(null, `ref-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});
const uploadReference = multer({ storage: referenceStorage });

router.get('/api/characters', isAuth, CharacterController.getAll);
router.get('/api/characters/:name', isAuth, CharacterController.getOne);
router.post('/api/characters', isAuth, CharacterController.create);
router.put('/api/characters/:id', isAuth, CharacterController.update);
router.delete('/api/characters/:id', isAuth, CharacterController.delete);
router.post('/api/characters/:id/avatar', isAuth, uploadAvatar.single('avatar'), CharacterController.uploadAvatar);
router.post('/api/characters/:id/reference', isAuth, uploadReference.single('image'), CharacterController.uploadReferenceImage);

module.exports = router;
