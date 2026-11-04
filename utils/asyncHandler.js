/**
 * utils/asyncHandler.js
 * ---------------------------------------------------------------------------
 * Wraps an async route handler so that a rejected promise is forwarded to the
 * Express central error handler instead of crashing the process with an
 * "unhandled promise rejection".
 *
 * Usage:  router.get('/', asyncHandler(async (req, res) => { ... }))
 */
'use strict';

/**
 * @param {Function} fn - (req, res, next) => Promise<any>
 * @returns {Function} express handler
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
module.exports.asyncHandler = asyncHandler;