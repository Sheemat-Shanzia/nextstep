/**
 * utils/flash.js
 * ---------------------------------------------------------------------------
 * Flash message helpers built on connect-flash + express-session
 * (set up in app.js). A flash lives for exactly one request: the message is
 * written to the session, read by views/partials/flash.ejs and then removed.
 *
 * Bootstrap contextual class names are used so the partial can render the
 * message without any extra mapping.
 */
'use strict';

/**
 * Set a flash message.
 * @param {import('express').Request} req
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {string} message
 */
function setFlash(req, type, message) {
  if (!message) return;
  const existing = req.flash(type) || [];
  req.flash(type, [...existing, message]);
}

/** Convenience shorthands. */
const success = (req, msg) => setFlash(req, 'success', msg);
const error = (req, msg) => setFlash(req, 'error', msg);
const warning = (req, msg) => setFlash(req, 'warning', msg);
const info = (req, msg) => setFlash(req, 'info', msg);

/**
 * Flash several validation errors coming from express-validator at once.
 * @param {import('express').Request} req
 * @param {Array<{msg:string}>} errors
 */
function setValidationFlash(req, errors) {
  if (!errors || !errors.length) return;
  const unique = [...new Set(errors.map((e) => e.msg))];
  unique.slice(0, 6).forEach((msg) => error(req, msg));
  if (unique.length > 6) error(req, `...and ${unique.length - 6} more validation problems.`);
}

/**
 * Resolve "go back" to a concrete, same-site URL.
 *
 * Express 4.22 deprecates `res.redirect('back')` because it trusts the
 * Referer header blindly; this helper keeps the behaviour but always falls back
 * to a known-safe path, and rejects absolute cross-site URLs.
 *
 * @param {import('express').Request} req
 * @param {string} [fallback='/']
 * @returns {string} a safe relative URL
 */
function backTo(req, fallback = '/') {
  const referer = (req && req.get && req.get('Referer')) || '';
  if (referer) {
    try {
      const url = new URL(referer, `${req.protocol}://${req.get('host')}`);
      // Same origin only - never bounce the user to a third-party site.
      if (url.host === req.get('host')) return url.pathname + url.search;
    } catch (err) {
      /* malformed Referer - use the fallback */
    }
  }
  return fallback;
}

module.exports = { setFlash, success, error, warning, info, setValidationFlash, backTo };