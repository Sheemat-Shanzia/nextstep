/**
 * controllers/fileController.js
 * ---------------------------------------------------------------------------
 * BONUS FEATURE 18 - protected file downloads.
 *
 * The `uploads/` folder is deliberately NOT served by express.static. Every
 * download goes through one of the routes below, which authorise the requester:
 *
 *   - a CV may be read by  (a) the student who owns it,
 *                         (b) a company that received it in an application,
 *                         (c) any administrator.
 *
 * Anything else gets 403. The physical path is always rebuilt from
 * `path.basename()` so a crafted filename can never escape the folder.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const Application = require('../models/Application');
const StudentProfile = require('../models/StudentProfile');
const asyncHandler = require('../utils/asyncHandler');
const logActivity = require('../utils/logActivity');
const { error, warning, backTo } = require('../utils/flash');
const { DIRS } = require('../config/multer');

/**
 * May `user` read the CV attached to `application`?
 * @param {{_id:any, role:string}} user
 * @param {object} application
 */
function canReadApplicationFiles(user, application) {
  if (!user || !application) return false;
  if (user.role === 'admin') return true;
  if (application.student && application.student.toString() === user._id.toString()) return true;
  if (application.company && application.company.toString() === user._id.toString()) return true;
  return false;
}

/**
 * Stream a stored file to the browser.
 * @param {import('express').Response} res
 * @param {'cv'|'documents'} kind
 * @param {string} filename
 * @param {string} downloadName
 */
function sendStoredFile(res, kind, filename, downloadName) {
  const safeName = path.basename(String(filename || ''));
  const absolute = path.join(DIRS[kind], safeName);

  // Defence in depth: confirm the resolved path is still inside the folder.
  if (!absolute.startsWith(path.resolve(DIRS[kind]))) {
    error(res.req, 'Invalid file reference.');
    return res.redirect(backTo(req));
  }
  if (!safeName || !fs.existsSync(absolute)) {
    warning(res.req, 'That file is no longer available on the server.');
    return res.redirect(backTo(req));
  }

  return res.download(absolute, downloadName || safeName);
}

// ===========================================================================
// GET /files/application/:applicationId/cv
// ===========================================================================
exports.downloadApplicationCv = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.applicationId);

  if (!application) {
    error(req, 'That application could not be found.');
    return res.redirect(backTo(req));
  }
  if (!canReadApplicationFiles(req.user, application)) {
    const err = new Error('You are not allowed to download this CV.');
    err.status = 403;
    throw err;
  }
  if (!application.cvPath) {
    warning(req, 'No CV was attached to this application.');
    return res.redirect(backTo(req));
  }

  await logActivity(req, {
    action: 'file_downloaded',
    entity: 'file',
    entityId: application._id,
    details: `CV of application ${application._id}`
  });

  return sendStoredFile(res, 'cv', application.cvPath, application.cvOriginalName || `${path.parse(application.cvPath).name}.pdf`);
});

// ===========================================================================
// GET /files/application/:applicationId/document/:docId
// ===========================================================================
exports.downloadApplicationDocument = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.applicationId);

  if (!application) {
    error(req, 'That application could not be found.');
    return res.redirect(backTo(req));
  }
  if (!canReadApplicationFiles(req.user, application)) {
    const err = new Error('You are not allowed to download this document.');
    err.status = 403;
    throw err;
  }

  const doc = (application.documents || []).id(req.params.docId);
  if (!doc) {
    warning(req, 'That document is not attached to this application.');
    return res.redirect(backTo(req));
  }

  await logActivity(req, {
    action: 'file_downloaded',
    entity: 'file',
    entityId: application._id,
    details: `document "${doc.title}"`
  });

  return sendStoredFile(res, 'documents', doc.path, doc.originalName || doc.title);
});

// ===========================================================================
// GET /files/profile/cv   - a student downloading their own CV
// ===========================================================================
exports.downloadOwnCv = asyncHandler(async (req, res) => {
  const profile = await StudentProfile.findOne({ user: req.user._id });

  if (!profile || !profile.cvPath) {
    warning(req, 'You have not uploaded a CV yet.');
    return res.redirect('/student/profile');
  }

  await logActivity(req, { action: 'file_downloaded', entity: 'file', entityId: profile._id, details: 'own CV' });

  return sendStoredFile(res, 'cv', profile.cvPath, profile.cvOriginalName || 'my-cv.pdf');
});

// ===========================================================================
// GET /files/profile/document/:docId  - own supporting document
// ===========================================================================
exports.downloadOwnDocument = asyncHandler(async (req, res) => {
  const profile = await StudentProfile.findOne({ user: req.user._id });
  if (!profile) {
    warning(req, 'No profile found.');
    return res.redirect('/student/profile');
  }

  const doc = (profile.documents || []).id(req.params.docId);
  if (!doc) {
    warning(req, 'That document could not be found.');
    return res.redirect('/student/profile');
  }

  return sendStoredFile(res, 'documents', doc.path, doc.originalName || doc.title);
});

// ===========================================================================
// GET /files/company/logo/:userId  - public-ish company logo
// ===========================================================================
exports.downloadCompanyLogo = asyncHandler(async (req, res) => {
  const CompanyProfile = require('../models/CompanyProfile');
  const profile = await CompanyProfile.findOne({ user: req.params.userId });
  if (!profile || !profile.logo) {
    warning(req, 'That company has no logo.');
    return res.redirect(backTo(req));
  }
  return sendStoredFile(res, 'logos', profile.logo, profile.logoOriginalName || 'logo');
});