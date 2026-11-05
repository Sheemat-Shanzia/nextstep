/**
 * controllers/homeController.js
 * ---------------------------------------------------------------------------
 * The public landing page: hero + live search box, DB driven stat counters,
 * featured internships & scholarships, category browser, how-it-works,
 * why-choose features, student testimonials and top companies.
 */
'use strict';

const Opportunity = require('../models/Opportunity');
const Announcement = require('../models/Announcement');
const Review = require('../models/Review');
const Application = require('../models/Application');
const Bookmark = require('../models/Bookmark');
const asyncHandler = require('../utils/asyncHandler');
const dashboardService = require('../services/dashboardService');

/** GET / */
exports.showHome = asyncHandler(async (req, res) => {
  const oppPopulate = {
    path: 'companyProfile',
    select: 'companyName logo verified industry location averageRating reviewCount'
  };

  const [
    stats,
    featured,
    featuredInternships,
    featuredScholarships,
    mostViewed,
    topCompanies,
    avgRating,
    announcements,
    categories,
    categoryStats,
    reviews
  ] = await Promise.all([
    dashboardService.siteStats(),
    // Generic featured for compatibility
    Opportunity.find({ status: 'approved', isActive: true, deadline: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .limit(6)
      .populate(oppPopulate)
      .lean({ virtuals: true }),
    // Dedicated featured internships
    Opportunity.find({ status: 'approved', isActive: true, type: 'internship', deadline: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .limit(6)
      .populate(oppPopulate)
      .lean({ virtuals: true }),
    // Dedicated featured scholarships
    Opportunity.find({ status: 'approved', isActive: true, type: 'scholarship', deadline: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .limit(6)
      .populate(oppPopulate)
      .lean({ virtuals: true }),
    dashboardService.mostViewed(5),
    dashboardService.topCompanies(6),
    dashboardService.averageRating(),
    Announcement.find({ isActive: true, audience: { $in: ['student', 'company'] } })
      .sort({ createdAt: -1 })
      .limit(2)
      .lean(),
    Opportunity.distinct('category', { status: 'approved', isActive: true }).catch(() => []),
    // Category aggregation for rich card counts
    Opportunity.aggregate([
      { $match: { status: 'approved', isActive: true, deadline: { $gt: new Date() } } },
      { $group: { _id: '$category', count: { $sum: 1 }, openings: { $sum: '$openings' } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]).catch(() => []),
    // Real student reviews for testimonials section
    Review.find({ rating: { $gte: 4 } })
      .sort({ createdAt: -1 })
      .limit(4)
      .populate('student', 'name email avatar')
      .populate('companyProfile', 'companyName logo')
      .lean()
      .catch(() => [])
  ]);

  // Set up applied/bookmarked state for the current user so cards render correctly
  if (req.user && req.user.role === 'student') {
    const allIds = [...featured, ...featuredInternships, ...featuredScholarships].map((o) => o._id).filter(Boolean);
    const [applied, saved] = await Promise.all([
      Application.find({ student: req.user._id, opportunity: { $in: allIds } }).distinct('opportunity'),
      Bookmark.find({ student: req.user._id, opportunity: { $in: allIds } }).distinct('opportunity')
    ]);
    res.locals.appliedIds = new Set(applied.map(String));
    res.locals.bookmarkedIds = new Set(saved.map(String));
  } else {
    res.locals.appliedIds = new Set();
    res.locals.bookmarkedIds = new Set();
  }

  res.render('home/index', {
    title: 'Career & Education Opportunities',
    stats,
    featured,
    featuredInternships,
    featuredScholarships,
    mostViewed,
    topCompanies,
    avgRating,
    announcements,
    categories: (categories || []).filter(Boolean).slice(0, 10),
    categoryStats: categoryStats || [],
    reviews: reviews || [],
    isLanding: true
  });
});
