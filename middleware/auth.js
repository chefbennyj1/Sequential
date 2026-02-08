// Middleware to handle authentication checks for web and API routes

/**
 * Redirects to /login if the user is not authenticated.
 * Suitable for HTML/Page routes.
 */
exports.isAuth = (req, res, next) => {
  if (req.session.isAuth) {
    next();
  } else {
    res.redirect('/login');
  }
};

/**
 * Returns a 401 Unauthorized JSON response if the user is not authenticated.
 * Suitable for API/AJAX routes.
 */
exports.isAuthApi = (req, res, next) => {
  if (req.session.isAuth) {
    next();
  } else {
    res.status(401).json({ ok: false, message: "Unauthorized" });
  }
};
