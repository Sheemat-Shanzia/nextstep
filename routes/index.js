/**
 * routes/index.js
 * ---------------------------------------------------------------------------
 * Root router: the public landing page and the small "about" style pages.
 */
'use strict';

const express = require('express');

const home = require('../controllers/homeController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// GET / - landing page
router.get('/', asyncHandler(home.showHome));

module.exports = router;