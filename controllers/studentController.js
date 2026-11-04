/**
 * controllers/studentController.js
 * ---------------------------------------------------------------------------
 * FR-03 to FR-07 : student profile, skills, CV / supporting documents,
 * education, projects and saved (bookmarked) opportunities.
 *
 * Every save recomputes `profileStrength` through utils/profileStrength.js so
 * the progress bar on the dashboard is always up to date.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const StudentProfile = require('../models/StudentProfile');
const Opportunity = require('../models/Opportunity');
const Bookmark = require('../models/Bookmark');
const asyncHandler = require('../utils/asyncHandler');
const logActivity = require('../utils/logActivity');
const { success, error, warning, info, backTo } = require('../utils/flash');
const { buildProfileChecklist } = require('../utils/profileStrength');
const { getPagination, buildPageMeta } = require('../utils/pagination');
const { DIRS } = require('../config/multer');

/** Load (or create) the profile document of the signed-in student. */
async function getOrCreateProfile(userId) {
  let profile = await StudentProfile.findOne({ user: userId });
  if (!profile) profile = await StudentProfile.create({ user: userId });
  return profile;
}

/** Delete a file from one of the uploads sub-folders (best effort). */
function removeUploadFile(kind, filename) {
  if (!filename) return;
  try {
    const target = path.join(DIRS[kind], path.basename(filename));
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch (err) {
    /* the file was already gone - nothing to do */
  }
}

/** Persist the recalculated strength percentage. */
async function refreshStrength(profile) {
  const user = profile.user;
  const { profileStrength } = buildProfileChecklist(profile, user);
  profile.profileStrength = profileStrength;
  await profile.save();
  return profileStrength;
}

// ===========================================================================
// GET /student/profile
// ===========================================================================
exports.showProfile = asyncHandler(async (req, res) => {
  const profile = await getOrCreateProfile(req.user._id);
  await profile.populate('user', 'name email createdAt lastLogin');

  const checklist = buildProfileChecklist(profile, profile.user);

  res.render('student/profile', {
    title: 'My profile',
    profile,
    checklist,
    stats: {
      skills: profile.skills.length,
      documents: profile.documents.length,
      education: profile.education.length,
      projects: profile.projects.length
    }
  });
});

// ===========================================================================
// GET /student/profile/edit
// ===========================================================================
exports.showProfileEdit = asyncHandler(async (req, res) => {
  const profile = await getOrCreateProfile(req.user._id);
  res.render('student/profileEdit', {
    title: 'Edit profile',
    profile,
    checklist: buildProfileChecklist(profile, req.user)
  });
});

// ===========================================================================
// POST /student/profile
// ===========================================================================
exports.updateProfile = asyncHandler(async (req, res) => {
  const profile = await getOrCreateProfile(req.user._id);
  const b = req.body;

  // Free text fields.
  ['phone', 'address', 'university', 'department', 'degree', 'bio', 'linkedin', 'github', 'portfolio'].forEach((field) => {
    if (b[field] !== undefined) profile[field] = String(b[field]).trim();
  });

  // Enum / typed fields.
  if (b.gender && ['male', 'female', 'other', 'prefer-not-to-say'].includes(b.gender)) profile.gender = b.gender;
  if (b.currentSemester) profile.currentSemester = parseInt(b.currentSemester, 10) || null;
  if (b.graduationYear) profile.graduationYear = parseInt(b.graduationYear, 10) || null;
  if (b.cgpa !== undefined && b.cgpa !== '') profile.cgpa = Number(b.cgpa);
  if (b.dateOfBirth) profile.dateOfBirth = new Date(b.dateOfBirth);

  // Interests: comma separated text field.
  if (b.interests !== undefined) {
    profile.interests = String(b.interests)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
  }

  const percentage = buildProfileChecklist(profile, req.user).profileStrength;
  profile.profileStrength = percentage;

  await profile.save();
  await logActivity(req, {
    action: 'profile_updated',
    entity: 'studentprofile',
    entityId: profile._id,
    details: `Profile updated (strength ${percentage}%)`
  });

  success(req, `Profile saved. Your profile strength is now ${percentage}%.`);
  res.redirect('/student/profile');
});

// ===========================================================================
// Skills  (FR-05)
// ===========================================================================
exports.showSkills = asyncHandler(async (req, res) => {
  const profile = await getOrCreateProfile(req.user._id);
  res.render('student/skills', {
    title: 'My skills',
    profile,
    skillLevels: ['beginner', 'intermediate', 'advanced', 'expert'],
    checklist: buildProfileChecklist(profile, req.user)
  });
});

/** Add a skill. */
exports.addSkill = asyncHandler(async (req, res) => {
  const profile = await getOrCreateProfile(req.user._id);
  const name = String(req.body.name || '').trim();

  if (name.length < 2) {
    error(req, 'Please enter a skill name of at least 2 characters.');
    return res.redirect('/student/skills');
  }
  const duplicate = profile.skills.find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (duplicate) {
    warning(req, `"${name}" is already in your skill list.`);
    return res.redirect('/student/skills');
  }
  if (profile.skills.length >= 30) {
    error(req, 'You can add at most 30 skills.');
    return res.redirect('/student/skills');
  }

  profile.skills.push({ name, level: req.body.level || 'intermediate' });
  await refreshStrength(profile);

  await logActivity(req, { action: 'skill_added', entity: 'studentprofile', entityId: profile._id, details: name });
  success(req, `Skill "${name}" added.`);
  res.redirect('/student/skills');
});

/** Update an existing skill. */
exports.updateSkill = asyncHandler(async (req, res) => {
  const profile = await getOrCreateProfile(req.user._id);
  const skill = profile.skills.id(req.params.skillId);
  if (!skill) {
    error(req, 'That skill could not be found.');
    return res.redirect('/student/skills');
  }

  const name = String(req.body.name || '').trim();
  if (name.length >= 2) skill.name = name;
  if (req.body.level) skill.level = req.body.level;

  await refreshStrength(profile);
  await logActivity(req, { action: 'skill_updated', entity: 'studentprofile', entityId: profile._id, details: name });
  success(req, `Skill "${skill.name}" updated.`);
  res.redirect('/student/skills');
});

/** Delete a skill. */
exports.deleteSkill = asyncHandler(async (req, res) => {
  const profile = await getOrCreateProfile(req.user._id);
  const skill = profile.skills.id(req.params.skillId);
  if (!skill) {
    error(req, 'That skill could not be found.');
    return res.redirect('/student/skills');
  }

  const name = skill.name;
  skill.deleteOne();
  await refreshStrength(profile);

  await logActivity(req, { action: 'skill_deleted', entity: 'studentprofile', entityId: profile._id, details: name });
  success(req, `Skill "${name}" removed.`);
  res.redirect('/student/skills');
});

// ===========================================================================
// CV + supporting documents
// ===========================================================================
/** Replace the CV stored on the profile. */
exports.uploadCv = asyncHandler(async (req, res) => {
  if (!req.file) {
    warning(req, 'No file was received. Please choose a PDF, DOC or DOCX file.');
    return res.redirect('/student/profile');
  }

  const profile = await getOrCreateProfile(req.user._id);
  const previous = profile.cvPath;

  profile.cvPath = req.file.filename;
  profile.cvOriginalName = req.file.originalname;
  profile.cvUploadedAt = new Date();
  await refreshStrength(profile);

  // Only delete the old CV once the new one is safely recorded.
  if (previous && previous !== req.file.filename) removeUploadFile('cv', previous);

  await logActivity(req, { action: 'cv_uploaded', entity: 'file', entityId: profile._id, details: req.file.originalname });
  success(req, 'Your CV has been uploaded and will be attached to new applications.');
  res.redirect('/student/profile');
});

/** Delete the CV. */
exports.deleteCv = asyncHandler(async (req, res) => {
  const profile = await getOrCreateProfile(req.user._id);
  if (!profile.cvPath) {
    warning(req, 'You have not uploaded a CV yet.');
    return res.redirect('/student/profile');
  }

  removeUploadFile('cv', profile.cvPath);
  profile.cvPath = '';
  profile.cvOriginalName = '';
  profile.cvUploadedAt = null;
  await refreshStrength(profile);

  await logActivity(req, { action: 'cv_deleted', entity: 'file', entityId: profile._id });
  success(req, 'Your CV has been removed.');
  res.redirect('/student/profile');
});

/** Upload supporting documents (transcripts, certificates, ...). */
exports.uploadDocuments = asyncHandler(async (req, res) => {
  const files = [].concat(req.files || []);
  if (!files.length) {
    warning(req, 'No files were received.');
    return res.redirect('/student/profile');
  }

  const profile = await getOrCreateProfile(req.user._id);
  files.forEach((file) => {
    profile.documents.push({
      title: file.originalname,
      path: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
      uploadedAt: new Date()
    });
  });

  await refreshStrength(profile);
  await logActivity(req, { action: 'document_uploaded', entity: 'file', entityId: profile._id, details: `${files.length} file(s)` });
  success(req, `${files.length} document${files.length === 1 ? '' : 's'} uploaded.`);
  res.redirect('/student/profile');
});

/** Remove one supporting document. */
exports.deleteDocument = asyncHandler(async (req, res) => {
  const profile = await getOrCreateProfile(req.user._id);
  const doc = profile.documents.id(req.params.docId);
  if (!doc) {
    error(req, 'That document could not be found.');
    return res.redirect('/student/profile');
  }

  const title = doc.title;
  removeUploadFile('documents', doc.path);
  doc.deleteOne();
  await refreshStrength(profile);

  await logActivity(req, { action: 'document_deleted', entity: 'file', entityId: profile._id, details: title });
  success(req, `Document "${title}" removed.`);
  res.redirect('/student/profile');
});

// ===========================================================================
// Education + projects (nested collections on the profile)
// ===========================================================================
exports.addEducation = asyncHandler(async (req, res) => {
  const profile = await getOrCreateProfile(req.user._id);
  const institution = String(req.body.institution || '').trim();
  if (institution.length < 2) {
    error(req, 'Please enter the name of the institution.');
    return res.redirect('/student/profile');
  }

  profile.education.push({
    institution,
    degree: String(req.body.degree || '').trim(),
    fieldOfStudy: String(req.body.fieldOfStudy || '').trim(),
    startYear: parseInt(req.body.startYear, 10) || undefined,
    endYear: parseInt(req.body.endYear, 10) || undefined,
    grade: String(req.body.grade || '').trim(),
    description: String(req.body.description || '').trim()
  });

  await refreshStrength(profile);
  success(req, 'Education entry added.');
  res.redirect('/student/profile');
});

exports.deleteEducation = asyncHandler(async (req, res) => {
  const profile = await getOrCreateProfile(req.user._id);
  const entry = profile.education.id(req.params.eduId);
  if (!entry) {
    error(req, 'That education entry could not be found.');
    return res.redirect('/student/profile');
  }
  entry.deleteOne();
  await refreshStrength(profile);
  success(req, 'Education entry removed.');
  res.redirect('/student/profile');
});

exports.addProject = asyncHandler(async (req, res) => {
  const profile = await getOrCreateProfile(req.user._id);
  const title = String(req.body.title || '').trim();
  if (title.length < 2) {
    error(req, 'Please enter a project title.');
    return res.redirect('/student/profile');
  }

  profile.projects.push({
    title,
    description: String(req.body.description || '').trim(),
    technologies: String(req.body.technologies || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    link: String(req.body.link || '').trim(),
    startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
    endDate: req.body.endDate ? new Date(req.body.endDate) : undefined
  });

  await refreshStrength(profile);
  success(req, 'Project added.');
  res.redirect('/student/profile');
});

exports.deleteProject = asyncHandler(async (req, res) => {
  const profile = await getOrCreateProfile(req.user._id);
  const project = profile.projects.id(req.params.projectId);
  if (!project) {
    error(req, 'That project could not be found.');
    return res.redirect('/student/profile');
  }
  project.deleteOne();
  await refreshStrength(profile);
  success(req, 'Project removed.');
  res.redirect('/student/profile');
});

// ===========================================================================
// Bookmarked opportunities (bonus feature 1)
// ===========================================================================
exports.showBookmarks = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, { defaultLimit: 9 });

  const filter = { student: req.user._id };
  const [total, bookmarks] = await Promise.all([
    Bookmark.countDocuments(filter),
    Bookmark.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'opportunity',
        populate: { path: 'companyProfile', select: 'companyName logo verified' }
      })
      .lean()
  ]);

  // Hide bookmarks whose opportunity was later closed or deleted.
  const valid = bookmarks.filter((b) => b.opportunity && b.opportunity.status === 'approved');

  // Everything on this page is saved by definition, so the card partial can
  // render a filled bookmark icon without another query.
  res.locals.bookmarkedIds = new Set(valid.map((b) => String(b.opportunity._id)));
  res.locals.appliedIds = new Set();

  res.render('student/bookmarks', {
    title: 'Saved opportunities',
    bookmarks: valid,
    pager: buildPageMeta({ page, limit, total })
  });
});

/** Toggle the saved state of an opportunity (called by the bookmark button). */
exports.toggleBookmark = asyncHandler(async (req, res) => {
  const opportunityId = req.params.id || req.body.opportunityId;
  const opportunity = await Opportunity.findById(opportunityId);

  if (!opportunity) {
    error(req, 'That opportunity no longer exists.');
    return res.redirect(backTo(req));
  }

  const existing = await Bookmark.findOne({ student: req.user._id, opportunity: opportunity._id });

  if (existing) {
    await existing.deleteOne();
    await logActivity(req, { action: 'bookmark_removed', entity: 'bookmark', entityId: opportunity._id, details: opportunity.title });
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ ok: true, saved: false });
    }
    success(req, `Removed "${opportunity.title}" from your saved list.`);
    return res.redirect(backTo(req));
  }

  await Bookmark.create({ student: req.user._id, opportunity: opportunity._id });
  await logActivity(req, { action: 'bookmark_added', entity: 'bookmark', entityId: opportunity._id, details: opportunity.title });

  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.json({ ok: true, saved: true });
  }
  success(req, `Saved "${opportunity.title}" to your list.`);
  return res.redirect(backTo(req));
});

// ===========================================================================
// Reviews & ratings (bonus feature 6)
// ===========================================================================
/** POST /companies/:id/review - a student rates a company. */
exports.submitReview = asyncHandler(async (req, res) => {
  const Review = require('../models/Review');
  const CompanyProfile = require('../models/CompanyProfile');
  const { refreshCompanyRating, notify } = require('../utils/notify');

  const profile = await CompanyProfile.findOne({ user: req.params.id });
  if (!profile) {
    error(req, 'That company could not be found.');
    return res.redirect(backTo(req));
  }

  const rating = parseInt(req.body.rating, 10);
  const comment = String(req.body.comment || '').trim();

  if (!rating || rating < 1 || rating > 5) {
    error(req, 'Please choose a rating between 1 and 5 stars.');
    return res.redirect(`/companies/${req.params.id}#review-form`);
  }

  // One review per student per company (unique compound index).
  const existing = await Review.findOne({ student: req.user._id, company: profile.user });
  if (existing) {
    existing.rating = rating;
    existing.comment = comment;
    existing.companyProfile = profile._id;
    await existing.save();
    info(req, 'Your review has been updated.');
  } else {
    await Review.create({ student: req.user._id, company: profile.user, companyProfile: profile._id, rating, comment });
    success(req, 'Thank you! Your review has been published.');
  }

  await refreshCompanyRating(profile.user);
  await notify(profile.user, {
    title: 'New student review',
    message: `${req.user.name} rated your company ${rating}/5.${comment ? ` "${comment.slice(0, 160)}"` : ''}`,
    type: 'review',
    link: '/company/profile'
  });
  await logActivity(req, {
    action: 'review_submitted',
    entity: 'review',
    entityId: profile._id,
    details: `${rating}/5 for ${profile.companyName}`
  });

  return res.redirect(`/companies/${req.params.id}#reviews`);
});