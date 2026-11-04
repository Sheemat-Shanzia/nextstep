/**
 * controllers/searchController.js
 * ---------------------------------------------------------------------------
 * FR-06 / FR-07 : the search + filter endpoint.
 *
 * The heavy lifting lives in utils/opportunityQuery.js (filter construction)
 * and controllers/opportunityController.js (the shared browse renderer); this
 * controller adds the JSON helpers that power the live search box.
 */
'use strict';

const Opportunity = require('../models/Opportunity');
const asyncHandler = require('../utils/asyncHandler');
const { buildOpportunityFilter } = require('../utils/opportunityQuery');

// ===========================================================================
// GET /search        - full page search (delegates to the shared renderer)
// ===========================================================================
exports.showSearchPage = asyncHandler(async (req, res) => {
  const opportunityController = require('./opportunityController');
  return opportunityController.showSearch(req, res, () => {});
});

// ===========================================================================
// GET /search/suggest?q=...   - live type-ahead suggestions (JSON)
// ===========================================================================
exports.suggest = asyncHandler(async (req, res) => {
  const keyword = String(req.query.q || '').trim();
  if (keyword.length < 2) return res.json({ ok: true, results: [] });

  const { filter } = buildOpportunityFilter({ q: keyword }, { studentVisibleOnly: true });

  const results = await Opportunity.find(filter)
    .select('title type companyNameCopy location category deadline')
    .sort({ deadline: 1 })
    .limit(8)
    .lean();

  return res.json({
    ok: true,
    results: results.map((o) => ({
      id: o._id,
      title: o.title,
      type: o.type,
      company: o.companyNameCopy,
      location: o.location,
      category: o.category,
      url: `/opportunities/${o._id}`
    }))
  });
});

// ===========================================================================
// GET /search/facets  - available filter options as JSON (used by main.js)
// ===========================================================================
exports.facets = asyncHandler(async (req, res) => {
  const [categories, locations] = await Promise.all([
    Opportunity.distinct('category', { status: 'approved', isActive: true }),
    Opportunity.distinct('location', { status: 'approved', isActive: true })
  ]);

  return res.json({
    ok: true,
    categories: categories.filter(Boolean).sort(),
    locations: locations.filter(Boolean).sort()
  });
});