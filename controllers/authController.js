/**
 * controllers/authController.js
 * ---------------------------------------------------------------------------
 * FR-01 / FR-02 : registration, login, logout, forgot & reset password.
 *
 * Password policy (security hardening):
 *   - at least 8 characters
 *   - at least one lower case letter, one upper case letter and one digit
 */
'use strict';

const crypto = require('crypto');

const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const CompanyProfile = require('../models/CompanyProfile');
const asyncHandler = require('../utils/asyncHandler');
const logActivity = require('../utils/logActivity');
const { success, error, info, warning } = require('../utils/flash');
const { generateToken, sendAuthCookie, clearAuthCookie, dashboardFor } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../utils/mailer');
const { showResetLink } = require('../utils/mailer');

/** Roles a visitor is allowed to register as (admins are seeded only). */
const PUBLIC_ROLES = ['student', 'company'];

// ===========================================================================
// GET /auth/register
// ===========================================================================
exports.showRegister = (req, res) => {
  // Values kept by middleware/validate.js after a failed attempt.
  const saved = (req.session && req.session.oldInput) || {};
  res.render('auth/register', {
    title: 'Create an account',
    old: {
      ...saved,
      role: ['student', 'company'].includes(req.query.role) ? req.query.role : saved.role || 'student'
    },
    errors: (req.session && req.session.oldErrors) || []
  });
};

// ===========================================================================
// POST /auth/register
// ===========================================================================
exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, password2, role } = req.body;
  const chosenRole = PUBLIC_ROLES.includes(role) ? role : 'student';

  const existing = await User.findOne({ email: String(email).toLowerCase() });
  if (existing) {
    error(req, 'An account with that email address already exists.');
    return res.redirect('/auth/register?role=' + chosenRole);
  }

  const user = await User.create({
    name: String(name).trim(),
    email: String(email).toLowerCase().trim(),
    password,
    role: chosenRole,
    status: 'active',
    isEmailVerified: false
  });

  // Create the matching profile document straight away so the dashboard and
  // the profile strength meter work from the very first login.
  if (chosenRole === 'student') {
    await StudentProfile.create({ user: user._id });
  } else {
    await CompanyProfile.create({ user: user._id, companyName: `${String(name).trim()} ` });
  }

  await logActivity(req, {
    action: 'register',
    entity: 'user',
    entityId: user._id,
    details: `New ${chosenRole} account: ${user.email}`
  });

  const token = generateToken(user);
  sendAuthCookie(res, token);
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  success(req, `Welcome to ISMS, ${user.name}! Your account has been created.`);
  return res.redirect(dashboardFor(user.role));
});

// ===========================================================================
// GET /auth/login
// ===========================================================================
exports.showLogin = (req, res) => {
  res.render('auth/login', {
    title: 'Sign in',
    returnTo: req.query.returnTo || '',
    errors: []
  });
};

// ===========================================================================
// POST /auth/login
// ===========================================================================
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const redirectTo = req.body.returnTo || '';

  const user = await User.findOne({ email: String(email || '').toLowerCase().trim() }).select('+password');

  // Same generic message for "no such user" and "wrong password" so the login
  // form cannot be used to discover which e-mails are registered.
  if (!user) {
    error(req, 'Incorrect email address or password.');
    return res.redirect('/auth/login');
  }

  const ok = await user.matchPassword(String(password || ''));
  if (!ok) {
    await logActivity(req, { action: 'login_failed', entity: 'auth', details: `Failed login for ${user.email}` });
    error(req, 'Incorrect email address or password.');
    return res.redirect('/auth/login');
  }

  // Suspended accounts are refused with a clear message (FR-02).
  if (user.status === 'suspended') {
    await logActivity(req, { action: 'login_blocked', entity: 'auth', details: `Suspended account tried to log in: ${user.email}` });
    error(req, 'Your account has been suspended. Please contact the administrator.');
    return res.redirect('/auth/login');
  }
  if (user.status === 'pending') {
    error(req, 'Your account is awaiting administrator approval.');
    return res.redirect('/auth/login');
  }

  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  const token = generateToken(user);
  sendAuthCookie(res, token);

  await logActivity(req, { action: 'login', entity: 'auth', entityId: user._id, details: `Signed in as ${user.role}` });

  success(req, `Signed in successfully. Welcome back, ${user.name}!`);

  // Only allow same-site relative redirects to avoid an open-redirect hole.
  const safeRedirect = typeof redirectTo === 'string' && redirectTo.startsWith('/') && !redirectTo.startsWith('//')
    ? redirectTo
    : dashboardFor(user.role);

  return res.redirect(safeRedirect);
});

// ===========================================================================
// POST (and GET, for convenience) /auth/logout
// ===========================================================================
exports.logout = asyncHandler(async (req, res) => {
  if (req.user) {
    await logActivity(req, { action: 'logout', entity: 'auth', entityId: req.user._id, details: `${req.user.role} signed out` });
  }

  // The JWT cookie is the only thing that grants access, so removing it is a
  // complete sign-out. The express-session here stores nothing sensitive
  // (flash messages + stale form input only) and is intentionally kept so the
  // "you have been signed out" message survives the redirect.
  clearAuthCookie(res);

  if (req.session) {
    delete req.session.oldInput;
    delete req.session.oldErrors;
  }
  success(req, 'You have been signed out. See you soon!');
  return res.redirect('/');
});

// ===========================================================================
// GET /auth/forgot-password
// ===========================================================================
exports.showForgot = (req, res) => {
  res.render('auth/forgot', {
    title: 'Forgot password',
    // When SMTP is missing we show the reset link directly (dev mode only).
    devMode: showResetLink
  });
};

// ===========================================================================
// POST /auth/forgot-password
// ===========================================================================
exports.forgotPassword = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const user = await User.findOne({ email });

  // Always answer the same way - never reveal whether the e-mail exists.
  if (!user) {
    warning(req, 'If that e-mail address is registered you will receive reset instructions shortly.');
    return res.redirect('/auth/forgot-password');
  }

  // Store a HASH of the token, exactly like the reset token in the User model.
  const rawToken = crypto.randomBytes(32).toString('hex');
  user.resetPasswordToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${req.protocol}://${req.get('host')}/auth/reset-password/${rawToken}`;
  await sendPasswordResetEmail({ email: user.email, name: user.name, resetUrl });

  await logActivity(req, { action: 'password_reset_requested', entity: 'auth', entityId: user._id, details: user.email });

  // In dev mode (no SMTP) the link is also shown on screen so the flow can be
  // tested end to end without a mail server.
  if (showResetLink) {
    return res.render('auth/forgot', {
      title: 'Reset link generated',
      devMode: true,
      devEmail: user.email,
      devLink: resetUrl
    });
  }

  info(req, 'If that e-mail address is registered you will receive reset instructions shortly.');
  return res.redirect('/auth/forgot-password');
});

// ===========================================================================
// GET /auth/reset-password/:token
// ===========================================================================
exports.showReset = asyncHandler(async (req, res) => {
  const hashed = crypto.createHash('sha256').update(req.params.token).digest('hex');

  const user = await User.findOne({
    resetPasswordToken: hashed,
    resetPasswordExpires: { $gt: Date.now() }
  });

  if (!user) {
    error(req, 'This reset link is invalid or has expired. Please request a new one.');
    return res.redirect('/auth/forgot-password');
  }

  return res.render('auth/reset', { title: 'Choose a new password', token: req.params.token, email: user.email });
});

// ===========================================================================
// POST /auth/reset-password/:token
// ===========================================================================
exports.resetPassword = asyncHandler(async (req, res) => {
  const { password, password2 } = req.body;
  const hashed = crypto.createHash('sha256').update(req.params.token).digest('hex');

  const user = await User.findOne({
    resetPasswordToken: hashed,
    resetPasswordExpires: { $gt: Date.now() }
  });

  if (!user) {
    error(req, 'This reset link is invalid or has expired. Please request a new one.');
    return res.redirect('/auth/forgot-password');
  }

  if (password !== password2) {
    error(req, 'The two passwords do not match.');
    return res.redirect(`/auth/reset-password/${req.params.token}`);
  }

  user.password = password;
  user.resetPasswordToken = null;
  user.resetPasswordExpires = null;
  user.status = 'active';
  await user.save();

  // Every existing session is effectively invalidated by clearing the cookie,
  // and the user is signed in straight away with a fresh token.
  const token = generateToken(user);
  sendAuthCookie(res, token);

  await logActivity(req, { action: 'password_reset', entity: 'auth', entityId: user._id, details: `Password reset completed for ${user.email}` });

  success(req, 'Your password has been updated. You are now signed in.');
  return res.redirect(dashboardFor(user.role));
});