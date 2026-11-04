/**
 * controllers/feedbackController.js
 * ---------------------------------------------------------------------------
 * Bonus feature 19 : the public Contact / Feedback page.
 * Messages are stored in the `feedbacks` collection and can only be read by
 * an administrator (views/admin/feedback.ejs).
 */
'use strict';

const Feedback = require('../models/Feedback');
const asyncHandler = require('../utils/asyncHandler');
const logActivity = require('../utils/logActivity');
const { success } = require('../utils/flash');

/** GET /feedback */
exports.showForm = (req, res) => {
  res.render('public/feedback', {
    title: 'Contact us',
    subjects: ['General Feedback', 'Bug Report', 'Feature Request', 'Complaint', 'Partnership', 'Other']
  });
};

/** POST /feedback */
exports.submit = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').toLowerCase().trim();
  const subject = String(req.body.subject || 'General Feedback').trim();
  const message = String(req.body.message || '').trim();

  const errors = [];
  if (name.length < 2) errors.push('Please enter your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Please enter a valid e-mail address.');
  if (message.length < 10) errors.push('Your message must be at least 10 characters long.');

  if (errors.length) {
    errors.forEach((e) => req.flash('error', e));
    return res.redirect('/feedback');
  }

  await Feedback.create({
    name,
    email,
    subject,
    message,
    user: req.user ? req.user._id : null,
    ip: String(req.ip || '').replace('::ffff:', ''),
    status: 'new'
  });

  await logActivity(req, {
    action: 'feedback_submitted',
    entity: 'feedback',
    details: `${subject} from ${email}`
  });

  success(req, 'Thank you! Your message has been sent to the ISMS team.');
  return res.redirect('/feedback?sent=1');
});