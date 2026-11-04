/**
 * models/User.js
 * ---------------------------------------------------------------------------
 * The single authentication collection for the whole system.
 * Students, companies and administrators all live here and are discriminated
 * by the `role` field. Profile details live in the dedicated profile
 * collections which reference this document.
 */
'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [120, 'Name cannot be longer than 120 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address']
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters long'],
      select: false // never returned by default
    },
    role: {
      type: String,
      enum: {
        values: ['student', 'company', 'admin'],
        message: '{VALUE} is not a valid role'
      },
      default: 'student',
      index: true
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'suspended', 'pending'],
        message: '{VALUE} is not a valid status'
      },
      default: 'active',
      index: true
    },
    isEmailVerified: { type: Boolean, default: false },
    lastLogin: { type: Date, default: null },
    avatar: { type: String, default: '' },

    // Password reset (forgot password) - token is stored hashed.
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null }
  },
  {
    timestamps: true, // adds createdAt / updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ---------------------------------------------------------------------------
// Virtuals
// ---------------------------------------------------------------------------
userSchema.virtual('initials').get(function initials() {
  return String(this.name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
});

// ---------------------------------------------------------------------------
// Indexes (compound, high value for the admin user table)
// ---------------------------------------------------------------------------
userSchema.index({ role: 1, status: 1, createdAt: -1 });
userSchema.index({ name: 'text', email: 'text' });

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------
/** Hash the password whenever it is set or changed. */
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
  } catch (err) {
    return next(err);
  }
});

/** Instance helper: compare a plain-text password with the stored hash. */
userSchema.methods.matchPassword = function matchPassword(plain) {
  return bcrypt.compare(plain, this.password);
};

/** Remove sensitive fields before sending a user to the browser. */
userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    status: this.status,
    initials: this.initials,
    avatar: this.avatar
  };
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);