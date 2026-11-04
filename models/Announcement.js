/**
 * models/Announcement.js
 * ---------------------------------------------------------------------------
 * Announcements created by an administrator and rendered on the student and
 * company dashboards (bonus feature 20).
 */
'use strict';

const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 180 },
    body: {
      type: String,
      required: [true, 'Body is required'],
      trim: true,
      minlength: [5, 'Body must be at least 5 characters long'],
      maxlength: [3000, 'Body cannot be longer than 3000 characters']
    },
    /** Empty array = visible to every role. */
    audience: {
      type: [String],
      enum: {
        values: ['student', 'company', 'admin'],
        message: '{VALUE} is not a valid audience'
      },
      default: ['student', 'company']
    },
    level: {
      type: String,
      enum: { values: ['info', 'warning', 'success', 'danger'], message: '{VALUE} is not a valid level' },
      default: 'info'
    },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: 'Administrator' },
    expiresAt: { type: Date, default: null }
  },
  { timestamps: true }
);

announcementSchema.index({ isActive: 1, createdAt: -1 });

/** Virtual used by the dashboards. */
announcementSchema.virtual('isLive').get(function isLive() {
  return this.isActive && (!this.expiresAt || this.expiresAt.getTime() > Date.now());
});

module.exports = mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema);