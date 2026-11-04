/**
 * routes/companyPublic.js
 * ---------------------------------------------------------------------------
 * Public (unauthenticated) company pages, mounted at /companies.
 *
 * Bonus feature 7: a shareable company profile page that lists the company's
 * currently-open approved opportunities.
 */
'use strict';

const express = require('express');
const { body } = require('express-validator');

const companyPublic = require('../controllers/companyPublicController');
const student = require('../controllers/studentController');
const asyncHandler = require('../utils/asyncHandler');
const { validate } = require('../middleware/validate');
const { studentOnly } = require('../middleware/role');

const router = express.Router();

router.get('/', asyncHandler(companyPublic.showDirectory));

// Bonus feature 6 - students review a company from its public page.
router.post(
  '/:id/review',
  studentOnly,
  validate([
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Please choose between 1 and 5 stars'),
    body('comment').optional({ values: 'falsy' }).trim().isLength({ max: 1000 }).withMessage('Comment cannot be longer than 1000 characters')
  ], { redirect: (req) => `/companies/${req.params.id}#review-form` }),
  asyncHandler(student.submitReview)
);

router.get('/:id', asyncHandler(companyPublic.showCompany));

module.exports = router;