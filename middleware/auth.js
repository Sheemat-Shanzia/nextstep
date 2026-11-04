/**
 * middleware/auth.js
 * ---------------------------------------------------------------------------
 * Stateless JWT authentication.
 *
 * The token lives in an httpOnly cookie (never in localStorage) so that a
 * cross-site-scripting attack cannot steal the session. `jsonwebtoken` only
 * signs and verifies the token - all permission checks happen against the
 * live `users` document, so suspending a user takes effect on the very next
 * request.
 */
'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/User');

const COOKIE_NAME = 'isms_token';

/** Sign a JWT for a user document. */
function generateToken(user) {
  return jwt.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
}

/** Attach the signed token as an httpOnly cookie. */
function sendAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,             // not readable from JavaScript
    sameSite: 'lax',            // blocks the classic CSRF vector
    secure: process.env.NODE_ENV === 'production', // https only in production
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/'
  });
}

/** Remove the auth cookie (logout). */
function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

/** Read the token from the cookie (or an Authorization header for API use). */
function readToken(req) {
  if (req.cookies && req.cookies[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/**
 * Populate `req.user` when a valid token is present. Never blocks the request -
 * invalid or suspended users are simply treated as anonymous, which lets the
 * navbar render the correct logged-in / logged-out state.
 */
async function loadUser(req, res, next) {
  req.user = null;
  req.token = null;

  try {
    const token = readToken(req);
    if (!token) return next();

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id);

    if (!user) {
      clearAuthCookie(res);
      return next();
    }

    // Suspended accounts are signed out immediately, everywhere.
    if (user.status === 'suspended') {
      clearAuthCookie(res);
      req.flash('error', 'Your account has been suspended. Please contact the administrator.');
      return next();
    }

    req.user = user;
    req.token = token;
    return next();
  } catch (err) {
    // Expired / tampered token -> clear it and continue as a guest.
    clearAuthCookie(res);
    return next();
  }
}

/** Protect a route: guests are redirected to the login page. */
function isAuthenticated(req, res, next) {
  if (req.user) return next();
  req.flash('warning', 'Please sign in to continue.');
  return res.redirect('/auth/login?returnTo=' + encodeURIComponent(req.originalUrl));
}

/** Keep signed-in users away from login/register (e.g. deep links). */
function redirectIfAuthenticated(req, res, next) {
  if (!req.user) return next();
  return res.redirect(dashboardFor(req.user.role));
}

/** Where each role lands right after signing in. */
function dashboardFor(role) {
  switch (role) {
    case 'admin':
      return '/admin/dashboard';
    case 'company':
      return '/company/dashboard';
    case 'student':
      return '/student/dashboard';
    default:
      return '/';
  }
}

module.exports = {
  COOKIE_NAME,
  generateToken,
  sendAuthCookie,
  clearAuthCookie,
  readToken,
  loadUser,
  isAuthenticated,
  redirectIfAuthenticated,
  dashboardFor
};