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
