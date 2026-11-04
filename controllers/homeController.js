/**
 * controllers/homeController.js
 * ---------------------------------------------------------------------------
 * The public landing page: hero + live search box, DB driven stat counters,
 * featured / most viewed opportunities, how-it-works and top companies.
 */
'use strict';

const Opportunity = require('../models/Opportunity');
const asyncHandler = require('../utils/asyncHandler');
const dashboardService = require('../services/dashboardService');
const Announcement = require('../models/Announcement');

/** GET / */
exports.showHome = asyncHandler(async (req, res) => {
  const [stats, featured, mostViewed, topCompanies, avgRating, announcements, categories] = await Promise.all([
    dashboardService.siteStats(),
    Opportunity.find({ status: 'approved', isActive: true, deadline: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .limit(6)
      .populate({ path: 'companyProfile', select: 'companyName logo verified averageRating reviewCount' })
      .lean(),
    dashboardService.mostViewed(5),
    dashboardService.topCompanies(5),
    dashboardService.averageRating(),
    Announcement.find({ isActive: true, audience: { $in: ['student', 'company'] } })
      .sort({ createdAt: -1 })
      .limit(2)
      .lean(),
    Opportunity.distinct('category', { status: 'approved', isActive: true }).catch(() => [])
  ]);

  res.render('home/index', {
    title: 'Internships & Scholarships in one place',
    stats,
    featured,
    mostViewed,
    topCompanies,
    avgRating,
    announcements,
    categories: (categories || []).filter(Boolean).slice(0, 10),
    isLanding: true
  });
});