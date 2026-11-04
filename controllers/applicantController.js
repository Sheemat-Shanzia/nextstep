/**
 * controllers/applicantController.js
 * ---------------------------------------------------------------------------
 * FR-18 : applicant management for companies.
 *
 *   - list every applicant for one opportunity (filter by status, sort by CGPA)
 *   - open one applicant: profile, skills, CGPA, CV, documents
 *   - change / bulk-change the status with a note (student is notified)
 *   - export the applicant list to CSV
 */
'use strict';

const { Parser } = require('json2csv');

const Application = require('../models/Application');
const Opportunity = require('../models/Opportunity');
const StudentProfile = require('../models/StudentProfile');
const asyncHandler = require('../utils/asyncHandler');
const logActivity = require('../utils/logActivity');
const { success, error, warning, backTo } = require('../utils/flash');
const { getPagination, buildPageMeta } = require('../utils/pagination');
const applicationService = require('../services/applicationService');
const dashboardService = require('../services/dashboardService');
const { formatDate } = require('../utils/format');

/** Guard: the opportunity must belong to the signed-in company. */
async function ownOpportunity(req) {
  const opportunity = await Opportunity.findById(req.params.id).populate('companyProfile');
  if (!opportunity) {
    const err = new Error('That opportunity could not be found.');
    err.status = 404;
    throw err;
  }
  if (opportunity.company.toString() !== req.user._id.toString()) {
    const err = new Error('You can only manage applicants for your own opportunities.');
    err.status = 403;
    throw err;
  }
  return opportunity;
}

// ===========================================================================
// GET /company/opportunities/:id/applicants
// ===========================================================================
exports.showApplicants = asyncHandler(async (req, res) => {
  const opportunity = await ownOpportunity(req);
  const { page, limit, skip } = getPagination(req.query, { defaultLimit: 10, maxLimit: 100 });

  const filter = { opportunity: opportunity._id };

  const status = String(req.query.status || '').trim();
  if (req.query.status && status && status !== 'all') {
    if (applicationService.STATUS_LABEL[status] === undefined && !['active', 'closed'].includes(status)) {
      warning(req, 'Unknown status filter - showing every applicant.');
    } else {
      filter.status = status;
    }
  }

  const sort = String(req.query.sort || 'newest');
  const sortArg =
    sort === 'cgpa' ? { student: 1 } : sort === 'oldest' ? { appliedAt: 1 } : { appliedAt: -1 };

  const query = Application.find(filter)
    .populate('student', 'name email createdAt')
    .populate('opportunity', 'title type deadline')
    .sort(sortArg)
    .skip(skip)
    .limit(limit);

  const [total, applications, stats] = await Promise.all([
    Application.countDocuments(filter),
    query.lean({ virtuals: true }),
    dashboardService.applicantsByStatusForOpportunity(opportunity._id)
  ]);

  // Attach the student profile (skills, CGPA, university) in ONE query.
  const profiles = await StudentProfile.find({
    user: { $in: applications.map((a) => a.student ? a.student._id : null).filter(Boolean) }
  }).lean();

  const profileByUser = new Map(profiles.map((p) => [String(p.user), p]));
  const withProfiles = applications.map((a) => ({
    ...a,
    profile: profileByUser.get(String(a.student ? a.student._id : '')) || null
  }));

  res.render('company/applicants', {
    title: `Applicants - ${opportunity.title}`,
    opportunity,
    company: opportunity.companyProfile,
    applications: withProfiles,
    counts: Object.fromEntries(stats.rows.map((r) => [r._id, r.value])),
    totalApplicants: stats.total,
    activeStatus: status,
    sort,
    statusLabel: applicationService.STATUS_LABEL,
    statuses: applicationService.COMPANY_SETTABLE,
    pager: buildPageMeta({ page, limit, total })
  });
});

// ===========================================================================
// GET /company/applications  - every application across all opportunities
// ===========================================================================
exports.showAllApplications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, { defaultLimit: 15, maxLimit: 100 });

  const filter = { company: req.user._id };
  const status = String(req.query.status || '').trim();
  if (applicationService.STATUS_LABEL[status]) filter.status = status;

  const [total, applications] = await Promise.all([
    Application.countDocuments(filter),
    Application.find(filter)
      .populate('student', 'name email')
      .populate('opportunity', 'title type deadline companyNameCopy')
      .sort({ appliedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true })
  ]);

  res.render('company/allApplications', {
    title: 'All applications',
    applications,
    activeStatus: status,
    statuses: applicationService.STATUS_LABEL,
    pager: buildPageMeta({ page, limit, total })
  });
});

// ===========================================================================
// GET /company/applications/:id  - a single applicant (FR-18)
// ===========================================================================
exports.showApplicant = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id)
    .populate('student', 'name email createdAt lastLogin')
    .populate({ path: 'opportunity', populate: { path: 'companyProfile' } });

  if (!application) {
    const err = new Error('That application could not be found.');
    err.status = 404;
    throw err;
  }
  if (application.company.toString() !== req.user._id.toString()) {
    const err = new Error('You can only review applicants for your own opportunities.');
    err.status = 403;
    throw err;
  }

  const profile = await StudentProfile.findOne({ user: application.student._id });
  const reviews = await require('../models/Review').find({ company: req.user._id, student: application.student._id });

  res.render('company/applicantDetail', {
    title: `Applicant - ${application.student.name}`,
    application,
    opportunity: application.opportunity,
    company: application.opportunity ? application.opportunity.companyProfile : null,
    profile,
    myReview: reviews[0] || null,
    statusLabel: applicationService.STATUS_LABEL,
    statuses: applicationService.COMPANY_SETTABLE
  });
});

// ===========================================================================
// POST /company/applications/:id/status   - FR-18
// ===========================================================================
exports.updateStatus = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id);

  if (!application) {
    error(req, 'That application could not be found.');
    return res.redirect('/company/applications');
  }
  if (application.company.toString() !== req.user._id.toString()) {
    error(req, 'You can only update applications for your own opportunities.');
    return res.redirect('/company/applications');
  }

  const status = String(req.body.status || '');
  if (!applicationService.COMPANY_SETTABLE.includes(status)) {
    error(req, 'That status is not valid.');
    return res.redirect(`/company/applications/${application._id}`);
  }

  const note = String(req.body.note || '').trim();
  const previous = application.status;

  await applicationService.changeStatus(application, { status, note, changedBy: req.user._id });

  await logActivity(req, {
    action: 'application_status_changed',
    entity: 'application',
    entityId: application._id,
    details: `${previous} -> ${status}${note ? ` (note: ${note.slice(0, 80)})` : ''}`
  });

  success(req, `Application marked as "${applicationService.STATUS_LABEL[status]}". The student has been notified.`);
  res.redirect(`/company/applications/${application._id}`);
});

// ===========================================================================
// POST /company/applications/bulk-status
// ===========================================================================
exports.bulkStatus = asyncHandler(async (req, res) => {
  const ids = [].concat(req.body.applicationId || []).filter(Boolean);
  const status = String(req.body.status || '');

  if (!ids.length) {
    warning(req, 'No applications were selected.');
    return res.redirect(backTo(req));
  }
  if (!applicationService.COMPANY_SETTABLE.includes(status)) {
    error(req, 'That status is not valid.');
    return res.redirect(backTo(req));
  }

  // Only touch applications that really belong to this company.
  const owned = await Application.find({ _id: { $in: ids }, company: req.user._id });
  const ownedIds = owned.map((a) => a._id);
  await applicationService.bulkChangeStatus(ownedIds, { status, note: String(req.body.note || '').trim(), changedBy: req.user._id });

  await logActivity(req, {
    action: 'application_bulk_status',
    entity: 'application',
    details: `${ownedIds.length} application(s) -> ${status}`
  });

  success(req, `${ownedIds.length} application${ownedIds.length === 1 ? '' : 's'} updated to "${applicationService.STATUS_LABEL[status]}".`);
  res.redirect(backTo(req));
});

// ===========================================================================
// GET /company/applications/export.csv   - bonus feature 12
// ===========================================================================
exports.exportApplicants = asyncHandler(async (req, res) => {
  const filter = { company: req.user._id };
  if (req.query.opportunityId) filter.opportunity = req.query.opportunityId;

  const applications = await Application.find(filter)
    .populate('student', 'name email')
    .populate('opportunity', 'title type location deadline')
    .sort({ appliedAt: -1 })
    .lean();

  if (!applications.length) {
    warning(req, 'There are no applications to export yet.');
    return res.redirect('/company/applications');
  }

  const studentIds = applications.map((a) => a.student ? a.student._id : null).filter(Boolean);
  const profiles = await StudentProfile.find({ user: { $in: studentIds } }).lean();
  const profileByUser = new Map(profiles.map((p) => [String(p.user), p]));

  const rows = applications.map((a) => {
    const profile = a.student ? profileByUser.get(String(a.student._id)) : null;
    return {
      studentName: a.student ? a.student.name : 'Unknown',
      email: a.student ? a.student.email : '',
      university: profile ? profile.university : '',
      degree: profile ? profile.degree : '',
      cgpa: profile && profile.cgpa !== null ? profile.cgpa : '',
      skills: profile ? profile.skills.map((s) => `${s.name}(${s.level})`).join(' | ') : '',
      opportunity: a.opportunity ? a.opportunity.title : '(removed)',
      type: a.opportunity ? a.opportunity.type : '',
      status: a.status,
      appliedAt: formatDate(a.appliedAt),
      cvFile: a.cvPath ? a.cvOriginalName || 'cv' : ''
    };
  });

  const parser = new Parser({ fields: Object.keys(rows[0]) });
  const csv = parser.parse(rows);

  await logActivity(req, {
    action: 'csv_export',
    entity: 'application',
    details: `Exported ${rows.length} applicant row(s) to CSV`
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="isms-applicants.csv"');
  return res.send(csv);
});