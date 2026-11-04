/**
 * routes/company.js
 * ---------------------------------------------------------------------------
 * Company portal, mounted at /company and guarded with `companyOnly`
 * (middleware/role.js). The applicant sub-router is mounted from here.
 */
'use strict';

const express = require('express');
const { body } = require('express-validator');

const company = require('../controllers/companyController');
const applicant = require('../controllers/applicantController');
const dashboard = require('../controllers/dashboardController');
const asyncHandler = require('../utils/asyncHandler');
const { validate } = require('../middleware/validate');
const { companyOnly } = require('../middleware/role');
const { runUpload } = require('../middleware/upload');
const { uploadLogo } = require('../config/multer');

const router = express.Router();

// Everything below requires an authenticated company account.
router.use(companyOnly);

// ===========================================================================
// Dashboard (FR-24)
// ===========================================================================
router.get('/', asyncHandler(dashboard.showCompanyDashboard));
router.get('/dashboard', asyncHandler(dashboard.showCompanyDashboard));

// ===========================================================================
// Shared validation rules for the opportunity form (FR-15)
// ===========================================================================
const opportunityRules = [
  body('title').trim().isLength({ min: 5, max: 180 }).withMessage('Title must be between 5 and 180 characters'),
  body('type').isIn(['internship', 'scholarship']).withMessage('Choose either Internship or Scholarship'),
  body('description').trim().isLength({ min: 30, max: 8000 }).withMessage('Description must be between 30 and 8000 characters'),
  body('location').trim().isLength({ min: 2, max: 160 }).withMessage('Location is required'),
  body('mode').isIn(['onsite', 'remote', 'hybrid']).withMessage('Choose onsite, remote or hybrid'),
  body('deadline').isISO8601().withMessage('Please provide a valid deadline date'),
  body('openings').isInt({ min: 1, max: 10000 }).withMessage('Openings must be a whole number of at least 1'),
  body('stipend').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Stipend / award must be a positive number'),
  body('minCgpa').optional({ values: 'falsy' }).isFloat({ min: 0, max: 10 }).withMessage('Minimum CGPA must be between 0 and 10'),
  body('category').optional({ values: 'falsy' }).trim().isLength({ max: 80 }).withMessage('Category is too long')
];

// ===========================================================================
// Company profile (FR-14)
// ===========================================================================
router.get('/profile', asyncHandler(company.showCompanyProfile));

router.post(
  '/profile',
  validate([
    body('companyName').trim().isLength({ min: 2, max: 160 }).withMessage('Company name must be between 2 and 160 characters'),
    body('size').optional({ values: 'falsy' }).isIn(['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'])
      .withMessage('Please choose a valid company size'),
    body('contactPhone').optional({ values: 'falsy' }).trim().isLength({ max: 25 }).withMessage('Contact phone is too long')
  ], { redirect: '/company/profile' }),
  asyncHandler(company.updateCompanyProfile)
);

router.post('/profile/logo', runUpload(uploadLogo, '/company/profile'), asyncHandler(company.uploadLogo));
router.delete('/profile/logo', asyncHandler(company.deleteLogo));

// ===========================================================================
// Opportunities (FR-15 / FR-16)
// ===========================================================================
router.get('/opportunities', asyncHandler(company.showOpportunities));
router.get('/opportunities/new', asyncHandler(company.showNewOpportunity));

router.post(
  '/opportunities',
  validate(opportunityRules, { redirect: '/company/opportunities/new' }),
  asyncHandler(company.createOpportunity)
);

router.get('/opportunities/:id', asyncHandler(company.showOpportunityDetail));

router.get('/opportunities/:id/edit', asyncHandler(company.showEditOpportunity));

router.post(
  '/opportunities/:id',
  validate(opportunityRules, { redirect: (req) => `/company/opportunities/${req.params.id}/edit` }),
  asyncHandler(company.updateOpportunity)
);

router.delete('/opportunities/:id', asyncHandler(company.deleteOpportunity));
router.post('/opportunities/:id/toggle', asyncHandler(company.toggleActive));

// ===========================================================================
// Applicant management (FR-18) - delegated to routes/applicant.js
// ===========================================================================
router.use('/applications', require('./applicant'));
// ...plus the per-opportunity applicants list.
router.get('/opportunities/:id/applicants', asyncHandler(applicant.showApplicants));

module.exports = router;