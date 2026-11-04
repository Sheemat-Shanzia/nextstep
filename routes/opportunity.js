/**
 * routes/opportunity.js
 * ---------------------------------------------------------------------------
 * Public opportunity routes mounted at /opportunities.
 *
 * The student-only routes (apply / bookmark) sit at the bottom and are
 * explicitly guarded, so anonymous visitors can browse but cannot apply.
 */
'use strict';

const express = require('express');

const opportunity = require('../controllers/opportunityController');
const student = require('../controllers/studentController');
const asyncHandler = require('../utils/asyncHandler');
const { studentOnly } = require('../middleware/role');
const { runUpload, toDocumentMeta } = require('../middleware/upload');
const { uploadApplication } = require('../config/multer');
const applicationService = require('../services/applicationService');
const logActivity = require('../utils/logActivity');
const { success, error } = require('../utils/flash');

const router = express.Router();

// ===========================================================================
// Public browsing
// ===========================================================================
router.get('/', asyncHandler(opportunity.showBrowse));
router.get('/most-viewed', asyncHandler(opportunity.showMostViewed));
router.get('/:id', asyncHandler(opportunity.showDetail));

// ===========================================================================
// Student-only actions
// ===========================================================================
router.get('/:id/apply', studentOnly, asyncHandler(opportunity.showApplyForm));

/**
 * FR-11 - submit an application.
 *
 * The form may contain:
 *   - `coverLetter`  (required)
 *   - `answer[]`     (the extra questions asked by the post)
 *   - `cv`           (optional new CV; otherwise the profile CV is used)
 *   - `documents[]`  (optional supporting documents)
 */
router.post(
  '/:id/apply',
  studentOnly,
  runUpload(uploadApplication, (req) => `/opportunities/${req.params.id}/apply`),
  asyncHandler(async (req, res) => {
    const cvFile = (req.files && req.files.cv && req.files.cv[0]) || null;
    const docFiles = (req.files && req.files.documents) || [];

    const documents = docFiles.map((f) => toDocumentMeta(f, f.originalname));

    // Map the two textarea answers back onto their question labels.
    const questions = [
      `Why are you a good fit for this opportunity? (max 300 characters)`,
      'Additional information requested by the company (max 500 characters)'
    ];
    const rawAnswers = [].concat(req.body.answer || []);
    const answers = rawAnswers
      .map((value, index) => ({ question: questions[index] || `Question ${index + 1}`, answer: String(value).trim() }))
      .filter((a) => a.answer.length > 0);

    const { application, error: errMessage } = await applicationService.createApplication({
      studentUserId: req.user._id,
      opportunityId: req.params.id,
      coverLetter: req.body.coverLetter,
      answers,
      documents,
      cvPath: cvFile ? cvFile.filename : '',
      cvOriginalName: cvFile ? cvFile.originalname : '',
      cvSource: cvFile ? 'upload' : 'profile'
    });

    if (errMessage) {
      error(req, errMessage);
      return res.redirect(`/opportunities/${req.params.id}/apply`);
    }

    await logActivity(req, {
      action: 'application_submitted',
      entity: 'application',
      entityId: application._id,
      details: `Applied to opportunity ${req.params.id}`
    });

    success(req, 'Your application has been submitted successfully.');
    return res.redirect(`/student/applications/${application._id}`);
  })
);

/** Bonus feature 1 - toggle the bookmark icon on any card / detail page. */
router.post('/:id/bookmark', studentOnly, asyncHandler(student.toggleBookmark));

module.exports = router;