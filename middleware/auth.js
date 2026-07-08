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

  res.redirect('/login?returnTo=' + encodeURIComponent(req.originalUrl));
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

function checkAccess(req, res, next, allowedRoles, fallbackRoute, errorMessage) {
    if (req.headers['x-export-secret'] === INTERNAL_SECRET || req.query.exportSecret === INTERNAL_SECRET) {
        return next();
    }

    if (!req.session.isAuth) {
        if (req.xhr || req.originalUrl.startsWith('/api')) {
            return res.status(401).json({ ok: false, message: "Unauthorized" });
        }
        return res.redirect('/login?returnTo=' + encodeURIComponent(req.originalUrl));
    }

    if (allowedRoles.includes(req.session.role)) {
        return next();
    }

    if (req.xhr || req.originalUrl.startsWith('/api')) {
        return res.status(403).json({ ok: false, message: errorMessage });
    }
    res.redirect(fallbackRoute);
}

/**
 * Checks if the user has moderator or admin privileges.
 */
exports.isModerator = async (req, res, next) => {
    checkAccess(req, res, next, ['moderator', 'admin'], '/library', "Forbidden: Moderator access required");
};

/**
 * Checks if the user has administrator privileges.
 */
exports.isAdmin = async (req, res, next) => {
    checkAccess(req, res, next, ['admin'], '/dashboard', "Forbidden: Admin access required");
};
