/**
 * models/CompanyProfile.js
 * ---------------------------------------------------------------------------
 * Company / organisation specific information. One profile per User document.
 * `companyName` is denormalised onto the Opportunity document as `companyNameCopy`
 * so that the text index can search on the company name as well.
 */
'use strict';

const mongoose = require('mongoose');

const companyProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },

    companyName: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
      maxlength: [160, 'Company name is too long']
    },
    industry: { type: String, trim: true, default: '', maxlength: 120 },
    website: { type: String, trim: true, default: '' },
    location: { type: String, trim: true, default: '', maxlength: 160 },
    size: {
      type: String,
      enum: {
        values: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'],
        message: '{VALUE} is not a valid company size'
      },
      default: '1-10'
    },
    description: { type: String, trim: true, default: '', maxlength: 3000 },

    logo: { type: String, default: '' }, // filename inside uploads/logos
    logoOriginalName: { type: String, default: '' },
    logoUploadedAt: { type: Date, default: null },

    contactPerson: { type: String, trim: true, default: '', maxlength: 120 },
    contactPhone: { type: String, trim: true, default: '', maxlength: 25 },

    /** Set by an administrator - shows a "Verified" badge in the UI. */
    verified: { type: Boolean, default: false, index: true },

    // Cached aggregate so the public company page does not need a full pipeline.
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ---------------------------------------------------------------------------
// Virtuals
// ---------------------------------------------------------------------------
companyProfileSchema.virtual('initial').get(function initial() {
  return (this.companyName || '?').trim().charAt(0).toUpperCase();
});

companyProfileSchema.virtual('ratingStars').get(function ratingStars() {
  return Math.round(this.averageRating || 0);
});

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------
companyProfileSchema.index({ companyName: 'text', industry: 'text', description: 'text' });
companyProfileSchema.index({ verified: -1, createdAt: -1 });

module.exports = mongoose.models.CompanyProfile || mongoose.model('CompanyProfile', companyProfileSchema);