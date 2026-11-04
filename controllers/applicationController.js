/**
 * controllers/applicationController.js
 * ---------------------------------------------------------------------------
 * FR-13 : the student's "My applications" tracking screen.
 *
 * Shows the company, the type, the applied date, a status badge, the full
 * `statusHistory` timeline (bonus feature 9) and offers the withdrawal action.
 */
'use strict';

const Application = require('../models/Application');
const { APPLICATION_STATUSES } = require('../models/Application');
const asyncHandler = require('../utils/asyncHandler');
const logActivity = require('../utils/logActivity');
const { success, warning, error } = require('../utils/flash');
const { getPagination, buildPageMeta } = require('../utils/pagination');
const { withdrawApplication } = require('../services/applicationService');
const dashboardService = require('../services/dashboardService');
const { STATUS_LABEL } = require('../services/applicationService');

// ===========================================================================
// GET /student/applications
// ===========================================================================
exports.showMyApplications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, { defaultLimit: 10, maxLimit: 50 });

  const filter = { student: req.user._id };
  const status = String(req.query.status || '').trim();
  if (APPLICATION_STATUSES.includes(status)) filter.status = status;

  const query = Application.find(filter)
    .populate({
      path: 'opportunity',
      select: 'title type location mode deadline company companyNameCopy companyProfile status',
      populate: { path: 'companyProfile', select: 'companyName logo verified' }
    })
    .sort({ appliedAt: -1 })
    .skip(skip)
    .limit(limit);

  const [total, applications, statusStats] = await Promise.all([
    Application.countDocuments(filter),
    query.lean({ virtuals: true }),
    dashboardService.applicationsByStatusForStudent(req.user._id)
  ]);

  // Count per status for the filter tabs (independent of the active filter).
  const counts = Object.fromEntries(statusStats.rows.map((r) => [r._id, r.value]));

  res.render('student/applications', {
    title: 'My applications',
    applications,
    counts,
    totalAll: statusStats.total,
    activeStatus: status,
    statusLabel: STATUS_LABEL,
    statuses: APPLICATION_STATUSES,
    pager: buildPageMeta({ page, limit, total })
  });
});

// ===========================================================================
// GET /student/applications/:id   - detail + status timeline
// ===========================================================================
exports.showMyApplication = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id).populate({
    path: 'opportunity',
    populate: { path: 'companyProfile' }
  });

  if (!application) {
    const err = new Error('That application could not be found.');
    err.status = 404;
    throw err;
  }

  // A student may only open their own application.
  if (application.student.toString() !== req.user._id.toString()) {
    const err = new Error('You can only view your own applications.');
    err.status = 403;
    throw err;
  }

  res.render('student/applicationDetail', {
    title: 'Application details',
    application,
    opportunity: application.opportunity,
    company: application.opportunity ? application.opportunity.companyProfile : null
  });
});

// ===========================================================================
// POST /student/applications/:id/withdraw   (bonus feature 9)
// ===========================================================================
exports.withdraw = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id);

  if (!application) {
    error(req, 'That application could not be found.');
    return res.redirect('/student/applications');
  }
  if (application.student.toString() !== req.user._id.toString()) {
    error(req, 'You can only withdraw your own applications.');
    return res.redirect('/student/applications');
  }
  if (application.status === 'withdrawn') {
    warning(req, 'This application has already been withdrawn.');
    return res.redirect(`/student/applications/${application._id}`);
  }
  if (application.status === 'accepted') {
    warning(req, 'You have already been accepted - please contact the company before withdrawing.');
    return res.redirect(`/student/applications/${application._id}`);
  }

  await withdrawApplication(application, { changedBy: req.user._id });
  await logActivity(req, {
    action: 'application_withdrawn',
    entity: 'application',
    entityId: application._id,
    details: 'Withdrawn by the student'
  });

  success(req, 'Your application has been withdrawn.');
  res.redirect(`/student/applications/${application._id}`);
});