/**
 * routes/applicant.js
 * ---------------------------------------------------------------------------
 * Applicant review routes, mounted from routes/company.js at
 *   /company/applications
 */
'use strict';

const express = require('express');
const { body } = require('express-validator');

const applicant = require('../controllers/applicantController');
const asyncHandler = require('../utils/asyncHandler');
const { validate } = require('../middleware/validate');

const router = express.Router();

// --- CSV export must come before /:id or it would be read as an id ---------
router.get('/export.csv', asyncHandler(applicant.exportApplicants));

// --- company-wide list ----------------------------------------------------
router.get('/', asyncHandler(applicant.showAllApplications));

// --- bulk status change ---------------------------------------------------
router.post(
  '/bulk-status',
  validate([body('status').isIn(['under_review', 'shortlisted', 'interview', 'accepted', 'rejected'])
    .withMessage('Choose a valid status')], { redirect: '/company/applications' }),
  asyncHandler(applicant.bulkStatus)
);

// --- single application ---------------------------------------------------
router.get('/:id', asyncHandler(applicant.showApplicant));

router.post(
  '/:id/status',
  validate([
    body('status').isIn(['under_review', 'shortlisted', 'interview', 'accepted', 'rejected'])
      .withMessage('Choose a valid status'),
    body('note').optional({ values: 'falsy' }).trim().isLength({ max: 2000 }).withMessage('Note cannot be longer than 2000 characters')
  ], { redirect: (req) => `/company/applications/${req.params.id}` }),
  asyncHandler(applicant.updateStatus)
);

module.exports = router;