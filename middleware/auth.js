// Middleware to handle authentication checks for web and API routes

// Secret for internal tools (e.g., headless PNG Exporter). Set via INTERNAL_EXPORT_SECRET in .env.
const INTERNAL_SECRET = process.env.INTERNAL_EXPORT_SECRET;

/**
 * Redirects to /login if the user is not authenticated.
 * Detects API requests to return 401 instead of a redirect.
 */
exports.isAuth = (req, res, next) => {
  // Bypass for headless exporter
  if (req.headers['x-export-secret'] === INTERNAL_SECRET || req.query.exportSecret === INTERNAL_SECRET) {
    return next();
  }

  if (req.session.isAuth) {
    return next();
  }

  // Detect API/AJAX requests
  if (req.xhr || req.originalUrl.startsWith('/api')) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }

  res.redirect('/login');
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
        if (req.xhr || req.originalUrl.startsWith('/api')) {
            return res.status(401).json({ ok: false, message: "Unauthorized" });
        }
        return res.redirect('/login');
    }

    if (req.session.role === 'moderator' || req.session.role === 'admin') {
        next();
    } else {
        if (req.xhr || req.originalUrl.startsWith('/api')) {
            return res.status(403).json({ ok: false, message: "Forbidden: Moderator access required" });
        }
        res.redirect('/library'); // Basic users go to library
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
        if (req.xhr || req.originalUrl.startsWith('/api')) {
            return res.status(401).json({ ok: false, message: "Unauthorized" });
        }
        return res.redirect('/login');
    }

    if (req.session.role === 'admin') {
        next();
    } else {
        if (req.xhr || req.originalUrl.startsWith('/api')) {
            return res.status(403).json({ ok: false, message: "Forbidden: Admin access required" });
        }
        res.redirect('/dashboard'); // Moderators go back to dashboard
    }
};
