/**
 * models/Feedback.js
 * ---------------------------------------------------------------------------
 * Messages submitted through the public Contact / Feedback page
 * (bonus feature 19). Only administrators can read them.
 */
'use strict';

const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 120 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address']
    },
    subject: {
      type: String,
      enum: {
        values: ['General Feedback', 'Bug Report', 'Feature Request', 'Complaint', 'Partnership', 'Other'],
        message: '{VALUE} is not a valid subject'
      },
      default: 'General Feedback'
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
      minlength: [10, 'Message must be at least 10 characters long'],
      maxlength: [3000, 'Message cannot be longer than 3000 characters']
    },
    status: {
      type: String,
      enum: { values: ['new', 'seen', 'resolved'], message: '{VALUE} is not a valid status' },
      default: 'new',
      index: true
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    ip: { type: String, default: '' }
  },
  { timestamps: true }
);

feedbackSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.models.Feedback || mongoose.model('Feedback', feedbackSchema);