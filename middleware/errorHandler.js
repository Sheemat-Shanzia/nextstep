/**
 * middleware/errorHandler.js
 * ---------------------------------------------------------------------------
 * 404 + central error handler (FR-26).
 *
 * Every error thrown by a route (including async errors forwarded by
 * utils/asyncHandler) ends up here, where it is logged once and turned into a
 * friendly page. Stack traces are only shown outside production.
 */
'use strict';

const path = require('path');
const fs = require('fs');

/** Catch-all route: nothing matched -> 404 page. */
function notFound(req, res, next) {
  res.status(404).render('errors/404', {
    title: 'Page not found',
    message: `We could not find "${req.originalUrl}".`,
    user: req.user
  });
}

/**
 * Express error-handling middleware (needs the 4-argument signature).
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || (err.name === 'ValidationError' ? 400 : 500);

  // ---- friendly messages for the errors we can anticipate ------------------
  let message = err.message || 'Something went wrong.';

  if (err.name === 'ValidationError' && err.errors) {
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(' ');
  } else if (err.code === 11000) {
    // Duplicate key - e.g. two applications for the same opportunity.
    const field = Object.keys(err.keyValue || {})[0] || 'value';
    message =
      field === 'student_1_opportunity_1'
        ? 'You have already applied to this opportunity.'
        : `That ${field} is already registered. Please use a different one.`;
  } else if (err.name === 'CastError') {
    message = `Invalid ${err.path} value.`;
    return res.status(400).render('errors/500', { title: 'Invalid input', message, user: req.user, stack: '' });
  }

  // ---- log once, never log secrets ----------------------------------------
  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error(`[error] ${req.method} ${req.originalUrl} -> ${status}: ${err.stack || err.message}`);
  } else {
    // eslint-disable-next-line no-console
    console.warn(`[error] ${req.method} ${req.originalUrl} -> ${status}: ${message}`);
  }

  // Respect an explicit redirect (used by the file-download guards).
  if (err.redirect) return res.redirect(err.redirect);

  // Uploaded files must never leak when a request fails.
  if (req.file || req.files) {
    try {
      require('./upload').cleanupFiles(req);
    } catch (cleanupErr) {
      /* ignore */
    }
  }

  if (res.headersSent) return next(err);

  if (status === 403) {
    return res.status(403).render('errors/403', { title: 'Access denied', message, user: req.user });
  }

  if (req.xhr || (req.headers.accept || '').includes('application/json')) {
    return res.status(status).json({ ok: false, error: message });
  }

  return res.status(status).render('errors/500', {
    title: 'Something went wrong',
    message: status >= 500 ? 'An unexpected error occurred while processing your request.' : message,
    stack: process.env.NODE_ENV === 'production' ? '' : err.stack || '',
    user: req.user
  });
}

/** Best-effort: create the error views folder placeholder file on boot. */
function ensureErrorViewsFolder() {
  const dir = path.join(__dirname, '..', 'views', 'errors');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

module.exports = { notFound, errorHandler, ensureErrorViewsFolder };