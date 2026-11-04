/**
 * models/Review.js
 * ---------------------------------------------------------------------------
 * Student -> Company rating (bonus feature 6). A student may leave one review
 * per company; the company profile caches averageRating / reviewCount so the
 * company page does not need a full aggregation pipeline on every load.
 */
'use strict';

const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    companyProfile: { type: mongoose.Schema.Types.ObjectId, ref: 'CompanyProfile', default: null },
    rating: {
      type: Number,
      required: [true, 'A rating is required'],
      min: [1, 'Rating must be between 1 and 5'],
      max: [5, 'Rating must be between 1 and 5']
    },
    comment: { type: String, trim: true, default: '', maxlength: 1000 }
  },
  { timestamps: true }
);

reviewSchema.index({ student: 1, company: 1 }, { unique: true });
reviewSchema.index({ company: -1, rating: -1 });

module.exports = mongoose.models.Review || mongoose.model('Review', reviewSchema);