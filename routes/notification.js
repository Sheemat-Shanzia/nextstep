/**
 * routes/notification.js
 * ---------------------------------------------------------------------------
 * Notification centre, mounted at /notifications.
 */
'use strict';

const express = require('express');

const notification = require('../controllers/notificationController');
const asyncHandler = require('../utils/asyncHandler');
const { isAuthenticated } = require('../middleware/auth');

const router = express.Router();

router.use(isAuthenticated);

router.get('/', asyncHandler(notification.showNotifications));
router.post('/read-all', asyncHandler(notification.markAllRead));
router.post('/:id/read', asyncHandler(notification.markRead));
router.delete('/', asyncHandler(notification.clearAll));
router.delete('/:id', asyncHandler(notification.deleteOne));

module.exports = router;