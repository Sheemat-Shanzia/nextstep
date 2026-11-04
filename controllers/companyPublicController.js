/**
 * controllers/companyPublicController.js
 * ---------------------------------------------------------------------------
 * Bonus feature 7 : the public company profile page.
 * Anyone (even a guest) can open /companies/:id and see the company details,
 * its rating and the list of its currently-open approved opportunities.
 */
'use strict';

const CompanyProfile = require('../models/CompanyProfile');
const Opportunity = require('../models/Opportunity');
const Review = require('../models/Review');
const asyncHandler = require('../utils/asyncHandler');
const { getPagination, buildPageMeta } = require('../utils/pagination');

/** GET /companies  - directory of every verified / active company */
exports.showDirectory = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, { defaultLimit: 12, maxLimit: 48 });

  const filter = { };
  const search = String(req.query.q || '').trim();
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ companyName: rx }, { industry: rx }];
  }

  const [total, companies] = await Promise.all([
    CompanyProfile.countDocuments(filter),
    CompanyProfile.find(filter)
      .sort({ verified: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  // How many open posts does each company have right now?
  const rows = await Opportunity.aggregate([
    { $match: { status: 'approved', isActive: true, deadline: { $gt: new Date() } } },
    { $group: { _id: '$company', openCount: { $sum: 1 }, openings: { $sum: '$openings' } } }
  ]);
  const openByCompany = new Map(rows.map((r) => [String(r._id), r]));

  res.render('public/companyDirectory', {
    title: 'Companies',
    companies: companies.map((c) => ({ ...c, ...(openByCompany.get(String(c.user)) || { openCount: 0, openings: 0 }) })),
    search,
    pager: buildPageMeta({ page, limit, total })
  });
});

/** GET /companies/:id */
exports.showCompany = asyncHandler(async (req, res) => {
  const profile = await CompanyProfile.findOne({ user: req.params.id });
  if (!profile) {
    const err = new Error('That company profile could not be found.');
    err.status = 404;
    throw err;
  }

  const { page, limit, skip } = getPagination(req.query, { defaultLimit: 9, maxLimit: 48 });

  const filter = { company: profile.user, status: 'approved' };
  const type = String(req.query.type || '').trim();
  if (type === 'internship' || type === 'scholarship') filter.type = type;

  const [total, opportunities, reviews, ratingRows, user] = await Promise.all([
    Opportunity.countDocuments(filter),
    Opportunity.find(filter)
      .sort({ deadline: 1 })
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true }),
    Review.find({ company: profile.user })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('student', 'name')
      .lean(),
    Review.aggregate([
      { $match: { company: profile.user } },
      { $group: { _id: '$rating', value: { $sum: 1 } } },
      { $sort: { _id: -1 } }
    ]),
    require('../models/User').findById(profile.user).select('name createdAt').lean()
  ]);

  res.render('public/companyProfile', {
    title: profile.companyName,
    profile,
    owner: user,
    opportunities,
    reviews,
    ratingDistribution: Object.fromEntries(ratingRows.map((r) => [r._id, r.value])),
    activeType: type,
    pager: buildPageMeta({ page, limit, total })
  });
});