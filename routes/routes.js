const express = require('express');
const router = express.Router();

const SiteController = require('../controllers/SiteController.js');
const DashboardController = require('../controllers/DashboardController.js');
const ViewerController = require('../controllers/ViewerController.js');

const { isAuth } = require('../middleware/auth.js');

// --- HTML PAGE ROUTES ---

// Landing
router.get('/', SiteController.getLandingPage);

// Auth
router.get('/login', SiteController.getLogin);

// Library browser (shells — data loaded via API)
router.get('/library', isAuth, SiteController.getLibrary);
router.get('/library/series/:seriesId', isAuth, SiteController.getSeriesVolumes);
router.get('/library/series/:seriesId/volume/:volumeId', isAuth, SiteController.getVolumeChapters);

// Dashboard
router.get('/dashboard', isAuth, DashboardController.getDashboard);

// Viewer
router.get('/viewer', isAuth, ViewerController.getViewer);

module.exports = router;

