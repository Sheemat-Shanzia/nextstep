/**
 * controllers/dashboardController.js
 * ---------------------------------------------------------------------------
 * FR-24 : three separate dashboards, one per role.
 *
 *   /student/dashboard  - student portal landing page
 *   /company/dashboard  - company portal landing page
 *   /admin/dashboard    - administrator portal landing page
 *
 * Every number comes from a MongoDB aggregation pipeline implemented in
 * services/dashboardService.js.
 */
'use strict';

const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const CompanyProfile = require('../models/CompanyProfile');
const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');
const Bookmark = require('../models/Bookmark');
const Announcement = require('../models/Announcement');

const asyncHandler = require('../utils/asyncHandler');
const { buildProfileChecklist } = require('../utils/profileStrength');
const dashboardService = require('../services/dashboardService');
const {
  recommendForStudent,
  appliedOpportunityIds,
  skillDemandInsight
} = require('../services/recommendationService');
const { getPagination, buildPageMeta } = require('../utils/pagination');
const { formatDate } = require('../utils/format');

// ===========================================================================
// Student dashboard
// ===========================================================================
exports.showStudentDashboard = asyncHandler(async (req, res) => {
  const studentId = req.user._id;

  const profile = await StudentProfile.findOne({ user: studentId }).populate('user', 'name email');
  const checklist = profile ? buildProfileChecklist(profile, profile.user) : { percentage: 0, level: 'Very weak', levelColor: 'danger', missing: [] };

  // ---- applications -------------------------------------------------------
  const statusStats = await dashboardService.applicationsByStatusForStudent(studentId);
  const recentApplications = await Application.find({ student: studentId })
    .populate({ path: 'opportunity', select: 'title type deadline location companyNameCopy companyProfile', populate: { path: 'companyProfile', select: 'companyName logo verified' } })
    .sort({ appliedAt: -1 })
    .limit(5)
    .lean({ virtuals: true });

  // ---- saved opportunities ------------------------------------------------
  const savedOpportunities = await Bookmark.find({ student: studentId })
    .sort({ createdAt: -1 })
    .limit(4)
    .populate({ path: 'opportunity', select: 'title type status deadline location stipend category companyNameCopy companyProfile views', populate: { path: 'companyProfile', select: 'companyName logo verified' } })
    .lean();
  const saved = savedOpportunities.filter((b) => b.opportunity && b.opportunity.status === 'approved');

  // ---- upcoming deadlines (applied + recommended) -------------------------
  const upcoming = await Application.find({
    student: studentId,
    status: { $nin: ['rejected', 'withdrawn'] }
  })
    .populate({ path: 'opportunity', select: 'title type deadline companyNameCopy' })
    .sort({ 'opportunity.deadline': 1 })
    .limit(5)
    .lean();
  const upcomingDeadlines = upcoming
    .filter((a) => a.opportunity && a.opportunity.deadline && new Date(a.opportunity.deadline) > new Date())
    .slice(0, 4);

  // ---- recommendations (skill match) -------------------------------------
  const alreadyApplied = await appliedOpportunityIds(studentId);
  const [recommended, demand] = await Promise.all([
    recommendForStudent(studentId, { limit: 6, excludeIds: alreadyApplied }),
    skillDemandInsight(studentId)
  ]);

  // ---- announcements + activity ------------------------------------------
  const announcements = await dashboardService.announcementsForRole('student', 4);

  // Chart payload consumed by views/partials/charts.ejs + public/js/main.js
  const chart = {
    applicationsByStatus: {
      labels: statusStats.rows.map((r) => r._id),
      values: statusStats.rows.map((r) => r.value)
    },
    trend: await dashboardService.applicationsTrend({ months: 6, studentId })
  };

  res.render('student/dashboard', {
    title: 'Student dashboard',
    profile,
    checklist,
    stats: {
      totalApplications: statusStats.total,
      activeApplications: statusStats.rows
        .filter((r) => !['rejected', 'withdrawn'].includes(r._id))
        .reduce((s, r) => s + r.value, 0),
      saved: saved.length,
      recommendations: recommended.length
    },
    statusStats: statusStats.rows,
    recentApplications,
    savedOpportunities: saved,
    upcomingDeadlines,
    recommended,
    skillDemand: demand.inDemand,
    announcements,
    chart
  });
});

// ===========================================================================
// Company dashboard
// ===========================================================================
exports.showCompanyDashboard = asyncHandler(async (req, res) => {
  const companyId = req.user._id;

  const profile = await CompanyProfile.findOne({ user: companyId });
  const today = new Date();

  // ---- opportunity counters (one aggregation) ----------------------------
  const oppRows = await Opportunity.aggregate([
    { $match: { company: companyId } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
        open: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$status', 'approved'] },
                  { $eq: ['$isActive', true] },
                  { $gt: ['$deadline', today] }
                ]
              },
              1,
              0
            ]
          }
        }
      }
    }
  ]);

  const counters = oppRows[0] || { total: 0, approved: 0, pending: 0, rejected: 0, open: 0 };

  const statusStats = await dashboardService.applicationsByStatusForCompany(companyId);
  const perOpportunity = await dashboardService.applicantsPerOpportunity(companyId, 5);

  const recentApplicants = await Application.find({ company: companyId })
    .populate('student', 'name email')
    .populate('opportunity', 'title type companyNameCopy')
    .sort({ appliedAt: -1 })
    .limit(6)
    .lean({ virtuals: true });

  const { page, limit, skip } = getPagination(req.query, { defaultLimit: 5 });
  const [totalOpps, recentOpps] = await Promise.all([
    Opportunity.countDocuments({ company: companyId }),
    Opportunity.find({ company: companyId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean({ virtuals: true })
  ]);

  const announcements = await dashboardService.announcementsForRole('company', 4);

  const chart = {
    applicantsByStatus: {
      labels: statusStats.rows.map((r) => r._id),
      values: statusStats.rows.map((r) => r.value)
    },
    trend: await dashboardService.applicationsTrend({ months: 6 })
  };

  res.render('company/dashboard', {
    title: 'Company dashboard',
    profile,
    counters: {
      ...counters,
      totalApplicants: statusStats.total,
      activeApplicants: statusStats.rows
        .filter((r) => !['rejected', 'withdrawn'].includes(r._id))
        .reduce((s, r) => s + r.value, 0)
    },
    statusStats: statusStats.rows,
    perOpportunity,
    recentApplicants,
    recentOpps,
    announcements,
    pager: buildPageMeta({ page, limit, total: totalOpps }),
    chart
  });
});

// ===========================================================================
// Admin dashboard
// ===========================================================================
exports.showAdminDashboard = asyncHandler(async (req, res) => {
  const [
    usersByRole,
    oppsByType,
    oppsByStatus,
    trend,
    recentActivity,
    totalUsers,
    totalApplications,
    openOpportunities,
    feedbackCount
  ] = await Promise.all([
    dashboardService.usersByRole(),
    dashboardService.opportunitiesByType(),
    dashboardService.opportunitiesByStatus(),
    dashboardService.applicationsTrend({ months: 6 }),
    dashboardService.recentActivity(12),
    User.countDocuments({}),
    Application.countDocuments({}),
    Opportunity.countDocuments({ status: 'approved', isActive: true, deadline: { $gt: new Date() } }),
    require('../models/Feedback').countDocuments({ status: 'new' })
  ]);

  const { page, limit, skip } = getPagination(req.query, { defaultLimit: 10 });
  const [pendingTotal, pendingQueue] = await Promise.all([
    Opportunity.countDocuments({ status: 'pending' }),
    Opportunity.find({ status: 'pending' })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate('companyProfile', 'companyName logo')
      .lean({ virtuals: true })
  ]);

  const announcements = await Announcement.find({ isActive: true, audience: 'admin' }).sort({ createdAt: -1 }).limit(4).lean();

  const chart = {
    usersByRole: { labels: usersByRole.map((r) => r._id), values: usersByRole.map((r) => r.value) },
    opportunitiesByType: { labels: oppsByType.map((r) => r._id), values: oppsByType.map((r) => r.value) },
    trend: { labels: trend.map((r) => r._id), values: trend.map((r) => r.value) }
  };

  res.render('admin/dashboard', {
    title: 'Admin dashboard',
    chart,
    moderation: oppsByStatus,
    recentActivity,
    pendingQueue,
    announcements,
    stats: {
      totalUsers,
      totalApplications,
      openOpportunities,
      pendingTotal,
      newFeedback: feedbackCount
    },
    roleBreakdown: usersByRole,
    pager: buildPageMeta({ page, limit, total: pendingTotal })
  });
});