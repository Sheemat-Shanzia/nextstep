/**
 * routes/files.js
 * ---------------------------------------------------------------------------
 * Every protected download lives here (see controllers/fileController.js).
 * All routes require an authenticated user; the controller then decides
 * whether this specific user may read this specific file.
 */
'use strict';

const express = require('express');

const file = require('../controllers/fileController');
const asyncHandler = require('../utils/asyncHandler');
const { isAuthenticated } = require('../middleware/auth');

const router = express.Router();

router.use(isAuthenticated);

// --- files attached to an application (student / receiving company / admin) --
router.get('/application/:applicationId/cv', asyncHandler(file.downloadApplicationCv));
router.get('/application/:applicationId/document/:docId', asyncHandler(file.downloadApplicationDocument));

// --- a student's own files -------------------------------------------------
router.get('/profile/cv', asyncHandler(file.downloadOwnCv));
router.get('/profile/document/:docId', asyncHandler(file.downloadOwnDocument));

// --- company logo ----------------------------------------------------------
router.get('/company/logo/:userId', asyncHandler(file.downloadCompanyLogo));

module.exports = router;