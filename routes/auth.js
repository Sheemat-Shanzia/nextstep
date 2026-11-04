/**
 * routes/auth.js
 * ---------------------------------------------------------------------------
 * Registration, login, logout and the password reset flow.
 * `/auth/login` and `/auth/register` are rate limited against brute force.
 */
'use strict';

const express = require('express');
const { body } = require('express-validator');

const auth = require('../controllers/authController');
const asyncHandler = require('../utils/asyncHandler');
const { validate } = require('../middleware/validate');
const { redirectIfAuthenticated, isAuthenticated } = require('../middleware/auth');
const { authLimiter } = require('../config/rateLimit');

const router = express.Router();

/** Strong password policy, enforced server side. */
const passwordRule = (field = 'password') =>
  body(field)
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
    .matches(/[a-z]/).withMessage('Password must contain a lower case letter')
    .matches(/[A-Z]/).withMessage('Password must contain an upper case letter')
    .matches(/\d/).withMessage('Password must contain a number');

/** Valid e-mail + normalised casing. */
const emailRule = () =>
  body('email')
    .trim()
    .isEmail().withMessage('Please enter a valid e-mail address')
    .normalizeEmail({ gmail_remove_dots: false })
    .isLength({ max: 160 }).withMessage('E-mail address is too long');

/**
 * "Repeat password" rule.
 * express-validator's `.equals()` expects a field *path*, so the comparison is
 * done explicitly with `.custom()` against `req.body` - clearer and safe.
 */
const confirmPasswordRule = (field = 'password2', message = 'The two passwords do not match') =>
  body(field).custom((value, { req }) => value === req.body.password).withMessage(message);

// ===========================================================================
// Registration
// ===========================================================================
router.get('/register', redirectIfAuthenticated, auth.showRegister);

router.post(
  '/register',
  authLimiter,
  validate([
    body('name').trim().isLength({ min: 2, max: 120 }).withMessage('Name must be between 2 and 120 characters'),
    emailRule(),
    passwordRule('password'),
    body('password2').notEmpty().withMessage('Please confirm your password'),
    confirmPasswordRule(),
    body('role').isIn(['student', 'company']).withMessage('Please choose either Student or Company'),
    body('companyName').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 160 })
      .withMessage('Company name must be between 2 and 160 characters')
      .if(body('role').equals('company')),
    body('university').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 160 })
      .withMessage('University name must be between 2 and 160 characters')
      .if(body('role').equals('student'))
  ], { redirect: '/auth/register' }),
  asyncHandler(auth.register)
);

// ===========================================================================
// Login / logout
// ===========================================================================
router.get('/login', redirectIfAuthenticated, auth.showLogin);

router.post(
  '/login',
  authLimiter,
  validate([
    emailRule(),
    body('password').notEmpty().withMessage('Please enter your password')
  ], { redirect: '/auth/login' }),
  asyncHandler(auth.login)
);

router.get('/logout', asyncHandler(auth.logout));
router.post('/logout', asyncHandler(auth.logout));

// ===========================================================================
// Forgot / reset password
// ===========================================================================
router.get('/forgot-password', redirectIfAuthenticated, auth.showForgot);

router.post(
  '/forgot-password',
  authLimiter,
  validate([emailRule()], { redirect: '/auth/forgot-password' }),
  asyncHandler(auth.forgotPassword)
);

router.get('/reset-password/:token', auth.showReset);

router.post(
  '/reset-password/:token',
  authLimiter,
  validate([passwordRule('password'), body('password2').notEmpty().withMessage('Please confirm your password'), confirmPasswordRule()], {
    redirect: (req) => `/auth/reset-password/${req.params.token}`
  }),
  asyncHandler(auth.resetPassword)
);

// ===========================================================================
// Account settings / change password (bonus feature 5)
// ===========================================================================
const settings = require('../controllers/settingsController');

router.get('/settings', isAuthenticated, asyncHandler(settings.showSettings));

router.post(
  '/settings',
  isAuthenticated,
  validate([
    body('name').trim().isLength({ min: 2, max: 120 }).withMessage('Name must be between 2 and 120 characters'),
    body('email').trim().isEmail().withMessage('Please enter a valid e-mail address').normalizeEmail({ gmail_remove_dots: false })
  ], { redirect: '/auth/settings' }),
  asyncHandler(settings.updateSettings)
);

router.get('/change-password', isAuthenticated, asyncHandler(settings.showChangePassword));

router.post(
  '/change-password',
  isAuthenticated,
  validate([
    body('currentPassword').notEmpty().withMessage('Please enter your current password'),
    passwordRule('password'),
    body('password2').notEmpty().withMessage('Please confirm your new password'),
    confirmPasswordRule()
  ], { redirect: '/auth/change-password' }),
  asyncHandler(settings.changePassword)
);

module.exports = router;