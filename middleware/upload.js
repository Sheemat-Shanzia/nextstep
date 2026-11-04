/**
 * middleware/upload.js
 * ---------------------------------------------------------------------------
 * Glue between config/multer.js and the routers.
 *
 * Multer calls next(err) for bad MIME types / oversized files, which would
 * normally produce a 500. `runUpload` converts those into a friendly flash
 * message and a redirect back to the form instead.
 */
'use strict';

const multer = require('multer');
const { MAX_FILE_SIZE_MB, MAX_FILES } = require('../config/multer');
const { setFlash, backTo } = require('../utils/flash');

/**
 * Run a multer middleware and handle its errors gracefully.
 * @param {import('express').RequestHandler} uploader
 * @param {string} fallbackRedirect - where to send the user on failure
 * @returns {import('express').RequestHandler}
 */
function runUpload(uploader, fallbackRedirect) {
  return function uploadMiddleware(req, res, next) {
    uploader(req, res, (err) => {
      if (!err) return next();

      // ---- oversized file ---------------------------------------------------
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        setFlash(req, 'error', `File is too large. The maximum allowed size is ${MAX_FILE_SIZE_MB} MB.`);
      } else if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_COUNT') {
        setFlash(req, 'error', `Too many files. You can upload at most ${MAX_FILES} documents at once.`);
      } else if (err instanceof multer.MulterError && err.code === 'LIMIT_UNEXPECTED_FILE') {
        setFlash(req, 'error', `Unexpected file field "${err.field}". Please use the file input provided on the form.`);
      } else {
        setFlash(req, 'error', err.message || 'The file could not be uploaded.');
      }

      // Remove partially written files so the uploads folder never fills up
      // with junk when the request is rejected.
      cleanupFiles(req);

      const target = typeof fallbackRedirect === 'function' ? fallbackRedirect(req) : fallbackRedirect;
      return res.redirect(target || backTo(req));
    });
  };
}

/** Delete every file multer managed to write for this request. */
function cleanupFiles(req) {
  const files = []
    .concat(req.file || [])
    .concat(req.files || []);
  files
    .filter(Boolean)
    .forEach((f) => {
      try {
        require('fs').unlinkSync(f.path);
      } catch (err) {
        /* file was never created - nothing to clean up */
      }
    });
}

/** Normalise multer's `req.files` (object or array) into a flat array. */
function filesOf(req) {
  if (!req.files) return [];
  if (Array.isArray(req.files)) return req.files;
  return Object.values(req.files).flat();
}

/** Map multer file objects to the sub-document shape used by our models. */
function toDocumentMeta(file, fallbackTitle) {
  return {
    title: fallbackTitle || file.originalname,
    path: file.filename,
    originalName: file.originalname,
    size: file.size,
    mimeType: file.mimetype,
    uploadedAt: new Date()
  };
}

module.exports = { runUpload, cleanupFiles, filesOf, toDocumentMeta };