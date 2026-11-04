/**
 * controllers/opportunityController.js
 * ---------------------------------------------------------------------------
 * FR-08 to FR-11 : browsing, opportunity details, view counter, similar
 * opportunities and the "already applied" state used by every card.
 */
'use strict';

const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');
const Bookmark = require('../models/Bookmark');
const asyncHandler = require('../utils/asyncHandler');
const { getPagination, buildPageMeta } = require('../utils/pagination');
const { buildOpportunityFilter, buildSortArgument, listCategories, listLocations, SORT_OPTIONS, DEADLINE_WINDOWS } = require('../utils/opportunityQuery');
const { recommendedOpportunities } = require('../services/recommendationService');
const dashboardService = require('../services/dashboardService');

/**
 * Attach the set of opportunity ids the signed-in student already applied to,
 * plus the set of ids they saved. Cards use this to render the right buttons.
 * Also expose the saved-ids to every card in one place.
 */
async function loadViewerState(req, res, opportunities) {
  const ids = (opportunities || []).map((o) => o._id).filter(Boolean);
  res.locals.appliedIds = new Set();
  res.locals.bookmarkedIds = new Set();

  if (!req.user || req.user.role !== 'student' || !ids.length) return;

  const [applied, saved] = await Promise.all([
    Application.find({ student: req.user._id, opportunity: { $in: ids } }).distinct('opportunity'),
    Bookmark.find({ student: req.user._id, opportunity: { $in: ids } }).distinct('opportunity')
  ]);

  res.locals.appliedIds = new Set(applied.map(String));
  res.locals.bookmarkedIds = new Set(saved.map(String));
}

/**
 * GET /opportunities            - browse (FR-08)
 * GET /search                   - advanced search (FR-06 / FR-07)
 * Both share this handler; `advanced` switches the template + filter set.
 */
function browseHandler(advanced) {
  return asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req.query, { defaultLimit: advanced ? 9 : 12, maxLimit: 48 });

    const { filter, useText, keyword, sort } = buildOpportunityFilter(req.query, { studentVisibleOnly: true });

    let query = Opportunity.find(filter);
    if (useText && sort === 'relevance') query = query.select({ score: { $meta: 'textScore' } });
    query = query
      .sort(buildSortArgument(sort, useText))
      .populate({ path: 'companyProfile', select: 'companyName logo verified industry location averageRating reviewCount' })
      .skip(skip)
      .limit(limit);

    const [total, opportunities] = await Promise.all([Opportunity.countDocuments(filter), query.lean({ virtuals: true })]);

    await loadViewerState(req, res, opportunities);

    const [categories, locations] = advanced
      ? await Promise.all([listCategories(), listLocations()])
      : [[], []];

    res.render(advanced ? 'opportunities/search' : 'opportunities/index', {
      title: advanced ? 'Search opportunities' : 'Browse opportunities',
      opportunities,
      pager: buildPageMeta({ page, limit, total }),
      categories,
      locations,
      sortOptions: SORT_OPTIONS,
      deadlineWindows: DEADLINE_WINDOWS,
      keyword,
      sort,
      advanced,
      // Featured block only on the plain browse page.
      featured: advanced ? [] : await Opportunity.find({ status: 'approved', isActive: true, deadline: { $gt: new Date() } })
        .sort({ views: -1 })
        .limit(3)
        .populate('companyProfile', 'companyName logo verified')
        .lean()
    });
  });
}

exports.showBrowse = browseHandler(false);
exports.showSearch = browseHandler(true);

// ===========================================================================
// GET /opportunities/:id   - details page (FR-10)
// ===========================================================================
exports.showDetail = asyncHandler(async (req, res) => {
  const opportunity = await Opportunity.findById(req.params.id)
    .populate('companyProfile')
    .populate('company', 'name email status');

  // Missing or invalid id -> 404 (handled by the error handler).
  if (!opportunity) {
    const err = new Error('That opportunity could not be found.');
    err.status = 404;
    throw err;
  }

  // -------------------------------------------------------------------------
  // Visibility: students may only ever see approved + active + unexpired posts.
  // Companies may open their own posts (whatever the status), admins always.
  // -------------------------------------------------------------------------
  const isOwner = req.user && opportunity.company.toString() === req.user._id.toString();
  const isAdmin = req.user && req.user.role === 'admin';

  if (!isOwner && !isAdmin && !opportunity.isVisibleToStudents) {
    return res.status(404).render('errors/404', {
      title: 'Opportunity not available',
      message: 'This opportunity is no longer available (it may be closed, expired or awaiting approval).',
      user: req.user
    });
  }

  // ---- FR-11 / bonus 14: view counter -------------------------------------
  opportunity.views += 1;
  await opportunity.save({ validateBeforeSave: false });

  // ---- viewer state (applied / saved) -------------------------------------
  let existingApplication = null;
  let myBookmark = null;
  if (req.user && req.user.role === 'student') {
    [existingApplication, myBookmark] = await Promise.all([
      Application.findOne({ student: req.user._id, opportunity: opportunity._id }),
      Bookmark.findOne({ student: req.user._id, opportunity: opportunity._id })
    ]);
  }

  // ---- similar opportunities (same category / overlapping skills) ---------
  const similar = await Opportunity.aggregate([
    {
      $match: {
        _id: { $ne: opportunity._id },
        status: 'approved',
        isActive: true,
        deadline: { $gt: new Date() },
        $or: [
          { category: opportunity.category },
          { requiredSkills: { $in: (opportunity.requiredSkills || []).slice(0, 5) } }
        ]
      }
    },
    {
      $addFields: {
        overlap: {
          $size: {
            $setIntersection: [
              { $ifNull: ['$requiredSkills', []] },
              { $ifNull: [opportunity.requiredSkills || [], []] }
            ]
          }
        }
      }
    },
    { $sort: { overlap: -1, views: -1 } },
    { $limit: 3 },
    {
      $lookup: { from: 'companyprofiles', localField: 'companyProfile', foreignField: '_id', as: 'companyProfile' }
    },
    { $unwind: { path: '$companyProfile', preserveNullAndEmptyArrays: true } }
  ]);

  // ---- skill based recommendations for this student -----------------------
  let recommendations = [];
  if (req.user && req.user.role === 'student') {
    recommendations = await recommendedOpportunities(req.user._id, {
      limit: 3,
      excludeIds: [opportunity._id]
    });
  }

  await loadViewerState(req, res, [opportunity]);

  res.render('opportunities/detail', {
    title: opportunity.title,
    opportunity,
    company: opportunity.companyProfile,
    existingApplication,
    myBookmark,
    similar,
    recommendations
  });
});

// ===========================================================================
// GET /opportunities/most-viewed  - bonus feature 14
// ===========================================================================
exports.showMostViewed = asyncHandler(async (req, res) => {
  const opportunities = await dashboardService.mostViewed(12);
  await loadViewerState(req, res, opportunities);

  res.render('opportunities/mostViewed', {
    title: 'Most viewed opportunities',
    opportunities
  });
});

// ===========================================================================
// GET /opportunities/:id/apply - the application form (FR-11)
// ===========================================================================
exports.showApplyForm = asyncHandler(async (req, res) => {
  const opportunity = await Opportunity.findById(req.params.id).populate('companyProfile');

  if (!opportunity || !opportunity.isVisibleToStudents) {
    const err = new Error('That opportunity is no longer accepting applications.');
    err.status = 404;
    throw err;
  }

  const already = await Application.findOne({ student: req.user._id, opportunity: opportunity._id });
  if (already) {
    req.flash('warning', 'You have already applied to this opportunity. You can track it under My applications.');
    return res.redirect(`/student/applications/${already._id}`);
  }

  const StudentProfile = require('../models/StudentProfile');
  const profile = await StudentProfile.findOne({ user: req.user._id }).populate('user', 'name email');

  // Extra questions are derived from the post so the company can ask whatever
  // matters for that specific opportunity (FR-11 "extra answers").
  const questions = [
    `Why are you a good fit for "${opportunity.title}"? (max 300 characters)`,
    opportunity.type === 'scholarship'
      ? 'How will this scholarship support your studies?'
      : 'What is the earliest date you could start?'
  ];

  res.render('opportunities/apply', {
    title: `Apply - ${opportunity.title}`,
    opportunity,
    company: opportunity.companyProfile,
    profile,
    questions
  });
});