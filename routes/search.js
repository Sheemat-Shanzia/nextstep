/**
 * routes/search.js
 * ---------------------------------------------------------------------------
 * Advanced search endpoints mounted at /search.
 *   GET /search          -> full filter page (FR-06 / FR-07)
 *   GET /search/suggest  -> JSON type-ahead used by the navbar + hero box
 *   GET /search/facets   -> JSON list of available categories / locations
 */
'use strict';

const express = require('express');

const search = require('../controllers/searchController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/', asyncHandler(search.showSearchPage));
router.get('/suggest', asyncHandler(search.suggest));
router.get('/facets', asyncHandler(search.facets));

module.exports = router;