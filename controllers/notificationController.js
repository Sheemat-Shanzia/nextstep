/**
 * controllers/notificationController.js
 * ---------------------------------------------------------------------------
 * Bonus feature 3 : the in-app notification centre.
 *   - list every notification, newest first
 *   - filter by "unread only"
 *   - mark one / mark all as read
 */
'use strict';

const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const { success, warning } = require('../utils/flash');
const { getPagination, buildPageMeta } = require('../utils/pagination');

/** GET /notifications */
exports.showNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, { defaultLimit: 20, maxLimit: 100 });

  const filter = { user: req.user._id };
  const unreadOnly = String(req.query.unread || '') === '1';
  if (unreadOnly) filter.isRead = false;

  const [total, notifications, unread] = await Promise.all([
    Notification.countDocuments(filter),
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments({ user: req.user._id, isRead: false })
  ]);

  res.locals.unreadCount = unread;

  res.render('notifications/index', {
    title: 'Notifications',
    notifications,
    unread,
    unreadOnly,
    pager: buildPageMeta({ page, limit, total })
  });
});

/** POST /notifications/:id/read */
exports.markRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({ _id: req.params.id, user: req.user._id });
  if (notification) await notification.updateOne({ isRead: true });
  res.redirect(req.body.returnTo || '/notifications');
});

/** POST /notifications/read-all */
exports.markAllRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany({ user: req.user._id, isRead: false }, { isRead: true });
  success(req, result.modifiedCount ? `${result.modifiedCount} notification(s) marked as read.` : 'You have no unread notifications.');
  res.redirect('/notifications');
});

/** DELETE /notifications/:id */
exports.deleteOne = asyncHandler(async (req, res) => {
  const result = await Notification.deleteOne({ _id: req.params.id, user: req.user._id });
  if (!result.deletedCount) warning(req, 'That notification could not be deleted.');
  res.redirect('/notifications');
});

/** DELETE /notifications - clear the whole inbox. */
exports.clearAll = asyncHandler(async (req, res) => {
  const result = await Notification.deleteMany({ user: req.user._id });
  success(req, `${result.deletedCount} notification(s) removed.`);
  res.redirect('/notifications');
});