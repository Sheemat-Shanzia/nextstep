/**
 * routes/student.js
 * ---------------------------------------------------------------------------
 * Student portal router - every route is guarded with `studentOnly`
 * (middleware/role.js) so a company or admin hitting /student/... gets 403.
 */
'use strict';

const express = require('express');
const { body } = require('express-validator');

const student = require('../controllers/studentController');
const dashboard = require('../controllers/dashboardController');
const asyncHandler = require('../utils/asyncHandler');
const { validate } = require('../middleware/validate');
const { studentOnly } = require('../middleware/role');
const { runUpload, filesOf } = require('../middleware/upload');
const { uploadCvSingle, uploadDocs, MAX_FILES } = require('../config/multer');

const router = express.Router();

// Everything below this line requires an authenticated student account.
router.use(studentOnly);

// ===========================================================================
// Dashboard (FR-24)
// ===========================================================================
router.get('/', asyncHandler(dashboard.showStudentDashboard));
router.get('/dashboard', asyncHandler(dashboard.showStudentDashboard));

// ===========================================================================
// Profile (FR-03)
// ===========================================================================
router.get('/profile', asyncHandler(student.showProfile));
router.get('/profile/edit', asyncHandler(student.showProfileEdit));

router.post(
  '/profile',
  validate([
    body('phone').optional({ values: 'falsy' }).trim().isLength({ max: 25 }).withMessage('Phone number is too long'),
    body('cgpa').optional({ values: 'falsy' }).isFloat({ min: 0, max: 10 }).withMessage('CGPA must be a number between 0 and 10'),
    body('currentSemester').optional({ values: 'falsy' }).isInt({ min: 1, max: 12 }).withMessage('Semester must be between 1 and 12'),
    body('graduationYear').optional({ values: 'falsy' }).isInt({ min: 1950, max: 2100 }).withMessage('Enter a valid graduation year'),
    body('university').optional({ values: 'falsy' }).trim().isLength({ max: 160 }).withMessage('University name is too long')
  ], { redirect: '/student/profile/edit' }),
  asyncHandler(student.updateProfile)
);

// ===========================================================================
// Skills (FR-05)
// ===========================================================================
router.get('/skills', asyncHandler(student.showSkills));

router.post(
  '/skills',
  validate([
    body('name').trim().isLength({ min: 2, max: 60 }).withMessage('Skill name must be between 2 and 60 characters'),
    body('level').isIn(['beginner', 'intermediate', 'advanced', 'expert']).withMessage('Please choose a valid skill level')
  ], { redirect: '/student/skills' }),
  asyncHandler(student.addSkill)
);

router.post(
  '/skills/:skillId',
  validate([
    body('name').trim().isLength({ min: 2, max: 60 }).withMessage('Skill name must be between 2 and 60 characters'),
    body('level').isIn(['beginner', 'intermediate', 'advanced', 'expert']).withMessage('Please choose a valid skill level')
  ], { redirect: '/student/skills' }),
  asyncHandler(student.updateSkill)
);

router.delete('/skills/:skillId', asyncHandler(student.deleteSkill));

// ===========================================================================
// CV + documents (FR-12)
// ===========================================================================
router.post('/cv', runUpload(uploadCvSingle, '/student/profile'), asyncHandler(student.uploadCv));
router.delete('/cv', asyncHandler(student.deleteCv));

router.post(
  '/documents',
  validate([body('documents').optional().isArray().withMessage('Unexpected document format')], { redirect: '/student/profile' }),
  runUpload(uploadDocs, '/student/profile'),
  asyncHandler(student.uploadDocuments)
);
router.delete('/documents/:docId', asyncHandler(student.deleteDocument));

// ===========================================================================
// Education + projects
// ===========================================================================
router.post(
  '/education',
  validate([body('institution').trim().isLength({ min: 2, max: 160 }).withMessage('Institution name must be between 2 and 160 characters')], {
    redirect: '/student/profile'
  }),
  asyncHandler(student.addEducation)
);
router.delete('/education/:eduId', asyncHandler(student.deleteEducation));

router.post(
  '/projects',
  validate([body('title').trim().isLength({ min: 2, max: 160 }).withMessage('Project title must be between 2 and 160 characters')], {
    redirect: '/student/profile'
  }),
  asyncHandler(student.addProject)
);
router.delete('/projects/:projectId', asyncHandler(student.deleteProject));

// ===========================================================================
// Bookmarks (bonus feature 1)
// ===========================================================================
router.get('/bookmarks', asyncHandler(student.showBookmarks));

// ===========================================================================
// Application tracking (FR-13) - mounted as /student/applications
// ===========================================================================
router.use('/applications', require('./application'));

module.exports = router;