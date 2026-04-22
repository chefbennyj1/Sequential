// Middleware to handle authentication checks for web and API routes

// Hardcoded secret for internal tools (like PNG Exporter)
const INTERNAL_SECRET = 'sequential_internal_export_key_2026';

/**
 * Redirects to /login if the user is not authenticated.
 */
exports.isAuth = (req, res, next) => {
  // Bypass for headless exporter
  if (req.headers['x-export-secret'] === INTERNAL_SECRET || req.query.exportSecret === INTERNAL_SECRET) {
    return next();
  }

  if (req.session.isAuth) {
    next();
  } else {
    res.redirect('/login');
  }
};

/**
 * Returns a 401 Unauthorized JSON response if the user is not authenticated.
 */
exports.isAuthApi = (req, res, next) => {
  // Bypass for headless exporter
  if (req.headers['x-export-secret'] === INTERNAL_SECRET || req.query.exportSecret === INTERNAL_SECRET) {
    return next();
  }

  if (req.session.isAuth) {
    next();
  } else {
    res.status(401).json({ ok: false, message: "Unauthorized" });
  }
};

/**
 * Checks if the user has moderator or admin privileges.
 */
exports.isModerator = async (req, res, next) => {
    if (req.headers['x-export-secret'] === INTERNAL_SECRET || req.query.exportSecret === INTERNAL_SECRET) {
        return next();
    }

    if (!req.session.isAuth) {
        if (req.xhr || req.path.startsWith('/api')) {
            return res.status(401).json({ ok: false, message: "Unauthorized" });
        }
        return res.redirect('/login');
    }

    const User = require('../models/User');
    try {
        const user = await User.findById(req.session.userId);
        if (user && (user.role === 'moderator' || user.role === 'admin')) {
            next();
        } else {
            if (req.xhr || req.path.startsWith('/api')) {
                return res.status(403).json({ ok: false, message: "Forbidden: Moderator access required" });
            }
            res.redirect('/library'); // Basic users go to library
        }
    } catch (err) {
        res.status(500).send("Server error during role check");
    }
};

/**
 * Checks if the user has administrator privileges.
 */
exports.isAdmin = async (req, res, next) => {
    if (req.headers['x-export-secret'] === INTERNAL_SECRET || req.query.exportSecret === INTERNAL_SECRET) {
      return next();
    }

    if (!req.session.isAuth) {
        if (req.xhr || req.path.startsWith('/api')) {
            return res.status(401).json({ ok: false, message: "Unauthorized" });
        }
        return res.redirect('/login');
    }

    const User = require('../models/User');
    try {
        const user = await User.findById(req.session.userId);
        if (user && user.role === 'admin') {
            next();
        } else {
            if (req.xhr || req.path.startsWith('/api')) {
                return res.status(403).json({ ok: false, message: "Forbidden: Admin access required" });
            }
            res.redirect('/dashboard'); // Moderators go back to dashboard
        }
    } catch (err) {
        res.status(500).send("Server error during admin check");
    }
};
