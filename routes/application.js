/**
 * routes/application.js
 * ---------------------------------------------------------------------------
 * Student application tracking, mounted from routes/student.js as
 *   /student/applications
 * The router therefore only needs to declare the paths *after* /applications.
 */
'use strict';

const express = require('express');
const { body } = require('express-validator');

const application = require('../controllers/applicationController');
const asyncHandler = require('../utils/asyncHandler');
const { validate } = require('../middleware/validate');

const router = express.Router();

// GET /student/applications
router.get('/', asyncHandler(application.showMyApplications));

// GET /student/applications/:id
router.get('/:id', asyncHandler(application.showMyApplication));

// POST /student/applications/:id/withdraw   (also reachable with ?_method=POST)
router.post(
  '/:id/withdraw',
  validate([body('confirm').equals('yes').withMessage('Please confirm the withdrawal')], {
    redirect: (req) => `/student/applications/${req.params.id}`
  }),
  asyncHandler(application.withdraw)
);

module.exports = router;