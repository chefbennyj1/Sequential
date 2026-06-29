const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const AccountsController = require('../controllers/AccountsController.js');
const { isAdmin } = require('../middleware/auth.js');

const requestLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    keyGenerator: (req) => req.ip,
    handler: (req, res) => {
        res.status(429).json({
            ok: false,
            message: 'Too many account requests from this IP. Please try again later.'
        });
    }
});

// Public
router.post('/request', requestLimiter, AccountsController.requestAccount);

// Admin only
router.get('/requests',         isAdmin, AccountsController.getRequests);
router.get('/users',            isAdmin, AccountsController.getUsers);
router.post('/create',          isAdmin, AccountsController.createAccount);
router.post('/approve/:requestId', isAdmin, AccountsController.approveRequest);
router.post('/deny/:requestId',    isAdmin, AccountsController.denyRequest);
router.delete('/delete/:userId',   isAdmin, AccountsController.deleteAccount);

module.exports = router;
