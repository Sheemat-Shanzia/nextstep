/**
 * config/rateLimit.js
 * ---------------------------------------------------------------------------
 * Rate limiting presets (FR / security hardening).
 *
 *   - `globalLimiter` protects every route from runaway traffic
 *   - `authLimiter`   protects the login / register / password-reset forms
 *                     against brute force attacks
 *
 * Both are shared between app.js and routes/auth.js so the limits can only
 * ever be defined in one place.
 */
'use strict';

const rateLimit = require('express-rate-limit');

/** Applied to the whole application. */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1500,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this device. Please try again in a few minutes.'
});

/** Applied to /auth/login, /auth/register, /auth/forgot, /auth/reset. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only failed attempts count
  message: 'Too many attempts from this device. Please try again in a few minutes.'
});

module.exports = { globalLimiter, authLimiter };