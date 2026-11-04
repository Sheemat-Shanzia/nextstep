/**
 * services/moderationService.js
 * ---------------------------------------------------------------------------
 * Administrator moderation of submitted opportunities (FR-21 / FR-23).
 *
 * Rules enforced here:
 *   - `status` is always exactly one of pending / approved / rejected
 *   - rejecting without a reason is refused
 *   - the company is notified about the outcome
 *   - bulk approve / reject / delete shares the exact same code path as the
 *     single-item actions so behaviour can never diverge
 */
'use strict';

const Opportunity = require('../models/Opportunity');
const { notify } = require('../utils/notify');

const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };

/**
 * Approve one opportunity.
 * @param {Opportunity} opportunity
 * @param {{adminId:string}} ctx
 */
async function approve(opportunity, { adminId }) {
  opportunity.status = 'approved';
  opportunity.rejectionReason = '';
  opportunity.reviewedBy = adminId;
  opportunity.reviewedAt = new Date();
  opportunity.isActive = true;
  await opportunity.save();

  await notify(opportunity.company, {
    title: 'Opportunity approved',
    message: `Your post "${opportunity.title}" has been approved and is now visible to students.`,
    type: 'moderation',
    link: `/company/opportunities/${opportunity._id}`
  });

  return opportunity;
}

/**
 * Reject one opportunity - a reason is mandatory.
 * @param {Opportunity} opportunity
 * @param {{adminId:string, reason:string}} ctx
 */
async function reject(opportunity, { adminId, reason }) {
  const trimmed = String(reason || '').trim();
  if (!trimmed) {
    const err = new Error('A rejection reason is required.');
    err.status = 400;
    throw err;
  }

  opportunity.status = 'rejected';
  opportunity.rejectionReason = trimmed;
  opportunity.reviewedBy = adminId;
  opportunity.reviewedAt = new Date();
  opportunity.isActive = false;
  await opportunity.save();

  await notify(opportunity.company, {
    title: 'Opportunity rejected',
    message: `Your post "${opportunity.title}" was rejected. Reason: ${trimmed}`,
    type: 'moderation',
    link: `/company/opportunities/${opportunity._id}`
  });

  return opportunity;
}

/** Send an opportunity back to the moderation queue. */
async function resetToPending(opportunity, { adminId }) {
  opportunity.status = 'pending';
  opportunity.rejectionReason = '';
  opportunity.reviewedBy = adminId;
  opportunity.reviewedAt = new Date();
  opportunity.isActive = true;
  await opportunity.save();
  return opportunity;
}

/**
 * Bulk action (bonus feature 13).
 * @param {string[]} ids
 * @param {'approve'|'reject'|'delete'|'pending'} action
 * @param {{adminId:string, reason?:string}} ctx
 * @returns {Promise<{count:number, failed:Array}>}
 */
async function bulkAction(ids, action, { adminId, reason = '' }) {
  let query = { _id: { $in: ids } };
  if (action === 'delete') {
    const removed = await Opportunity.deleteMany(query);
    return { count: removed.deletedCount || 0, failed: [] };
  }

  query = { _id: { $in: ids } };
  const items = await Opportunity.find(query);
  const failed = [];

  for (const item of items) {
    try {
      if (action === 'approve') await approve(item, { adminId });
      else if (action === 'reject') await reject(item, { adminId, reason });
      else if (action === 'pending') await resetToPending(item, { adminId });
      else failed.push({ id: item._id, reason: 'Unknown action' });
    } catch (err) {
      failed.push({ id: item._id, reason: err.message });
    }
  }

  return { count: items.length - failed.length, failed };
}

module.exports = { approve, reject, resetToPending, bulkAction, STATUS_LABEL };