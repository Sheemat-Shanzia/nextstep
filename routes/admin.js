/**
 * routes/admin.js
 * ---------------------------------------------------------------------------
 * Administrator portal, mounted at /admin and guarded with `adminOnly`.
 */
'use strict';

const express = require('express');

const admin = require('../controllers/adminController');
const asyncHandler = require('../utils/asyncHandler');
const { adminOnly } = require('../middleware/role');

const router = express.Router();

// Every route below requires an active administrator account.
router.use(adminOnly);

// ===========================================================================
// Dashboard (FR-24)
// ===========================================================================
router.get('/', asyncHandler(require('../controllers/dashboardController').showAdminDashboard));
router.get('/dashboard', asyncHandler(require('../controllers/dashboardController').showAdminDashboard));

// ===========================================================================
// Users (FR-19 / FR-20)
// ===========================================================================
router.get('/users', asyncHandler(admin.showUsers));
router.get('/users/export.csv', asyncHandler(admin.exportUsers));
router.post('/users/bulk', asyncHandler(admin.bulkUserAction));
router.get('/users/:id', asyncHandler(admin.showUser));
router.post('/users/:id', asyncHandler(admin.updateUser));

// ===========================================================================
// Opportunity moderation (FR-21 / FR-22)
// ===========================================================================
router.get('/opportunities', asyncHandler(admin.showOpportunities));
router.get('/opportunities/export.csv', asyncHandler(admin.exportOpportunities));
router.post('/opportunities/bulk', asyncHandler(admin.bulkModerate));
router.get('/opportunities/:id', asyncHandler(require('../controllers/opportunityController').showDetail));
router.post('/opportunities/:id/moderate', asyncHandler(admin.moderateOpportunity));

// ===========================================================================
// Analytics (bonus 10)
// ===========================================================================
router.get('/analytics', asyncHandler(admin.showAnalytics));

// ===========================================================================
// Activity log (bonus 11)
// ===========================================================================
router.get('/activity', asyncHandler(admin.showActivityLog));

// ===========================================================================
// Feedback inbox (bonus 19)
// ===========================================================================
router.get('/feedback', asyncHandler(admin.showFeedback));
router.post('/feedback/:id', asyncHandler(admin.updateFeedback));

// ===========================================================================
// Announcements (bonus 20)
// ===========================================================================
router.get('/announcements', asyncHandler(admin.showAnnouncements));
router.post('/announcements', asyncHandler(admin.createAnnouncement));
router.post('/announcements/:id', asyncHandler(admin.updateAnnouncement));

// ===========================================================================
// Company verification (FR-23)
// ===========================================================================
router.post('/companies/:id/verify', asyncHandler(admin.toggleVerification));

module.exports = router;