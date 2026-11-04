/**
 * middleware/validate.js
 * ---------------------------------------------------------------------------
 * Server side form validation built on express-validator (FR-26).
 *
 * `validate(rules, options)` runs the rules, collects the errors and then:
 *   - flashes a human readable message for every problem (utils/flash), and
 *   - re-renders the submitted form with the user's input already filled in.
 *
 * The views also use Bootstrap's client-side validation for instant feedback;
 * this middleware is what actually protects the data.
 */
'use strict';

const { validationResult } = require('express-validator');
const { setFlash, backTo } = require('../utils/flash');

/**
 * Turn express-validator errors into a simple array of { field, msg }.
 * @param {import('express').Request} req
 */
function collectErrors(req) {
  return validationResult(req).array({ onlyFirstError: true }).map((e) => ({
    field: e.path || e.param,
    msg: e.msg
  }));
}

/**
 * @param {import('express').ValidationChain[]} rules
 * @param {{
 *   redirect?: string,   // where to bounce on failure
 *   render?: string,     // view to re-render on failure
 *   locals?: object,     // extra locals for that view
 *   keepInput?: boolean  // stash the submitted body in the session (default true)
 * }} [options]
 * @returns {import('express').RequestHandler}
 */
function validate(rules, options = {}) {
  const { redirect, render, locals = {}, keepInput = true } = options;

  return async function validateMiddleware(req, res, next) {
    // Rules run **sequentially**, not with Promise.all. Cross-field validators
    // such as `.equals(body('password'))` need the other chain to have run
    // first, which is not guaranteed when everything is fired in parallel.
    for (const rule of rules.flat()) {
      // eslint-disable-next-line no-await-in-loop
      await rule.run(req);
    }

    const errors = collectErrors(req);
    if (errors.length === 0) {
      // Successful validation: clear anything left from a previous attempt.
      if (req.session) delete req.session.oldInput;
      if (req.session) delete req.session.oldErrors;
      return next();
    }

    // Persist the errors + submitted values so the next GET can restore them.
    if (keepInput && req.session) {
      req.session.oldErrors = errors;
      req.session.oldInput = sanitiseBody(req.body);
    }

    errors.forEach((e) => setFlash(req, 'error', e.msg));

    if (render) {
      return res.status(422).render(render, {
        title: 'Validation failed',
        errors,
        values: req.session && req.session.oldInput ? req.session.oldInput : sanitiseBody(req.body),
        user: req.user,
        ...locals
      });
    }

    const target = typeof redirect === 'function' ? redirect(req) : redirect;
    return res.redirect(target || backTo(req));
  };
}

/**
 * Never store sensitive / huge fields in the session (CSRF-like fields are
 * removed by hpp, and we additionally drop files and passwords here).
 */
function sanitiseBody(body = {}) {
  const clone = {};
  Object.keys(body || {}).forEach((key) => {
    if (['password', 'password2', '_csrf', 'resetPasswordToken'].includes(key)) return;
    const value = body[key];
    if (value === undefined) return;
    clone[key] = typeof value === 'string' ? value.slice(0, 2000) : value;
  });
  return clone;
}

module.exports = { validate, collectErrors };