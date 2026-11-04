/**
 * utils/logActivity.js
 * ---------------------------------------------------------------------------
 * Writes one row into the `activitylogs` collection (bonus feature 11).
 *
 * Fire-and-forget by design: an audit entry must never break the request that
 * produced it, so every failure is logged to the console and swallowed.
 * Passwords / tokens are never passed to `details`.
 */
'use strict';

const ActivityLog = require('../models/ActivityLog');

/**
 * @param {import('express').Request|{user?:any, ip?:string, headers?:object}} req
 * @param {{action:string, entity?:string, entityId?:any, details?:string}} entry
 */
async function logActivity(req, { action, entity = 'user', entityId = null, details = '' }) {
  try {
    const user = (req && req.user) || null;
    const ip =
      (req && req.ip) ||
      (req && req.headers && req.headers['x-forwarded-for']) ||
      '';

    await ActivityLog.create({
      user: user ? user._id : null,
      userName: user ? user.name : 'Anonymous',
      userRole: user ? user.role : '',
      action,
      entity,
      entityId: entityId || null,
      ip: String(ip).replace('::ffff:', ''),
      details: String(details).slice(0, 500)
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[activity-log] failed to record "${action}": ${err.message}`);
  }
}

module.exports = logActivity;
module.exports.logActivity = logActivity;