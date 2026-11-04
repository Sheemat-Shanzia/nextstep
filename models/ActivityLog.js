/**
 * models/ActivityLog.js
 * ---------------------------------------------------------------------------
 * Lightweight audit trail (bonus feature 11) written by utils/logActivity.js.
 * The admin "Activity log" screen reads from here with filters.
 * Never stores passwords, tokens or CV content.
 */
'use strict';

const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    userName: { type: String, default: 'System' }, // denormalised so the log
    //                                             survives a deleted user
    userRole: { type: String, default: '' },
    action: {
      type: String,
      required: [true, 'Action is required'],
      trim: true,
      maxlength: 80,
      index: true
    },
    entity: {
      type: String,
      enum: {
        values: ['user', 'studentprofile', 'companyprofile', 'opportunity', 'application', 'notification', 'bookmark', 'review', 'announcement', 'feedback', 'auth', 'file'],
        message: '{VALUE} is not a valid entity'
      },
      default: 'user',
      index: true
    },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    ip: { type: String, default: '' },
    details: { type: String, trim: true, default: '', maxlength: 500 }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ user: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.models.ActivityLog || mongoose.model('ActivityLog', activityLogSchema);