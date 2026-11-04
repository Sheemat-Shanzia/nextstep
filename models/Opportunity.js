/**
 * models/Opportunity.js
 * ---------------------------------------------------------------------------
 * The heart of the platform: every internship and scholarship post.
 *
 * Lifecycle:  company creates it (status = pending)
 *          -> admin approves  (status = approved, isActive = true)
 *          -> students can browse / apply
 *          -> admin can reject  (status = rejected + rejectionReason)
 *
 * The company name is copied onto the post (`companyNameCopy`) so that the
 * text index also matches company names during a keyword search.
 */
'use strict';

const mongoose = require('mongoose');

const OPPORTUNITY_TYPES = ['internship', 'scholarship'];
const WORK_MODES = ['onsite', 'remote', 'hybrid'];
const MODERATION_STATUSES = ['pending', 'approved', 'rejected'];

const opportunitySchema = new mongoose.Schema(
  {
    // ---- ownership ----------------------------------------------------------
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A company user is required'],
      index: true
    },
    companyProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CompanyProfile',
      default: null
    },
    /** Denormalised copy of the company name - searchable + sortable. */
    companyNameCopy: { type: String, required: true, trim: true },

    // ---- content ------------------------------------------------------------
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [180, 'Title cannot be longer than 180 characters']
    },
    type: {
      type: String,
      required: [true, 'Opportunity type is required'],
      enum: { values: OPPORTUNITY_TYPES, message: '{VALUE} must be either internship or scholarship' },
      index: true
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      minlength: [30, 'Description must be at least 30 characters long'],
      maxlength: [8000, 'Description cannot be longer than 8000 characters']
    },
    requirements: { type: String, trim: true, default: '', maxlength: 5000 },

    // ---- logistics ----------------------------------------------------------
    location: { type: String, required: [true, 'Location is required'], trim: true, maxlength: 160 },
    mode: {
      type: String,
      enum: { values: WORK_MODES, message: '{VALUE} must be onsite, remote or hybrid' },
      default: 'onsite'
    },
    duration: { type: String, trim: true, default: '', maxlength: 120 }, // e.g. "3 months"
    /** Internship -> monthly stipend (number). Scholarship -> total award. */
    stipend: { type: Number, min: 0, max: 100000000, default: 0 },
    openings: { type: Number, min: 1, max: 10000, default: 1 },
    category: { type: String, trim: true, default: 'General', maxlength: 80 },

    deadline: {
      type: Date,
      required: [true, 'Application deadline is required'],
      index: true
    },

    // ---- matching -----------------------------------------------------------
    requiredSkills: {
      type: [String],
      default: [],
      validate: [(v) => v.length <= 25, 'You can list at most 25 required skills']
    },
    minCgpa: { type: Number, min: 0, max: 10, default: 0 },
    tags: { type: [String], default: [] },

    // ---- moderation ---------------------------------------------------------
    status: {
      type: String,
      enum: { values: MODERATION_STATUSES, message: '{VALUE} must be pending, approved or rejected' },
      default: 'pending',
      index: true
    },
    rejectionReason: { type: String, trim: true, default: '', maxlength: 1000 },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },

    // ---- metrics ------------------------------------------------------------
    views: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true, index: true }
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
/** True once the deadline has passed - computed, never needs a cron job. */
opportunitySchema.virtual('isExpired').get(function isExpired() {
  return Boolean(this.deadline && this.deadline.getTime() < Date.now());
});

/** Whole days left before the deadline (negative when expired). */
opportunitySchema.virtual('daysLeft').get(function daysLeft() {
  if (!this.deadline) return 0;
  const ms = new Date(this.deadline).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
});

/** "Closing soon" - 3 days or less left and still open. */
opportunitySchema.virtual('isClosingSoon').get(function isClosingSoon() {
  const d = this.daysLeft;
  return !this.isExpired && d <= 3;
});

/** A student can only ever see approved + active + unexpired posts. */
opportunitySchema.virtual('isVisibleToStudents').get(function isVisibleToStudents() {
  return this.status === 'approved' && this.isActive === true && !this.isExpired;
});

opportunitySchema.virtual('typeLabel').get(function typeLabel() {
  return this.type === 'internship' ? 'Internship' : 'Scholarship';
});

opportunitySchema.virtual('stipendLabel').get(function stipendLabel() {
  if (!this.stipend) return this.type === 'scholarship' ? 'Not specified' : 'Unpaid';
  return this.type === 'scholarship'
    ? `${this.stipend.toLocaleString()} (total award)`
    : `${this.stipend.toLocaleString()} / month`;
});

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------
// 1) Full text index used by the keyword search (FR-05).
opportunitySchema.index(
  {
    title: 'text',
    description: 'text',
    requirements: 'text',
    requiredSkills: 'text',
    tags: 'text',
    companyNameCopy: 'text'
  },
  {
    name: 'opportunity_text_index',
    weights: { title: 10, companyNameCopy: 8, requiredSkills: 5, tags: 4, description: 2, requirements: 1 }
  }
);

// 2) The query used on almost every page: approved + active + not expired.
opportunitySchema.index({ status: 1, isActive: 1, deadline: 1 });

// 3) Admin moderation queue + company listing.
opportunitySchema.index({ status: 1, createdAt: -1 });
opportunitySchema.index({ company: 1, createdAt: -1 });

// 4) Faceted filters.
opportunitySchema.index({ type: 1, mode: 1, category: 1, deadline: 1 });
opportunitySchema.index({ views: -1 });
opportunitySchema.index({ stipend: 1 });

module.exports = mongoose.models.Opportunity || mongoose.model('Opportunity', opportunitySchema);
module.exports.OPPORTUNITY_TYPES = OPPORTUNITY_TYPES;
module.exports.WORK_MODES = WORK_MODES;
module.exports.MODERATION_STATUSES = MODERATION_STATUSES;