/**
 * models/Bookmark.js
 * ---------------------------------------------------------------------------
 * "Saved opportunities" (bonus feature 1).
 * A unique compound index makes saving idempotent - clicking the bookmark
 * icon twice can never create two rows.
 */
'use strict';

const mongoose = require('mongoose');

const bookmarkSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    opportunity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Opportunity',
      required: true,
      index: true
    }
  },
  { timestamps: true }
);

bookmarkSchema.index({ student: 1, opportunity: 1 }, { unique: true });
bookmarkSchema.index({ student: 1, createdAt: -1 });

module.exports = mongoose.models.Bookmark || mongoose.model('Bookmark', bookmarkSchema);