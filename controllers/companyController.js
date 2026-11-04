/**
 * controllers/companyController.js
 * ---------------------------------------------------------------------------
 * FR-14 to FR-17 : company profile, logo, opportunity CRUD and moderation
 * status visibility.
 *
 * Business rules:
 *   - a company can only edit / delete its OWN opportunities
 *   - every new or edited post goes back into the `pending` moderation queue
 *     so an administrator always reviews it (FR-21)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CompanyProfile = require('../models/CompanyProfile');
const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');
const Review = require('../models/Review');
const asyncHandler = require('../utils/asyncHandler');
const logActivity = require('../utils/logActivity');
const { success, error, warning, info } = require('../utils/flash');
const { getPagination, buildPageMeta } = require('../utils/pagination');
const { notify, refreshCompanyRating } = require('../utils/notify');
const { DIRS } = require('../config/multer');

/** Load (or create) the company profile of the signed-in company user. */
async function getOrCreateProfile(userId, fallbackName = 'My Company') {
  let profile = await CompanyProfile.findOne({ user: userId });
  if (!profile) profile = await CompanyProfile.create({ user: userId, companyName: fallbackName });
  return profile;
}

/** Delete a logo file from uploads/logos (best effort). */
function removeLogo(filename) {
  if (!filename) return;
  try {
    const target = path.join(DIRS.logos, path.basename(filename));
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch (err) {
    /* already gone */
  }
}

/**
 * Normalise the submitted form into an update object shared by
 * create + update.
 */
function opportunityPayload(body, profile) {
  const skills = String(body.requiredSkills || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 25);

  const tags = String(body.tags || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 15);

  return {
    companyProfile: profile._id,
    companyNameCopy: profile.companyName,
    title: String(body.title || '').trim(),
    type: body.type,
    description: String(body.description || '').trim(),
    requirements: String(body.requirements || '').trim(),
    location: String(body.location || '').trim(),
    mode: body.mode,
    duration: String(body.duration || '').trim(),
    stipend: Number(body.stipend || 0),
    openings: Number(body.openings || 1),
    category: String(body.category || 'General').trim(),
    deadline: body.deadline ? new Date(body.deadline) : undefined,
    requiredSkills: skills,
    minCgpa: Number(body.minCgpa || 0),
    tags
  };
}

// ===========================================================================
// Company profile (FR-14)
// ===========================================================================
exports.showCompanyProfile = asyncHandler(async (req, res) => {
  const profile = await getOrCreateProfile(req.user._id, req.user.name);
  const [reviews, stats] = await Promise.all([
    Review.find({ company: req.user._id }).sort({ createdAt: -1 }).limit(20).populate('student', 'name').lean(),
    Application.aggregate([
      { $match: { company: req.user._id } },
      { $group: { _id: '$status', value: { $sum: 1 } } },
      { $sort: { value: -1 } }
    ])
  ]);

  res.render('company/profile', {
    title: 'Company profile',
    profile,
    reviews,
    ratingBreakdown: Object.fromEntries(stats.map((s) => [s._id, s.value]))
  });
});

exports.updateCompanyProfile = asyncHandler(async (req, res) => {
  const profile = await getOrCreateProfile(req.user._id, req.user.name);
  const b = req.body;

  if (b.companyName) profile.companyName = String(b.companyName).trim();
  ['industry', 'website', 'location', 'description', 'contactPerson', 'contactPhone'].forEach((field) => {
    if (b[field] !== undefined) profile[field] = String(b[field]).trim();
  });
  if (b.size) profile.size = b.size;

  await profile.save();

  // Keep the denormalised company name on every opportunity up to date.
  if (b.companyName) {
    await Opportunity.updateMany({ company: req.user._id }, { $set: { companyNameCopy: profile.companyName } });
  }

  await logActivity(req, {
    action: 'company_profile_updated',
    entity: 'companyprofile',
    entityId: profile._id,
    details: `Company profile updated${profile.verified ? ' (verified)' : ''}`
  });

  success(req, 'Your company profile has been saved.');
  res.redirect('/company/profile');
});

exports.uploadLogo = asyncHandler(async (req, res) => {
  if (!req.file) {
    warning(req, 'No image was received. Please choose a JPG, PNG or PDF file.');
    return res.redirect('/company/profile');
  }
  if (!/^image\/(jpeg|png)$/.test(req.file.mimetype)) {
    // PDFs are accepted by the uploader for documents, but a logo should be
    // an image so it renders inside <img> tags.
    error(req, 'The logo must be a JPG or PNG image.');
    return res.redirect('/company/profile');
  }

  const profile = await getOrCreateProfile(req.user._id, req.user.name);
  const previous = profile.logo;

  profile.logo = req.file.filename;
  profile.logoOriginalName = req.file.originalname;
  profile.logoUploadedAt = new Date();
  await profile.save();

  if (previous && previous !== req.file.filename) removeLogo(previous);

  await logActivity(req, { action: 'logo_uploaded', entity: 'file', entityId: profile._id, details: req.file.originalname });
  success(req, 'Company logo updated.');
  res.redirect('/company/profile');
});

exports.deleteLogo = asyncHandler(async (req, res) => {
  const profile = await getOrCreateProfile(req.user._id, req.user.name);
  if (!profile.logo) {
    warning(req, 'You have not uploaded a logo yet.');
    return res.redirect('/company/profile');
  }
  removeLogo(profile.logo);
  profile.logo = '';
  profile.logoOriginalName = '';
  profile.logoUploadedAt = null;
  await profile.save();
  success(req, 'Company logo removed.');
  res.redirect('/company/profile');
});

// ===========================================================================
// Opportunity list (FR-16)
// ===========================================================================
exports.showOpportunities = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, { defaultLimit: 10, maxLimit: 50 });

  const filter = { company: req.user._id };
  const status = String(req.query.status || '').trim();
  if (['pending', 'approved', 'rejected'].includes(status)) filter.status = status;

  const [total, opportunities, counts] = await Promise.all([
    Opportunity.countDocuments(filter),
    Opportunity.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean({ virtuals: true }),
    Opportunity.aggregate([{ $match: { company: req.user._id } }, { $group: { _id: '$status', value: { $sum: 1 } } }])
  ]);

  // Applicant totals per opportunity, computed in one aggregation.
  const applicantRows = await Application.aggregate([
    { $match: { company: req.user._id } },
    { $group: { _id: '$opportunity', value: { $sum: 1 } } }
  ]);
  const applicantCount = Object.fromEntries(applicantRows.map((r) => [String(r._id), r.value]));

  res.render('company/opportunities', {
    title: 'My opportunities',
    opportunities: opportunities.map((o) => ({ ...o, applicantCount: applicantCount[String(o._id)] || 0 })),
    counts: Object.fromEntries(counts.map((c) => [c._id, c.value])),
    activeStatus: status,
    pager: buildPageMeta({ page, limit, total })
  });
});

// ===========================================================================
// Create opportunity (FR-15)
// ===========================================================================
exports.showNewOpportunity = asyncHandler(async (req, res) => {
  const profile = await getOrCreateProfile(req.user._id, req.user.name);
  res.render('company/opportunityForm', {
    title: 'Post an opportunity',
    profile,
    opportunity: null
  });
});

exports.createOpportunity = asyncHandler(async (req, res) => {
  const profile = await getOrCreateProfile(req.user._id, req.user.name);
  const payload = opportunityPayload(req.body, profile);

  const opportunity = await Opportunity.create({
    ...payload,
    company: req.user._id,
    status: 'pending', // moderation queue - FR-21
    isActive: true,
    views: 0
  });

  await logActivity(req, {
    action: 'opportunity_created',
    entity: 'opportunity',
    entityId: opportunity._id,
    details: `"${opportunity.title}" (${opportunity.type}) submitted for approval`
  });

  // Let the administrators know there is something to review.
  const User = require('../models/User');
  const admins = await User.find({ role: 'admin', status: 'active' }).select('_id');
  await Promise.all(
    admins.map((a) =>
      notify(a._id, {
        title: 'New opportunity to review',
        message: `${profile.companyName} submitted "${opportunity.title}" for approval.`,
        type: 'moderation',
        link: `/admin/opportunities?status=pending`
      })
    )
  );

  success(req, 'Your opportunity has been submitted and is awaiting administrator approval.');
  res.redirect('/company/opportunities');
});

// ===========================================================================
// Edit / delete (FR-15)
// ===========================================================================
exports.showEditOpportunity = asyncHandler(async (req, res) => {
  const opportunity = await Opportunity.findOne({ _id: req.params.id, company: req.user._id });
  if (!opportunity) {
    const err = new Error('That opportunity could not be found in your account.');
    err.status = 404;
    throw err;
  }
  const profile = await getOrCreateProfile(req.user._id, req.user.name);

  res.render('company/opportunityForm', {
    title: 'Edit opportunity',
    profile,
    opportunity
  });
});

exports.updateOpportunity = asyncHandler(async (req, res) => {
  const opportunity = await Opportunity.findOne({ _id: req.params.id, company: req.user._id });
  if (!opportunity) {
    error(req, 'That opportunity could not be found in your account.');
    return res.redirect('/company/opportunities');
  }

  const profile = await getOrCreateProfile(req.user._id, req.user.name);
  const payload = opportunityPayload(req.body, profile);
  const wasApproved = opportunity.status === 'approved';

  Object.assign(opportunity, payload);

  // Content changed after approval -> send it back for re-review so students
  // never see unreviewed edits.
  if (wasApproved) {
    opportunity.status = 'pending';
    opportunity.rejectionReason = '';
    info(req, 'Your changes were saved and the opportunity was sent back for administrator approval.');
  } else {
    success(req, 'Opportunity updated.');
  }

  await opportunity.save();

  await logActivity(req, {
    action: 'opportunity_updated',
    entity: 'opportunity',
    entityId: opportunity._id,
    details: `"${opportunity.title}" updated${wasApproved ? ' and re-queued for review' : ''}`
  });

  return res.redirect('/company/opportunities');
});

exports.deleteOpportunity = asyncHandler(async (req, res) => {
  const opportunity = await Opportunity.findOne({ _id: req.params.id, company: req.user._id });
  if (!opportunity) {
    error(req, 'That opportunity could not be found in your account.');
    return res.redirect('/company/opportunities');
  }

  const title = opportunity.title;

  // Applications keep a reference, so instead of deleting the rows we detach
  // them - this keeps the activity log meaningful (graceful deletion).
  await Application.updateMany({ opportunity: opportunity._id }, [{ $set: { opportunity: null } }]).catch(() => {});

  await opportunity.deleteOne();

  await logActivity(req, { action: 'opportunity_deleted', entity: 'opportunity', details: title });
  success(req, `Opportunity "${title}" has been deleted.`);
  res.redirect('/company/opportunities');
});

/** FR-15 : close / reopen an opportunity without deleting it. */
exports.toggleActive = asyncHandler(async (req, res) => {
  const opportunity = await Opportunity.findOne({ _id: req.params.id, company: req.user._id });
  if (!opportunity) {
    error(req, 'That opportunity could not be found in your account.');
    return res.redirect('/company/opportunities');
  }

  opportunity.isActive = !opportunity.isActive;
  await opportunity.save();

  await logActivity(req, {
    action: opportunity.isActive ? 'opportunity_reopened' : 'opportunity_closed',
    entity: 'opportunity',
    entityId: opportunity._id,
    details: opportunity.title
  });

  success(req, opportunity.isActive ? 'Opportunity reopened - students can apply again.' : 'Opportunity closed - it is no longer accepting applications.');
  res.redirect('/company/opportunities');
});

/** FR-16 : owner view of a single opportunity (shows applicants + status). */
exports.showOpportunityDetail = asyncHandler(async (req, res) => {
  const opportunity = await Opportunity.findById(req.params.id).populate('companyProfile');
  if (!opportunity) {
    const err = new Error('That opportunity could not be found.');
    err.status = 404;
    throw err;
  }

  const isOwner = opportunity.company.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';

  // A company may only open its own posts through the company portal. If the
  // post belongs to somebody else, send them to the public detail page instead
  // of exposing the management view (and its applicant links).
  if (!isOwner && !isAdmin) {
    if (opportunity.isVisibleToStudents) return res.redirect(`/opportunities/${opportunity._id}`);
    const err = new Error('That opportunity could not be found.');
    err.status = 404;
    throw err;
  }

  const applicantCount = await Application.countDocuments({ opportunity: opportunity._id });

  res.render('company/opportunityDetail', {
    title: opportunity.title,
    opportunity,
    company: opportunity.companyProfile,
    applicantCount
  });
});

module.exports.getOrCreateProfile = getOrCreateProfile;
module.exports.refreshCompanyRating = refreshCompanyRating;