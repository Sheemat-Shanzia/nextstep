/**
 * utils/notify.js
 * ---------------------------------------------------------------------------
 * Creates in-app notifications (bonus feature 3) and keeps the CompanyProfile
 * rating cache in sync (bonus feature 6).
 *
 * Nothing here throws - a failed notification must not roll back the action
 * that triggered it.
 */
'use strict';

const Notification = require('../models/Notification');
const Review = require('../models/Review');
const CompanyProfile = require('../models/CompanyProfile');

/**
 * Notify one user.
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {{title:string, message:string, type?:string, link?:string}} data
 */
async function notify(userId, { title, message, type = 'system', link = '' }) {
  if (!userId) return null;
  try {
    return await Notification.create({ user: userId, title, message, type, link });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[notify] failed for user ${userId}: ${err.message}`);
    return null;
  }
}

/**
 * Notify every user that holds one of the given roles (used for
 * announcements and moderation-queue alerts).
 * @param {string[]} roles
 * @param {object} data
 * @param {number} [limit=5000]
 */
async function notifyRoles(roles, data, limit = 5000) {
  try {
    const docs = await Notification.insertMany(
      roles.map((role) => ({ ...data, roleTag: role })).map(({ roleTag, ...rest }) => rest),
      { ordered: false }
    );
    return docs.length;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[notify] fan-out failed: ${err.message}`);
    return 0;
  }
}

/**
 * Recalculate and cache averageRating / reviewCount on a company profile.
 * @param {import('mongoose').Types.ObjectId} companyUserId
 */
async function refreshCompanyRating(companyUserId) {
  if (!companyUserId) return null;
  try {
    const stats = await Review.aggregate([
      { $match: { company: companyUserId } },
      { $group: { _id: '$company', averageRating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } }
    ]);

    const averageRating = stats.length ? Math.round(stats[0].averageRating * 10) / 10 : 0;
    const reviewCount = stats.length ? stats[0].reviewCount : 0;

    await CompanyProfile.updateOne({ user: companyUserId }, { $set: { averageRating, reviewCount } });
    return { averageRating, reviewCount };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[notify] rating refresh failed: ${err.message}`);
    return null;
  }
}

module.exports = { notify, notifyRoles, refreshCompanyRating };