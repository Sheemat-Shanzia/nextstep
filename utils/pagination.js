/**
 * utils/pagination.js
 * ---------------------------------------------------------------------------
 * Page maths shared by every list screen (bonus feature 16).
 * The EJS partial views/partials/pagination.ejs renders whatever comes back
 * from `buildPageMeta`.
 */
'use strict';

/**
 * Normalise ?page= and ?limit= from the query string.
 * @param {object} query  req.query
 * @param {{defaultLimit?:number, maxLimit?:number}} [opts]
 * @returns {{page:number, limit:number, skip:number}}
 */
function getPagination(query = {}, { defaultLimit = 12, maxLimit = 100 } = {}) {
  const rawPage = parseInt(query.page, 10);
  const rawLimit = parseInt(query.limit, 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, maxLimit) : defaultLimit;

  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Build the metadata the pagination partial needs.
 * @param {{page:number, limit:number, total:number}} p
 */
function buildPageMeta({ page, limit, total }) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * limit + 1;
  const to = Math.min(total, safePage * limit);

  return {
    page: safePage,
    limit,
    total,
    totalPages,
    from,
    to,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
    prevPage: safePage - 1,
    nextPage: safePage + 1,
    /** Compact window of page numbers, e.g. [1,'...',4,5,6,'...',12] */
    pages: pageWindow(safePage, totalPages, 2)
  };
}

/**
 * @param {number} current
 * @param {number} total
 * @param {number} span
 * @returns {Array<number|string>}
 */
function pageWindow(current, total, span = 2) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const out = [1];
  const start = Math.max(2, current - span);
  const end = Math.min(total - 1, current + span);

  if (start > 2) out.push('...');
  for (let i = start; i <= end; i += 1) out.push(i);
  if (end < total - 1) out.push('...');
  out.push(total);
  return out;
}

/**
 * Merge the current query string with overrides so that sorting / filtering
 * links keep the other parameters (and drop `page` when needed).
 * @param {object} query  req.query
 * @param {object} overrides
 * @returns {string} '?a=1&b=2'
 */
function queryString(query = {}, overrides = {}) {
  const merged = { ...query, ...overrides };
  const params = new URLSearchParams();

  Object.keys(merged).forEach((key) => {
    const value = merged[key];
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.filter((v) => v !== '' && v != null).forEach((v) => params.append(key, v));
    } else {
      params.append(key, value);
    }
  });

  const s = params.toString();
  return s ? `?${s}` : '';
}

module.exports = { getPagination, buildPageMeta, pageWindow, queryString };