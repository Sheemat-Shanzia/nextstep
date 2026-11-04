/**
 * models/Notification.js
 * ---------------------------------------------------------------------------
 * In-app notifications (bell icon in the navbar - bonus feature 3).
 * Events that create a notification:
 *   - application submitted            -> company
 *   - application status changed       -> student
 *   - opportunity approved / rejected  -> company
 *   - opportunity submitted            -> admin (moderation queue)
 *   - new announcement                 -> everyone (fan-out helper in utils/notify)
 */
'use strict';

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 160 },
    message: { type: String, required: [true, 'Message is required'], trim: true, maxlength: 800 },
    type: {
      type: String,
      enum: {
        values: ['application', 'status', 'moderation', 'account', 'announcement', 'review', 'system'],
        message: '{VALUE} is not a valid notification type'
      },
      default: 'system',
      index: true
    },
    link: { type: String, default: '', trim: true },
    isRead: { type: Boolean, default: false, index: true }
  },
  {
    timestamps: true // createdAt doubles as "when was it sent"
  }
);

// The navbar bell always asks for "my unread notifications, newest first".
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

notificationSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);