/**
 * routes/feedback.js
 * ---------------------------------------------------------------------------
 * Public contact / feedback form, mounted at /feedback (bonus feature 19).
 */
'use strict';

const express = require('express');
const { body } = require('express-validator');

const feedback = require('../controllers/feedbackController');
const asyncHandler = require('../utils/asyncHandler');
const { validate } = require('../middleware/validate');
const { authLimiter } = require('../config/rateLimit');

const router = express.Router();

router.get('/', asyncHandler(feedback.showForm));

router.post(
  '/',
  authLimiter,
  validate([
    body('name').trim().isLength({ min: 2, max: 120 }).withMessage('Name must be between 2 and 120 characters'),
    body('email').trim().isEmail().withMessage('Please enter a valid e-mail address').normalizeEmail({ gmail_remove_dots: false }),
    body('message').trim().isLength({ min: 10, max: 3000 }).withMessage('Message must be between 10 and 3000 characters'),
    body('subject').optional().isIn(['General Feedback', 'Bug Report', 'Feature Request', 'Complaint', 'Partnership', 'Other'])
      .withMessage('Please choose a valid subject')
  ], { redirect: '/feedback' }),
  asyncHandler(feedback.submit)
);

module.exports = router;