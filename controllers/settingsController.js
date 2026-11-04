/**
 * controllers/settingsController.js
 * ---------------------------------------------------------------------------
 * Bonus feature 5 : account settings + change password for every role.
 *   - update name / e-mail
 *   - change the password (requires the current one)
 */
'use strict';

const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const logActivity = require('../utils/logActivity');
const { success, error, warning } = require('../utils/flash');
const { generateToken, sendAuthCookie, dashboardFor } = require('../middleware/auth');

/** GET /auth/settings */
exports.showSettings = asyncHandler(async (req, res) => {
  const activity = await require('../models/ActivityLog').find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  res.render('auth/settings', { title: 'Account settings', activity });
});

/** POST /auth/settings */
exports.updateSettings = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  const { name, email } = req.body;

  if (name && name.trim().length >= 2) user.name = name.trim();

  if (email && email.toLowerCase() !== req.user.email.toLowerCase()) {
    const taken = await User.findOne({ email: email.toLowerCase().trim() });
    if (taken) {
      error(req, 'That e-mail address is already used by another account.');
      return res.redirect('/auth/settings');
    }
    user.email = email.toLowerCase().trim();
    user.isEmailVerified = false;
  }

  await user.save();

  // Re-issue the token so the cookie always carries the freshest role/name.
  sendAuthCookie(res, generateToken(user));

  await logActivity(req, { action: 'settings_updated', entity: 'user', entityId: user._id, details: 'Name / e-mail updated' });

  success(req, 'Your account settings have been saved.');
  return res.redirect('/auth/settings');
});

/** GET /auth/change-password */
exports.showChangePassword = (req, res) => {
  res.render('auth/changePassword', { title: 'Change password' });
};

/** POST /auth/change-password */
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, password, password2 } = req.body;
  const user = await User.findById(req.user._id).select('+password');

  const ok = await user.matchPassword(String(currentPassword || ''));
  if (!ok) {
    error(req, 'Your current password is not correct.');
    return res.redirect('/auth/change-password');
  }
  if (password !== password2) {
    error(req, 'The two new passwords do not match.');
    return res.redirect('/auth/change-password');
  }

  user.password = password;
  // Invalidate any outstanding reset links.
  user.resetPasswordToken = null;
  user.resetPasswordExpires = null;
  await user.save();

  sendAuthCookie(res, generateToken(user));

  await logActivity(req, { action: 'password_changed', entity: 'auth', entityId: user._id, details: 'Password changed by the owner' });

  success(req, 'Your password has been changed successfully.');
  return res.redirect(dashboardFor(user.role));
});