/**
 * middleware/role.js
 * ---------------------------------------------------------------------------
 * Role based access control (FR-02).
 *
 * Every protected router is guarded with `requireRole('student')` etc., so a
 * student who types /admin/users into the address bar is redirected to a 403
 * page instead of seeing another role's data.
 */
'use strict';

const { isAuthenticated } = require('./auth');

/**
 * @param {...('student'|'company'|'admin')} roles  roles allowed to continue
 * @returns {import('express').RequestHandler}
 */
function requireRole(...roles) {
  const allowed = roles.flat();

  return function roleGuard(req, res, next) {
    // 1) must be signed in
    if (!req.user) {
      req.flash('warning', 'Please sign in to continue.');
      return res.redirect('/auth/login?returnTo=' + encodeURIComponent(req.originalUrl));
    }

    // 2) must still be active (belt & braces - loadUser already handles it)
    if (req.user.status !== 'active') {
      req.flash('error', `Your account is ${req.user.status}. Access denied.`);
      return res.status(403).render('errors/403', {
        title: 'Account not active',
        message: `Your account is currently marked as "${req.user.status}". Please contact the administrator.`,
        user: req.user
      });
    }

    // 3) must hold one of the allowed roles
    if (!allowed.includes(req.user.role)) {
      return res.status(403).render('errors/403', {
        title: 'Access denied',
        message: `This area is reserved for ${allowed.join(' / ')} accounts. You are signed in as a ${req.user.role}.`,
        user: req.user
      });
    }

    return next();
  };
}

/** Convenience shorthands used by the routers. */
const studentOnly = requireRole('student');
const companyOnly = requireRole('company');
const adminOnly = requireRole('admin');

module.exports = { requireRole, studentOnly, companyOnly, adminOnly };