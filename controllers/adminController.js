/**
 * controllers/adminController.js
 * ---------------------------------------------------------------------------
 * FR-19 to FR-23 : the administrator portal.
 *
 *   - user management (search, filter, suspend, delete, change role)
 *   - opportunity moderation queue (approve / reject with a reason)
 *   - company verification
 *   - analytics, activity log, feedback inbox and announcements
 *   - CSV exports
 *
 * Safeguards: the last remaining administrator can neither be deleted,
 * suspended nor demoted.
 */
'use strict';

const { Parser } = require('json2csv');

const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const CompanyProfile = require('../models/CompanyProfile');
const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');
const Review = require('../models/Review');
const Notification = require('../models/Notification');
const Bookmark = require('../models/Bookmark');
const ActivityLog = require('../models/ActivityLog');
const Feedback = require('../models/Feedback');
const Announcement = require('../models/Announcement');

const asyncHandler = require('../utils/asyncHandler');
const logActivity = require('../utils/logActivity');
const { success, error, warning, info, backTo } = require('../utils/flash');
const { getPagination, buildPageMeta, queryString } = require('../utils/pagination');
const { escapeRegex } = require('../utils/opportunityQuery');
const moderationService = require('../services/moderationService');
const dashboardService = require('../services/dashboardService');
const { notify } = require('../utils/notify');
const { formatDate } = require('../utils/format');

/** How many active administrators exist right now. */
async function activeAdminCount() {
  return User.countDocuments({ role: 'admin', status: 'active' });
}

// ===========================================================================
// FR-19 : user list
// ===========================================================================
exports.showUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, { defaultLimit: 15, maxLimit: 100 });

  const filter = {};
  const role = String(req.query.role || '').trim();
  const status = String(req.query.status || '').trim();
  const search = String(req.query.q || '').trim();

  if (['student', 'company', 'admin'].includes(role)) filter.role = role;
  if (['active', 'suspended', 'pending'].includes(status)) filter.status = status;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }

  const [total, users, counts] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.aggregate([{ $group: { _id: '$role', value: { $sum: 1 } } }])
  ]);

  res.render('admin/users', {
    title: 'Users',
    users,
    roleCounts: Object.fromEntries(counts.map((c) => [c._id, c.value])),
    totalUsers: counts.reduce((s, c) => s + c.value, 0),
    activeRole: role,
    activeStatus: status,
    search,
    pager: buildPageMeta({ page, limit, total })
  });
});

// ===========================================================================
// FR-20 : user detail
// ===========================================================================
exports.showUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    const err = new Error('That user could not be found.');
    err.status = 404;
    throw err;
  }

  const [studentProfile, companyProfile, opportunities, applications, recentActivity, isLastAdmin] = await Promise.all([
    StudentProfile.findOne({ user: user._id }),
    CompanyProfile.findOne({ user: user._id }),
    Opportunity.find({ company: user._id }).sort({ createdAt: -1 }).lean({ virtuals: true }),
    Application.find({ student: user._id }).sort({ appliedAt: -1 }).limit(10).populate('opportunity', 'title type').lean(),
    ActivityLog.find({ user: user._id }).sort({ createdAt: -1 }).limit(10).lean(),
    user.role === 'admin' && user.status === 'active' ? (await activeAdminCount()) <= 1 : false
  ]);

  res.render('admin/userDetail', {
    title: user.name,
    user,
    studentProfile,
    companyProfile,
    opportunities,
    applications,
    recentActivity,
    isLastAdmin,
    adminCount: await activeAdminCount()
  });
});

// ===========================================================================
// FR-20 : suspend / activate / change role / delete
// ===========================================================================
exports.updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    error(req, 'That user could not be found.');
    return res.redirect('/admin/users');
  }

  const action = String(req.body.action || '');
  const backTo = req.body.returnTo || `/admin/users/${user._id}`;
  const isLastAdmin = user.role === 'admin' && user.status === 'active' && (await activeAdminCount()) <= 1;

  // ---- suspend / activate --------------------------------------------------
  if (action === 'suspend') {
    if (user._id.toString() === req.user._id.toString()) {
      error(req, 'You cannot suspend your own account.');
      return res.redirect(backTo);
    }
    if (isLastAdmin) {
      error(req, 'The last administrator account cannot be suspended.');
      return res.redirect(backTo);
    }
    user.status = 'suspended';
    await user.save({ validateBeforeSave: false });
    await notify(user._id, {
      title: 'Account suspended',
      message: 'Your ISMS account has been suspended. Please contact the administrator.',
      type: 'account',
      link: '/'
    });
    await logActivity(req, { action: 'user_suspended', entity: 'user', entityId: user._id, details: user.email });
    success(req, `${user.name} has been suspended.`);
    return res.redirect(backTo);
  }

  if (action === 'activate') {
    user.status = 'active';
    await user.save({ validateBeforeSave: false });
    await notify(user._id, {
      title: 'Account reactivated',
      message: 'Your ISMS account is active again. Welcome back!',
      type: 'account',
      link: '/'
    });
    await logActivity(req, { action: 'user_activated', entity: 'user', entityId: user._id, details: user.email });
    success(req, `${user.name} has been reactivated.`);
    return res.redirect(backTo);
  }

  // ---- change role --------------------------------------------------------
  if (action === 'role') {
    const newRole = String(req.body.role || '');
    if (!['student', 'company', 'admin'].includes(newRole)) {
      error(req, 'That role is not valid.');
      return res.redirect(backTo);
    }
    if (user.role === 'admin' && newRole !== 'admin' && isLastAdmin) {
      error(req, 'The last administrator account cannot be demoted.');
      return res.redirect(backTo);
    }

    const previousRole = user.role;
    user.role = newRole;
    await user.save({ validateBeforeSave: false });

    // Keep the profile collections consistent with the new role.
    if (newRole === 'company' && !(await CompanyProfile.findOne({ user: user._id }))) {
      await CompanyProfile.create({ user: user._id, companyName: user.name });
    }
    if (newRole === 'student' && !(await StudentProfile.findOne({ user: user._id }))) {
      await StudentProfile.create({ user: user._id });
    }

    await notify(user._id, {
      title: 'Role updated',
      message: `Your account role is now "${newRole}". Some areas of the platform may no longer be available to you.`,
      type: 'account',
      link: '/'
    });
    await logActivity(req, {
      action: 'user_role_changed',
      entity: 'user',
      entityId: user._id,
      details: `${previousRole} -> ${newRole} (${user.email})`
    });
    success(req, `${user.name} is now a ${newRole}.`);
    return res.redirect(backTo);
  }

  // ---- delete -------------------------------------------------------------
  if (action === 'delete') {
    if (user._id.toString() === req.user._id.toString()) {
      error(req, 'You cannot delete your own account.');
      return res.redirect(backTo);
    }
    if (isLastAdmin) {
      error(req, 'The last administrator account cannot be deleted.');
      return res.redirect(backTo);
    }

    const name = user.name;
    // Graceful cleanup - linked records are removed or detached so the
    // database never keeps dangling references.
    await Promise.all([
      Application.deleteMany({ $or: [{ student: user._id }, { company: user._id }] }),
      Opportunity.deleteMany({ company: user._id }),
      Bookmark.deleteMany({ student: user._id }),
      Review.deleteMany({ $or: [{ student: user._id }, { company: user._id }] }),
      Notification.deleteMany({ user: user._id }),
      StudentProfile.deleteOne({ user: user._id }),
      CompanyProfile.deleteOne({ user: user._id })
    ]);
    await user.deleteOne();

    await logActivity(req, { action: 'user_deleted', entity: 'user', details: `${name} (${user.email})` });
    success(req, `${name} and all of their linked records have been deleted.`);
    return res.redirect('/admin/users');
  }

  warning(req, 'Unknown action.');
  return res.redirect(backTo);
});

// ===========================================================================
// FR-19 : bulk user action
// ===========================================================================
exports.bulkUserAction = asyncHandler(async (req, res) => {
  const ids = [].concat(req.body.userId || []).filter(Boolean);
  const action = String(req.body.bulkAction || '');

  if (!ids.length) {
    warning(req, 'No users were selected.');
    return res.redirect('/admin/users');
  }

  let query = { _id: { $in: ids } };
  // Never let an admin bulk-suspend, demote or delete themselves or the last admin.
  if (action !== 'activate') query._id = { $in: ids.filter((id) => id !== req.user._id.toString()) };

  if (action === 'suspend') {
    const protectedIds = await protectedAdminIds(ids);
    query._id = { $in: query._id.$in.filter((id) => !protectedIds.has(id)) };
  }

  if (action === 'suspend') {
    const count = await User.updateMany(query, { status: 'suspended' });
    await logActivity(req, { action: 'users_suspended', entity: 'user', details: `${count.modifiedCount} user(s)` });
    success(req, `${count.modifiedCount} account(s) suspended.`);
  } else if (action === 'activate') {
    const count = await User.updateMany(query, { status: 'active' });
    await logActivity(req, { action: 'users_activated', entity: 'user', details: `${count.modifiedCount} user(s)` });
    success(req, `${count.modifiedCount} account(s) activated.`);
  } else if (action === 'delete') {
    const users = await User.find(query);
    for (const u of users) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.all([
        Application.deleteMany({ $or: [{ student: u._id }, { company: u._id }] }),
        Opportunity.deleteMany({ company: u._id }),
        Bookmark.deleteMany({ student: u._id }),
        Review.deleteMany({ $or: [{ student: u._id }, { company: u._id }] }),
        Notification.deleteMany({ user: u._id }),
        StudentProfile.deleteOne({ user: u._id }),
        CompanyProfile.deleteOne({ user: u._id })
      ]);
      // eslint-disable-next-line no-await-in-loop
      await u.deleteOne();
    }
    await logActivity(req, { action: 'users_deleted', entity: 'user', details: `${users.length} user(s)` });
    success(req, `${users.length} account(s) deleted.`);
  } else {
    warning(req, 'Unknown bulk action.');
  }

  return res.redirect(req.body.returnTo || '/admin/users');
});

/** Ids of administrators that must never be touched (the last one). */
async function protectedAdminIds(ids) {
  const admins = await User.find({ _id: { $in: ids }, role: 'admin', status: 'active' });
  if (admins.length === 0) return new Set();
  const total = await activeAdminCount();
  if (total > admins.length) return new Set();
  // All remaining admins are in this selection -> protect them all.
  return new Set(admins.map((a) => a._id.toString()));
}

// ===========================================================================
// FR-21 : moderation queue
// ===========================================================================
exports.showOpportunities = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, { defaultLimit: 15, maxLimit: 100 });

  const filter = {};
  const status = String(req.query.status || '').trim();
  const search = String(req.query.q || '').trim();
  const type = String(req.query.type || '').trim();

  if (['pending', 'approved', 'rejected'].includes(status)) filter.status = status;
  if (['internship', 'scholarship'].includes(type)) filter.type = type;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ title: rx }, { companyNameCopy: rx }, { location: rx }];
  }

  const [total, opportunities, statusCounts] = await Promise.all([
    Opportunity.countDocuments(filter),
    Opportunity.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('reviewedBy', 'name')
      .lean({ virtuals: true }),
    Opportunity.aggregate([{ $group: { _id: '$status', value: { $sum: 1 } } }])
  ]);

  const applicantRows = await Application.aggregate([
    { $group: { _id: '$opportunity', value: { $sum: 1 } } }
  ]);
  const applicantCount = Object.fromEntries(applicantRows.map((r) => [String(r._id), r.value]));

  res.render('admin/opportunities', {
    title: 'Opportunity moderation',
    opportunities: opportunities.map((o) => ({ ...o, applicantCount: applicantCount[String(o._id)] || 0 })),
    counts: Object.fromEntries(statusCounts.map((c) => [c._id, c.value])),
    totalOpportunities: statusCounts.reduce((s, c) => s + c.value, 0),
    activeStatus: status,
    activeType: type,
    search,
    pager: buildPageMeta({ page, limit, total })
  });
});

/** FR-21 : approve / reject a single opportunity. */
exports.moderateOpportunity = asyncHandler(async (req, res) => {
  const opportunity = await Opportunity.findById(req.params.id);
  if (!opportunity) {
    error(req, 'That opportunity could not be found.');
    return res.redirect('/admin/opportunities');
  }

  const action = String(req.body.action || '');
  const reason = String(req.body.reason || '').trim();
  const backTo = req.body.returnTo || `/admin/opportunities/${opportunity._id}`;

  try {
    if (action === 'approve') {
      await moderationService.approve(opportunity, { adminId: req.user._id });
      await logActivity(req, { action: 'opportunity_approved', entity: 'opportunity', entityId: opportunity._id, details: opportunity.title });
      success(req, `"${opportunity.title}" has been approved and is now visible to students.`);
    } else if (action === 'reject') {
      await moderationService.reject(opportunity, { adminId: req.user._id, reason });
      await logActivity(req, {
        action: 'opportunity_rejected',
        entity: 'opportunity',
        entityId: opportunity._id,
        details: `"${opportunity.title}" - reason: ${reason.slice(0, 80)}`
      });
      success(req, `"${opportunity.title}" has been rejected. The company was notified.`);
    } else if (action === 'pending') {
      await moderationService.resetToPending(opportunity, { adminId: req.user._id });
      await logActivity(req, { action: 'opportunity_requeued', entity: 'opportunity', entityId: opportunity._id, details: opportunity.title });
      info(req, `"${opportunity.title}" was moved back to the moderation queue.`);
    } else {
      warning(req, 'Unknown moderation action.');
    }
  } catch (err) {
    error(req, err.message);
  }

  return res.redirect(backTo);
});

/** FR-22 : bulk approve / reject / delete. */
exports.bulkModerate = asyncHandler(async (req, res) => {
  const ids = [].concat(req.body.opportunityId || []).filter(Boolean);
  const action = String(req.body.bulkAction || '');
  const reason = String(req.body.reason || '').trim();

  if (!ids.length) {
    warning(req, 'No opportunities were selected.');
    return res.redirect('/admin/opportunities');
  }

  if ((action === 'reject') && !reason) {
    error(req, 'A rejection reason is required for bulk rejection.');
    return res.redirect('/admin/opportunities');
  }

  const { count, failed } = await moderationService.bulkAction(ids, action, { adminId: req.user._id, reason });

  await logActivity(req, { action: `bulk_opportunity_${action}`, entity: 'opportunity', details: `${count} opportunity(s)` });

  success(req, `${count} opportunity(s) processed${failed.length ? `, ${failed.length} failed` : ''}.`);
  return res.redirect('/admin/opportunities');
});

// ===========================================================================
// FR-23 : company verification
// ===========================================================================
exports.toggleVerification = asyncHandler(async (req, res) => {
  const profile = await CompanyProfile.findById(req.params.id);
  if (!profile) {
    error(req, 'That company profile could not be found.');
    return res.redirect(backTo(req));
  }

  profile.verified = !profile.verified;
  await profile.save();

  await notify(profile.user, {
    title: profile.verified ? 'Company verified' : 'Verification removed',
    message: profile.verified
      ? `Your company "${profile.companyName}" is now verified.`
      : `The verified badge for "${profile.companyName}" has been removed.`,
    type: 'account',
    link: '/company/profile'
  });

  await logActivity(req, {
    action: profile.verified ? 'company_verified' : 'company_unverified',
    entity: 'companyprofile',
    entityId: profile._id,
    details: profile.companyName
  });

  success(req, `"${profile.companyName}" is ${profile.verified ? 'now verified' : 'no longer verified'}.`);
  return res.redirect(req.body.returnTo || '/admin/opportunities');
});

// ===========================================================================
// FR-24 / bonus 10 : analytics
// ===========================================================================
exports.showAnalytics = asyncHandler(async (req, res) => {
  const [
    usersByRole,
    usersGrowthRows,
    oppsByType,
    oppsByCategory,
    oppsByStatus,
    trend,
    topSkillsList,
    openingsByCategory,
    companies
  ] = await Promise.all([
    dashboardService.usersByRole(),
    dashboardService.usersGrowth(6),
    dashboardService.opportunitiesByType(),
    dashboardService.opportunitiesByCategory(10),
    dashboardService.opportunitiesByStatus(),
    dashboardService.applicationsTrend({ months: 6 }),
    dashboardService.topSkills(10),
    dashboardService.openingsByCategory(8),
    CompanyProfile.find().sort({ createdAt: -1 }).select('companyName verified industry user createdAt').limit(12).lean()
  ]);

  // Application status distribution across the whole platform.
  const applicationStatusRows = await Application.aggregate([
    { $group: { _id: '$status', value: { $sum: 1 } } },
    { $sort: { value: -1 } }
  ]);
  const applicationStatus = require('../models/Application').APPLICATION_STATUSES.map((s) => ({
    _id: s,
    value: (applicationStatusRows.find((r) => r._id === s) || {}).value || 0
  }));

  const totals = {
    users: await User.countDocuments({}),
    students: await User.countDocuments({ role: 'student' }),
    companies: await User.countDocuments({ role: 'company' }),
    opportunities: await Opportunity.countDocuments({}),
    applications: await Application.countDocuments({}),
    openOpportunities: await Opportunity.countDocuments({ status: 'approved', isActive: true, deadline: { $gt: new Date() } })
  };

  res.render('admin/analytics', {
    title: 'Analytics',
    chart: {
      usersByRole,
      usersGrowth: usersGrowthRows,
      opportunitiesByType: oppsByType,
      opportunitiesByCategory: oppsByCategory,
      applicationsByStatus: applicationStatus,
      trend,
      topSkills: topSkillsList,
      openingsByCategory
    },
    moderation: oppsByStatus,
    totals,
    companies
  });
});

// ===========================================================================
// Bonus 11 : activity log viewer
// ===========================================================================
exports.showActivityLog = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, { defaultLimit: 25, maxLimit: 200 });

  const filter = {};
  const action = String(req.query.action || '').trim();
  const role = String(req.query.role || '').trim();
  const search = String(req.query.q || '').trim();

  if (action) filter.action = action;
  if (['student', 'company', 'admin'].includes(role)) filter.userRole = role;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ details: rx }, { userName: rx }, { action: rx }];
  }

  const [total, logs, distinctActions] = await Promise.all([
    ActivityLog.countDocuments(filter),
    ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('user', 'name role status').lean(),
    ActivityLog.distinct('action')
  ]);

  res.render('admin/activityLog', {
    title: 'Activity log',
    logs,
    actions: distinctActions.sort(),
    activeAction: action,
    activeRole: role,
    search,
    pager: buildPageMeta({ page, limit, total })
  });
});

// ===========================================================================
// Bonus 12 : CSV exports
// ===========================================================================
exports.exportUsers = asyncHandler(async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).lean();

  const rows = users.map((u) => ({
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    emailVerified: u.isEmailVerified ? 'yes' : 'no',
    registered: formatDate(u.createdAt),
    lastLogin: u.lastLogin ? formatDate(u.lastLogin) : 'never'
  }));

  if (!rows.length) {
    warning(req, 'There are no users to export.');
    return res.redirect('/admin/users');
  }

  const csv = new Parser({ fields: Object.keys(rows[0]) }).parse(rows);
  await logActivity(req, { action: 'csv_export', entity: 'user', details: `Exported ${rows.length} user(s)` });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="isms-users.csv"');
  return res.send(csv);
});

exports.exportOpportunities = asyncHandler(async (req, res) => {
  const opportunities = await Opportunity.find().sort({ createdAt: -1 }).lean();

  const rows = opportunities.map((o) => ({
    title: o.title,
    type: o.type,
    company: o.companyNameCopy,
    location: o.location,
    mode: o.mode,
    category: o.category,
    stipend: o.stipend,
    openings: o.openings,
    status: o.status,
    isActive: o.isActive ? 'yes' : 'no',
    deadline: formatDate(o.deadline),
    views: o.views,
    requiredSkills: (o.requiredSkills || []).join(' | '),
    created: formatDate(o.createdAt)
  }));

  if (!rows.length) {
    warning(req, 'There are no opportunities to export.');
    return res.redirect('/admin/opportunities');
  }

  const csv = new Parser({ fields: Object.keys(rows[0]) }).parse(rows);
  await logActivity(req, { action: 'csv_export', entity: 'opportunity', details: `Exported ${rows.length} opportunity(s)` });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="isms-opportunities.csv"');
  return res.send(csv);
});

// ===========================================================================
// Bonus 19 : feedback inbox
// ===========================================================================
exports.showFeedback = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, { defaultLimit: 20, maxLimit: 100 });

  const filter = {};
  const status = String(req.query.status || '').trim();
  if (['new', 'seen', 'resolved'].includes(status)) filter.status = status;

  const [total, feedbacks, counts] = await Promise.all([
    Feedback.countDocuments(filter),
    Feedback.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Feedback.aggregate([{ $group: { _id: '$status', value: { $sum: 1 } } }])
  ]);

  res.render('admin/feedback', {
    title: 'Feedback inbox',
    feedbacks,
    counts: Object.fromEntries(counts.map((c) => [c._id, c.value])),
    activeStatus: status,
    pager: buildPageMeta({ page, limit, total })
  });
});

exports.updateFeedback = asyncHandler(async (req, res) => {
  const feedback = await Feedback.findById(req.params.id);
  if (!feedback) {
    error(req, 'That message could not be found.');
    return res.redirect('/admin/feedback');
  }

  const action = String(req.body.action || '');
  if (action === 'delete') {
    await feedback.deleteOne();
    await logActivity(req, { action: 'feedback_deleted', entity: 'feedback', entityId: feedback._id, details: feedback.email });
    success(req, 'Message deleted.');
  } else if (['new', 'seen', 'resolved'].includes(action)) {
    feedback.status = action;
    await feedback.save();
    await logActivity(req, { action: 'feedback_status', entity: 'feedback', entityId: feedback._id, details: `${feedback.status}` });
    success(req, `Message marked as ${action}.`);
  }

  return res.redirect('/admin/feedback');
});

// ===========================================================================
// Bonus 20 : announcements
// ===========================================================================
exports.showAnnouncements = asyncHandler(async (req, res) => {
  const announcements = await Announcement.find().sort({ createdAt: -1 }).populate('createdBy', 'name').lean();

  res.render('admin/announcements', {
    title: 'Announcements',
    announcements,
    audiences: ['student', 'company', 'admin'],
    levels: ['info', 'success', 'warning', 'danger']
  });
});

exports.createAnnouncement = asyncHandler(async (req, res) => {
  const audience = [].concat(req.body.audience || []).filter(Boolean);
  const title = String(req.body.title || '').trim();
  const body = String(req.body.body || '').trim();

  if (title.length < 3 || body.length < 5) {
    error(req, 'Please provide a title (3+ characters) and a message (5+ characters).');
    return res.redirect('/admin/announcements');
  }

  const announcement = await Announcement.create({
    title,
    body,
    audience: audience.length ? audience : ['student', 'company'],
    level: ['info', 'success', 'warning', 'danger'].includes(req.body.level) ? req.body.level : 'info',
    isActive: true,
    createdBy: req.user._id,
    createdByName: req.user.name,
    expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null
  });

  // Push an in-app notification to the selected roles.
  const targets = audience.length ? audience : ['student', 'company'];
  const users = await User.find({ role: { $in: targets }, status: 'active' }).select('_id');
  await Notification.insertMany(
    users.map((u) => ({
      user: u._id,
      title: `Announcement: ${announcement.title}`,
      message: announcement.body.slice(0, 400),
      type: 'announcement',
      link: '/notifications'
    }))
  ).catch(() => []);

  await logActivity(req, { action: 'announcement_created', entity: 'announcement', entityId: announcement._id, details: title });
  success(req, `Announcement published to ${users.length} account(s).`);
  res.redirect('/admin/announcements');
});

exports.updateAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id);
  if (!announcement) {
    error(req, 'That announcement could not be found.');
    return res.redirect('/admin/announcements');
  }

  const action = String(req.body.action || '');
  if (action === 'delete') {
    await announcement.deleteOne();
    await logActivity(req, { action: 'announcement_deleted', entity: 'announcement', entityId: announcement._id, details: announcement.title });
    success(req, 'Announcement deleted.');
  } else if (action === 'toggle') {
    announcement.isActive = !announcement.isActive;
    await announcement.save();
    success(req, announcement.isActive ? 'Announcement published.' : 'Announcement hidden.');
  }

  return res.redirect('/admin/announcements');
});