/**
 * models/StudentProfile.js
 * ---------------------------------------------------------------------------
 * Extended, student-only information. Exactly one profile per User document
 * (`user` is unique). The profile also stores the CV that is attached to
 * applications and any extra supporting documents.
 */
'use strict';

const mongoose = require('mongoose');

const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'];

const skillSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Skill name is required'],
      trim: true,
      maxlength: [60, 'Skill name is too long']
    },
    level: {
      type: String,
      enum: { values: SKILL_LEVELS, message: '{VALUE} is not a valid skill level' },
      default: 'intermediate'
    }
  },
  { _id: true }
);

const documentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    path: { type: String, required: true }, // filename inside uploads/documents
    originalName: { type: String, default: '' },
    size: { type: Number, default: 0 },
    mimeType: { type: String, default: '' },
    uploadedAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const educationSchema = new mongoose.Schema(
  {
    institution: { type: String, required: [true, 'Institution is required'], trim: true },
    degree: { type: String, trim: true, default: '' },
    fieldOfStudy: { type: String, trim: true, default: '' },
    startYear: { type: Number, min: 1900, max: 2100 },
    endYear: { type: Number, min: 1900, max: 2100 },
    grade: { type: String, trim: true, default: '' }, // e.g. "3.8/4.0"
    description: { type: String, trim: true, maxlength: 500, default: '' }
  },
  { _id: true }
);

const projectSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Project title is required'], trim: true },
    description: { type: String, trim: true, maxlength: 600, default: '' },
    technologies: { type: [String], default: [] },
    link: { type: String, trim: true, default: '' },
    startDate: { type: Date },
    endDate: { type: Date }
  },
  { _id: true }
);

const studentProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },

    // ---- personal -----------------------------------------------------------
    phone: { type: String, trim: true, default: '', maxlength: 25 },
    dateOfBirth: { type: Date, default: null },
    gender: {
      type: String,
      enum: { values: ['male', 'female', 'other', 'prefer-not-to-say'], message: '{VALUE} is not valid' },
      default: 'prefer-not-to-say'
    },
    address: { type: String, trim: true, default: '', maxlength: 300 },

    // ---- academic -----------------------------------------------------------
    university: { type: String, trim: true, default: '', maxlength: 160 },
    department: { type: String, trim: true, default: '', maxlength: 120 },
    degree: { type: String, trim: true, default: '', maxlength: 120 },
    currentSemester: { type: Number, min: 1, max: 12, default: null },
    cgpa: { type: Number, min: 0, max: 10, default: null },
    graduationYear: { type: Number, min: 1950, max: 2100, default: null },

    // ---- skills / interests -------------------------------------------------
    skills: {
      type: [skillSchema],
      default: [],
      validate: [(v) => v.length <= 30, 'You can add at most 30 skills']
    },
    interests: {
      type: [String],
      default: [],
      validate: [(v) => v.length <= 20, 'You can add at most 20 interests']
    },

    // ---- free text / links --------------------------------------------------
    bio: { type: String, trim: true, default: '', maxlength: 1200 },
    linkedin: { type: String, trim: true, default: '' },
    github: { type: String, trim: true, default: '' },
    portfolio: { type: String, trim: true, default: '' },

    // ---- files --------------------------------------------------------------
    cvPath: { type: String, default: '' }, // filename inside uploads/cv
    cvOriginalName: { type: String, default: '' },
    cvUploadedAt: { type: Date, default: null },
    documents: { type: [documentSchema], default: [] },

    // ---- nested collections -------------------------------------------------
    education: { type: [educationSchema], default: [] },
    projects: { type: [projectSchema], default: [] },

    // ---- computed -----------------------------------------------------------
    profileStrength: { type: Number, min: 0, max: 100, default: 0 }
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
studentProfileSchema.virtual('fullName').get(function fullName() {
  return this.user ? this.user.name : '';
});

studentProfileSchema.virtual('skillNames').get(function skillNames() {
  return (this.skills || []).map((s) => s.name);
});

/** Human readable CGPA (e.g. 3.62 -> "3.62 / 10"). */
studentProfileSchema.virtual('cgpaLabel').get(function cgpaLabel() {
  return this.cgpa === null || this.cgpa === undefined ? 'Not set' : `${this.cgpa} / 10`;
});

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------
studentProfileSchema.index({ university: 1, department: 1 });
studentProfileSchema.index({ cgpa: -1 });
studentProfileSchema.index({ 'skills.name': 1 });

/** Remove the nested `_id` noise when a profile is populated/returned. */
studentProfileSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    ['skills', 'documents', 'education', 'projects'].forEach((k) => {
      if (Array.isArray(ret[k])) ret[k].forEach((item) => delete item._id);
    });
    return ret;
  }
});

module.exports = mongoose.models.StudentProfile || mongoose.model('StudentProfile', studentProfileSchema);
module.exports.SKILL_LEVELS = SKILL_LEVELS;