/**
 * routes/dashboard.js
 * ---------------------------------------------------------------------------
 * Role-aware dashboard router mounted at /dashboard.
 * Redirects to the correct portal so every role has exactly one address for
 * "my dashboard" (used by the navbar and after login).
 */
'use strict';

const express = require('express');

const asyncHandler = require('../utils/asyncHandler');
const { isAuthenticated, dashboardFor } = require('../middleware/auth');

const router = express.Router();

router.get(
  '/',
  isAuthenticated,
  asyncHandler(async (req, res) => res.redirect(dashboardFor(req.user.role)))
);

module.exports = router;