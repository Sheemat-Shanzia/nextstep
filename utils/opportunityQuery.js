/**
 * utils/opportunityQuery.js
 * ---------------------------------------------------------------------------
 * Single source of truth for "which opportunities match these filters".
 * Used by the landing page, the browse page, the search page and the
 * recommendation engine, so the visibility rules can never drift apart.
 *
 * Visibility rules (FR-12 / acceptance check "Rejected/pending opportunities
 * are never visible to students"):
 *      status === 'approved'  AND  isActive === true  AND  deadline > now
 */
'use strict';

const Opportunity = require('../models/Opportunity');
const { queryString } = require('./pagination');

/** Escape user input so it can be safely embedded in a RegExp. */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Options offered by the sort dropdown in the UI. */
const SORT_OPTIONS = [
  { value: 'relevance', label: 'Most relevant' },
  { value: 'newest', label: 'Newest first' },
  { value: 'deadline', label: 'Deadline (soonest)' },
  { value: 'popularity', label: 'Most viewed' },
  { value: 'stipend', label: 'Highest stipend / award' }
];

/** Deadline windows offered by the "deadline" filter. */
const DEADLINE_WINDOWS = [
  { value: '', label: 'Any deadline' },
  { value: '3', label: 'Next 3 days' },
  { value: '7', label: 'Next 7 days' },
  { value: '30', label: 'Next 30 days' }
];

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) && String(value).trim() !== '' ? n : fallback;
}

/**
 * Build the MongoDB filter object from the request query string.
 *
 * @param {object} q  req.query
 * @param {{
 *   studentVisibleOnly?: boolean,  // default true - hides pending/rejected
 *   extraFilter?: object           // merged last (company: id, _id: id, ...)
 *   forceTextSearch?: boolean      // skip regex fallback
 * }} [opts]
 * @returns {{filter: object, useText: boolean, keyword: string, sort: string, active: object}}
 */
function buildOpportunityFilter(q = {}, opts = {}) {
  const { studentVisibleOnly = true, extraFilter = {}, forceTextSearch = false } = opts;
  const filter = {};

  // ---- visibility ----------------------------------------------------------
  if (studentVisibleOnly) {
    filter.status = 'approved';
    filter.isActive = true;
    filter.deadline = { $gt: new Date() };
  }

  // ---- keyword -------------------------------------------------------------
  const keyword = String(q.q || q.keyword || '').trim();
  let useText = false;
  if (keyword) {
    if (forceTextSearch) {
      filter.$text = { $search: keyword };
      useText = true;
    } else {
      // Regex fallback keeps the search useful when Mongo's text index has not
      // finished building yet, or for partial words.
      const rx = new RegExp(escapeRegex(keyword), 'i');
      filter.$or = [
        { title: rx },
        { companyNameCopy: rx },
        { requiredSkills: rx },
        { tags: rx },
        { category: rx },
        { location: rx }
      ];
    }
  }

  // ---- facets --------------------------------------------------------------
  const type = String(q.type || '').trim();
  if (type === 'internship' || type === 'scholarship') filter.type = type;

  const mode = String(q.mode || '').trim();
  if (['onsite', 'remote', 'hybrid'].includes(mode)) filter.mode = mode;

  const location = String(q.location || '').trim();
  if (location) filter.location = new RegExp(escapeRegex(location), 'i');

  const category = String(q.category || '').trim();
  if (category) filter.category = category;

  const skill = String(q.skill || '').trim();
  if (skill) filter.requiredSkills = new RegExp(`^${escapeRegex(skill)}$`, 'i');

  // Stipend / award range (scholarships are filtered by total award amount).
  const minStipend = toNumber(q.minStipend);
  const maxStipend = toNumber(q.maxStipend);
  if (minStipend !== null || maxStipend !== null) {
    filter.stipend = {};
    if (minStipend !== null) filter.stipend.$gte = minStipend;
    if (maxStipend !== null) filter.stipend.$lte = maxStipend;
  }

  // Deadline window - narrows the existing {$gt: now} visibility constraint.
  const window = String(q.deadline || '').trim();
  if (['3', '7', '30'].includes(window)) {
    const until = new Date(Date.now() + Number(window) * 24 * 60 * 60 * 1000);
    filter.deadline = { $gt: new Date(), $lt: until };
  }

  // ---- always last ---------------------------------------------------------
  Object.assign(filter, extraFilter);

  // ---- sort ----------------------------------------------------------------
  const allowed = SORT_OPTIONS.map((o) => o.value);
  const sort = allowed.includes(String(q.sort)) ? String(q.sort) : keyword && !forceTextSearch ? 'relevance' : 'newest';

  return { filter, useText: useText || (Boolean(keyword) && forceTextSearch), keyword, sort };
}

/** Translate a sort key into a Mongoose `sort()` argument. */
function buildSortArgument(sortKey, useText) {
  switch (sortKey) {
    case 'relevance':
      return useText ? { score: { $meta: 'textScore' } } : { createdAt: -1 };
    case 'deadline':
      return { deadline: 1 };
    case 'popularity':
      return { views: -1 };
    case 'stipend':
      return { stipend: -1 };
    case 'newest':
    default:
      return { createdAt: -1 };
  }
}

/**
 * Convenience wrapper used by the controllers: returns the query already
 * sorted, populated and paginated.
 *
 * @param {object} q req.query
 * @param {object} [opts] see buildOpportunityFilter + pagination opts
 * @param {import('mongoose').Query} [q] extraQuery (e.g. pre-built aggregation)
 */
function findOpportunities(q = {}, opts = {}) {
  const { filter, useText, keyword, sort } = buildOpportunityFilter(q, opts);
  let query = Opportunity.find(filter);

  if (useText && sort === 'relevance') {
    query = query.select({ score: { $meta: 'textScore' } });
  }
  query = query.sort(buildSortArgument(sort, useText));

  // Only populate what the card template actually renders.
  query = query.populate({ path: 'companyProfile', select: 'companyName logo verified industry location averageRating reviewCount' });

  if (opts.populateCompany) {
    query = query.populate({ path: 'company', select: 'name email status' });
  }

  return { query, useText, keyword, sort };
}

/** Distinct categories available in the filter sidebar. */
async function listCategories() {
  try {
    return await Opportunity.distinct('category', { status: 'approved' });
  } catch (err) {
    return [];
  }
}

/** Distinct locations available in the filter sidebar (top 25). */
async function listLocations(limit = 25) {
  try {
    const rows = await Opportunity.aggregate([
      { $match: { status: 'approved', isActive: true, deadline: { $gt: new Date() } } },
      { $group: { _id: '$location', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit }
    ]);
    return rows.map((r) => r._id).filter(Boolean);
  } catch (err) {
    return [];
  }
}

module.exports = {
  buildOpportunityFilter,
  buildSortArgument,
  findOpportunities,
  listCategories,
  listLocations,
  escapeRegex,
  SORT_OPTIONS,
  DEADLINE_WINDOWS
};