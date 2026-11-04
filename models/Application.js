/**
 * models/Application.js
 * ---------------------------------------------------------------------------
 * A student's submission for one opportunity.
 *
 * Integrity rules:
 *   - a student may apply only once per opportunity (unique compound index)
 *   - every status change is appended to `statusHistory` so the timeline can
 *     be rebuilt without an audit-log service
 */
'use strict';

const mongoose = require('mongoose');

const APPLICATION_STATUSES = [
  'submitted',
  'under_review',
  'shortlisted',
  'interview',
  'accepted',
  'rejected',
  'withdrawn'
];

const attachedDocumentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, default: 'Supporting document' },
    path: { type: String, required: true },
    originalName: { type: String, default: '' },
    size: { type: Number, default: 0 },
    mimeType: { type: String, default: '' },
    uploadedAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const answerSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true, maxlength: 300 },
    answer: { type: String, required: true, trim: true, maxlength: 2000 }
  },
  { _id: true }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: { values: APPLICATION_STATUSES, message: '{VALUE} is not a valid application status' },
      required: true
    },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, trim: true, default: '', maxlength: 1000 }
  },
  { _id: true }
);

const applicationSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A student is required'],
      index: true
    },
    opportunity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Opportunity',
      required: [true, 'An opportunity is required'],
      index: true
    },
    /** Convenience ref so company queries never need a join. */
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    coverLetter: {
      type: String,
      required: [true, 'A cover letter is required'],
      trim: true,
      minlength: [20, 'Your cover letter must be at least 20 characters long'],
      maxlength: [5000, 'Cover letter cannot be longer than 5000 characters']
    },
    answers: { type: [answerSchema], default: [] },

    /** Which CV was sent: either the profile CV or a freshly uploaded one. */
    cvPath: { type: String, default: '' },
    cvOriginalName: { type: String, default: '' },
    cvSource: { type: String, enum: ['profile', 'upload'], default: 'upload' },
    documents: { type: [attachedDocumentSchema], default: [] },

    status: {
      type: String,
      enum: { values: APPLICATION_STATUSES, message: '{VALUE} is not a valid application status' },
      default: 'submitted',
      index: true
    },
    companyNote: { type: String, trim: true, default: '', maxlength: 2000 },

    statusHistory: { type: [statusHistorySchema], default: [] },
    appliedAt: { type: Date, default: Date.now, index: true }
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
applicationSchema.virtual('studentName').get(function studentName() {
  return this.student ? this.student.name : 'Unknown student';
});

applicationSchema.virtual('statusLabel').get(function statusLabel() {
  return String(this.status || '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
});

/** The application is still "in play" (not rejected / withdrawn). */
applicationSchema.virtual('isActive').get(function isActive() {
  return !['rejected', 'withdrawn'].includes(this.status);
});

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------
// Duplicate protection (FR-11) - the database itself blocks a second apply.
applicationSchema.index({ student: 1, opportunity: 1 }, { unique: true });

// Dashboards / applicant lists.
applicationSchema.index({ company: 1, status: 1, appliedAt: -1 });
applicationSchema.index({ opportunity: 1, appliedAt: -1 });

// Seed / tracking
applicationSchema.pre('save', function seedHistory(next) {
  if (this.isNew && (!this.statusHistory || this.statusHistory.length === 0)) {
    this.statusHistory.push({
      status: this.status || 'submitted',
      changedAt: this.appliedAt || new Date(),
      changedBy: this.student,
      note: 'Application submitted'
    });
  }
  next();
});

applicationSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    ['answers', 'documents', 'statusHistory'].forEach((k) => {
      if (Array.isArray(ret[k])) ret[k].forEach((item) => delete item._id);
    });
    return ret;
  }
});

module.exports = mongoose.models.Application || mongoose.model('Application', applicationSchema);
module.exports.APPLICATION_STATUSES = APPLICATION_STATUSES;