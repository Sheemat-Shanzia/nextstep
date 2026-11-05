/**
 * services/dashboardService.js
 * ---------------------------------------------------------------------------
 * Every dashboard / analytics number comes from a MongoDB aggregation
 * pipeline (FR-24 and the "at least 5 distinct aggregations" requirement).
 *
 * The aggregations implemented here:
 *   1. applications grouped by status                 (student + company)
 *   2. applications per month (trend)                 (student + admin)
 *   3. users grouped by role                          (admin)
 *   4. users growth per month                         (admin analytics)
 *   5. opportunities grouped by type                  (admin)
 *   6. opportunities grouped by category              (admin analytics)
 *   7. opportunities grouped by moderation status     (approval rate)
 *   8. top required skills (unwind + group + sort)    (admin analytics)
 *   9. applicants per opportunity for one company     (company)
 *  10. top companies by approved openings             (landing page)
 *  11. most viewed opportunities                      (landing + detail)
 *  12. site wide counters                             (landing hero stats)
 */
'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');
const Review = require('../models/Review');
const Announcement = require('../models/Announcement');
const ActivityLog = require('../models/ActivityLog');
const CompanyProfile = require('../models/CompanyProfile');

/** Ensure a $group result always has every known key (charts hate undefined). */
function withZeroes(rows, keys, valueKey) {
  const map = new Map(rows.map((r) => [r._id, r[valueKey]]));
  return keys.map((k) => ({ _id: k, value: map.get(k) || 0 }));
}

// ===========================================================================
// 1 + 2. Application aggregations
// ===========================================================================

/**
 * Count a student's applications per status.
 * @param {string} userId
 * @returns {Promise<{rows:Array<{_id:string,value:number}>, total:number}>}
 */
async function applicationsByStatusForStudent(userId) {
  const rows = await Application.aggregate([
    { $match: { student: new mongoose.Types.ObjectId(userId) } },
    { $group: { _id: '$status', value: { $sum: 1 } } },
    { $sort: { value: -1 } }
  ]);
  return { rows: withZeroes(rows, require('../models/Application').APPLICATION_STATUSES, 'value'), total: rows.reduce((s, r) => s + r.value, 0) };
}

/**
 * Count a company's applicants per status (across all its opportunities).
 * @param {string} companyUserId
 */
async function applicationsByStatusForCompany(companyUserId) {
  const rows = await Application.aggregate([
    { $match: { company: new mongoose.Types.ObjectId(companyUserId) } },
    { $group: { _id: '$status', value: { $sum: 1 } } },
    { $sort: { value: -1 } }
  ]);
  return { rows: withZeroes(rows, require('../models/Application').APPLICATION_STATUSES, 'value'), total: rows.reduce((s, r) => s + r.value, 0) };
}

/**
 * Monthly application trend.
 * @param {{months?:number, studentId?:string, opportunityId?:string}} [opts]
 * @returns {Promise<Array<{_id:string, value:number}>>}
 */
async function applicationsTrend({ months = 6, studentId, opportunityId } = {}) {
  const since = new Date();
  since.setMonth(since.getMonth() - (months - 1));
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const match = { appliedAt: { $gte: since } };
  if (studentId) match.student = new mongoose.Types.ObjectId(studentId);
  if (opportunityId) match.opportunity = new mongoose.Types.ObjectId(opportunityId);

  const rows = await Application.aggregate([
    { $match: match },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$appliedAt' } }, value: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);

  // Fill the gaps so the Chart.js line has a continuous x-axis.
  const map = new Map(rows.map((r) => [r._id, r.value]));
  const out = [];
  const cursor = new Date(since);
  for (let i = 0; i < months; i += 1) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    out.push({ _id: key, value: map.get(key) || 0 });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

// ===========================================================================
// 3 + 4. User aggregations (admin)
// ===========================================================================

/** Users grouped by role. */
async function usersByRole() {
  const rows = await User.aggregate([{ $group: { _id: '$role', value: { $sum: 1 } } }, { $sort: { value: -1 } }]);
  return withZeroes(rows, ['student', 'company', 'admin'], 'value');
}

/** Users grouped by status. */
async function usersByStatus() {
  const rows = await User.aggregate([{ $group: { _id: '$status', value: { $sum: 1 } } }, { $sort: { value: -1 } }]);
  return withZeroes(rows, ['active', 'suspended', 'pending'], 'value');
}

/** New users per month (growth chart). */
async function usersGrowth(months = 6) {
  const since = new Date();
  since.setMonth(since.getMonth() - (months - 1));
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const rows = await User.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, value: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);

  const map = new Map(rows.map((r) => [r._id, r.value]));
  const out = [];
  const cursor = new Date(since);
  for (let i = 0; i < months; i += 1) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    out.push({ _id: key, value: map.get(key) || 0 });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

// ===========================================================================
// 5 + 6 + 7 + 8. Opportunity aggregations (admin)
// ===========================================================================

/** Opportunities grouped by type. */
async function opportunitiesByType() {
  const rows = await Opportunity.aggregate([{ $group: { _id: '$type', value: { $sum: 1 } } }, { $sort: { value: -1 } }]);
  return withZeroes(rows, ['internship', 'scholarship'], 'value');
}

/** Opportunities grouped by category (top 10). */
async function opportunitiesByCategory(limit = 10) {
  const rows = await Opportunity.aggregate([
    { $group: { _id: '$category', value: { $sum: 1 } } },
    { $sort: { value: -1 } },
    { $limit: limit }
  ]);
  return rows.map((r) => ({ _id: r._id || 'General', value: r.value }));
}

/** Opportunities grouped by moderation status + the derived approval rate. */
async function opportunitiesByStatus() {
  const rows = await Opportunity.aggregate([
    { $group: { _id: '$status', value: { $sum: 1 } } },
    { $sort: { value: -1 } }
  ]);
  const list = withZeroes(rows, ['pending', 'approved', 'rejected'], 'value');
  const total = list.reduce((s, r) => s + r.value, 0);
  const approved = (list.find((r) => r._id === 'approved') || {}).value || 0;
  return {
    rows: list,
    total,
    approved,
    pending: (list.find((r) => r._id === 'pending') || {}).value || 0,
    rejected: (list.find((r) => r._id === 'rejected') || {}).value || 0,
    approvalRate: total ? Math.round((approved / total) * 100) : 0
  };
}

/** Top required skills across every opportunity. */
async function topSkills(limit = 10) {
  const rows = await Opportunity.aggregate([
    { $match: { status: 'approved' } },
    { $unwind: '$requiredSkills' },
    { $group: { _id: '$requiredSkills', value: { $sum: 1 } } },
    { $sort: { value: -1 } },
    { $limit: limit }
  ]);
  return rows;
}

/** Openings offered per category (how much the market is hiring). */
async function openingsByCategory(limit = 8) {
  const rows = await Opportunity.aggregate([
    { $match: { status: 'approved', isActive: true, deadline: { $gt: new Date() } } },
    { $group: { _id: '$category', value: { $sum: '$openings' } } },
    { $sort: { value: -1 } },
    { $limit: limit }
  ]);
  return rows;
}

// ===========================================================================
// 9. Company aggregations
// ===========================================================================

/**
 * Applicant counts for a single opportunity, grouped by status.
 * @param {string} opportunityId
 */
async function applicantsByStatusForOpportunity(opportunityId) {
  const rows = await Application.aggregate([
    { $match: { opportunity: new mongoose.Types.ObjectId(opportunityId) } },
    { $group: { _id: '$status', value: { $sum: 1 } } },
    { $sort: { value: -1 } }
  ]);
  return { rows: withZeroes(rows, require('../models/Application').APPLICATION_STATUSES, 'value'), total: rows.reduce((s, r) => s + r.value, 0) };
}

/** How many applications each of the company's opportunities received. */
async function applicantsPerOpportunity(companyUserId, limit = 10) {
  const rows = await Application.aggregate([
    { $match: { company: new mongoose.Types.ObjectId(companyUserId) } },
    { $group: { _id: '$opportunity', value: { $sum: 1 } } },
    { $sort: { value: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'opportunities',
        localField: '_id',
        foreignField: '_id',
        as: 'opportunity'
      }
    },
    { $unwind: { path: '$opportunity', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        value: 1,
        title: { $ifNull: ['$opportunity.title', '(deleted opportunity)'] },
        type: { $ifNull: ['$opportunity.type', 'internship'] }
      }
    }
  ]);
  return rows;
}

// ===========================================================================
// 10 + 11 + 12. Public / landing aggregations
// ===========================================================================

/** Companies with the most currently-open approved opportunities. */
async function topCompanies(limit = 6) {
  return Opportunity.aggregate([
    { $match: { status: 'approved', isActive: true, deadline: { $gt: new Date() } } },
    { $group: { _id: '$companyNameCopy', openings: { $sum: '$openings' }, posts: { $sum: 1 } } },
    { $sort: { openings: -1 } },
    { $limit: limit }
  ]);
}

/** Most viewed opportunities. */
async function mostViewed(limit = 5) {
  return Opportunity.aggregate([
    { $match: { status: 'approved', isActive: true, deadline: { $gt: new Date() } } },
    { $sort: { views: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'companyprofiles',
        localField: 'companyProfile',
        foreignField: '_id',
        as: 'companyProfile'
      }
    },
    { $unwind: { path: '$companyProfile', preserveNullAndEmptyArrays: true } }
  ]);
}

/** The counters shown in the landing page hero and platform highlights. */
async function siteStats() {
  const [students, companies, opportunities, internships, scholarships, verifiedCompanies, applications, reviews, dead] = await Promise.all([
    User.countDocuments({ role: 'student' }).catch(() => 0),
    User.countDocuments({ role: 'company' }).catch(() => 0),
    Opportunity.countDocuments({ status: 'approved', isActive: true, deadline: { $gt: new Date() } }).catch(() => 0),
    Opportunity.countDocuments({ status: 'approved', isActive: true, type: 'internship', deadline: { $gt: new Date() } }).catch(() => 0),
    Opportunity.countDocuments({ status: 'approved', isActive: true, type: 'scholarship', deadline: { $gt: new Date() } }).catch(() => 0),
    CompanyProfile.countDocuments({ verified: true }).catch(() => 0),
    Application.countDocuments({}).catch(() => 0),
    Review.countDocuments({}).catch(() => 0),
    new Promise((resolve) => {
      User.aggregate([{ $group: { _id: null, total: { $sum: 1 } } }])
        .then((r) => resolve(r[0] ? r[0].total : 0))
        .catch(() => resolve(0));
    })
  ]);

  return {
    students: students || 0,
    companies: companies || 0,
    opportunities: opportunities || 0,
    internships: internships || 0,
    scholarships: scholarships || 0,
    verifiedCompanies: verifiedCompanies || 0,
    applications: applications || 0,
    reviews: reviews || 0,
    totalUsers: dead || 0,
    totalUsersLabel: (dead || 0) >= 1000 ? `${((dead || 0) / 1000).toFixed(1)}k` : String(dead || 0)
  };
}

/** Average rating across every review (shown on the landing page). */
async function averageRating() {
  const rows = await Review.aggregate([{ $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }]);
  if (!rows.length) return { avg: 0, count: 0 };
  return { avg: Math.round(rows[0].avg * 10) / 10, count: rows[0].count };
}

// ===========================================================================
// Announcements + activity feed (dashboards)
// ===========================================================================

/** Live announcements for a given role. */
async function announcementsForRole(role, limit = 5) {
  return Announcement.find({
    isActive: true,
    audience: role,
    ...(role === 'admin' ? {} : {})
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

/** Live announcements for every role (empty audience array = everybody). */
async function announcementsForEveryone(limit = 5) {
  return Announcement.find({
    isActive: true,
    $or: [{ audience: { $size: 0 } }, { expiresAt: null }, { expiresAt: { $gt: new Date() } }]
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

/** Latest activity log entries, optionally filtered by role. */
async function recentActivity(limit = 12, roles = null) {
  const match = roles ? { userRole: { $in: roles } } : {};
  return ActivityLog.find(match).sort({ createdAt: -1 }).limit(limit).populate('user', 'name role').lean();
}

module.exports = {
  applicationsByStatusForStudent,
  applicationsByStatusForCompany,
  applicantsByStatusForOpportunity,
  applicantsPerOpportunity,
  applicationsTrend,
  usersByRole,
  usersByStatus,
  usersGrowth,
  opportunitiesByType,
  opportunitiesByCategory,
  opportunitiesByStatus,
  openingsByCategory,
  topSkills,
  topCompanies,
  mostViewed,
  siteStats,
  averageRating,
  announcementsForRole,
  announcementsForEveryone,
  recentActivity
};