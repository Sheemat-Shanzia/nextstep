/**
 * utils/profileStrength.js
 * ---------------------------------------------------------------------------
 * Computes the student "profile strength" percentage shown as a progress bar
 * on the profile page and on the student dashboard (FR-03).
 *
 * The calculation is a weighted checklist: every item has a weight, the score
 * is `earned / total * 100`, so the maximum is always exactly 100%.
 * The same checklist drives the "complete your profile" hints.
 */
'use strict';

/**
 * @typedef {Object} ProfileItem
 * @property {string} label   - what the student should do
 * @property {number} weight  - how much it is worth
 * @property {number} earned  - 0 .. weight
 * @property {boolean} done
 */

/**
 * Build the checklist for one student profile.
 * @param {object} profile  StudentProfile document or plain object
 * @param {object} [user]   owning User document (for the name check)
 * @returns {{items: ProfileItem[], percentage: number, level: string, levelColor: string, missing: string[]}}
 */
function buildProfileChecklist(profile, user = {}) {
  const p = profile || {};
  const filled = (v) => typeof v === 'string' ? v.trim().length > 0 : Boolean(v);
  const skills = Array.isArray(p.skills) ? p.skills : [];

  /** @type {ProfileItem[]} */
  const items = [
    { label: 'Add your full name', weight: 5, earned: filled(user.name) || filled(p.user?.name) ? 5 : 0 },
    { label: 'Add a phone number', weight: 4, earned: filled(p.phone) ? 4 : 0 },
    { label: 'Add your date of birth', weight: 3, earned: p.dateOfBirth ? 3 : 0 },
    { label: 'Tell us your gender', weight: 2, earned: p.gender && p.gender !== 'prefer-not-to-say' ? 2 : 0 },
    { label: 'Add your address', weight: 3, earned: filled(p.address) ? 3 : 0 },

    { label: 'Name your university', weight: 7, earned: filled(p.university) ? 7 : 0 },
    { label: 'Add your department', weight: 5, earned: filled(p.department) ? 5 : 0 },
    { label: 'Add your degree', weight: 5, earned: filled(p.degree) ? 5 : 0 },
    { label: 'Add your current semester', weight: 4, earned: p.currentSemester ? 4 : 0 },
    { label: 'Add your CGPA', weight: 5, earned: p.cgpa !== null && p.cgpa !== undefined ? 5 : 0 },
    { label: 'Add your graduation year', weight: 3, earned: p.graduationYear ? 3 : 0 },

    {
      label: 'Add at least 3 skills',
      weight: 10,
      earned: skills.length >= 5 ? 10 : skills.length >= 3 ? 8 : skills.length >= 1 ? 5 : 0
    },
    { label: 'Write a short bio (40+ characters)', weight: 8, earned: filled(p.bio) && p.bio.length >= 40 ? 8 : 0 },
    { label: 'Upload your CV', weight: 10, earned: filled(p.cvPath) ? 10 : 0 },

    {
      label: 'Link a professional profile (LinkedIn / GitHub / portfolio)',
      weight: 4,
      earned: [p.linkedin, p.github, p.portfolio].filter(filled).length >= 2 ? 4 : [p.linkedin, p.github, p.portfolio].filter(filled).length === 1 ? 2 : 0
    },
    { label: 'Add an education entry', weight: 6, earned: (p.education || []).length ? 6 : 0 },
    { label: 'Add a project', weight: 6, earned: (p.projects || []).length ? 6 : 0 },
    { label: 'Attach a supporting document', weight: 4, earned: (p.documents || []).length ? 4 : 0 },
    { label: 'Add your interests', weight: 3, earned: (p.interests || []).length ? 3 : 0 }
  ];

  const total = items.reduce((s, i) => s + i.weight, 0);
  const earned = items.reduce((s, i) => s + i.earned, 0);
  const percentage = Math.max(0, Math.min(100, Math.round((earned / total) * 100)));

  let level = 'Very weak';
  let levelColor = 'danger';
  if (percentage >= 90) { level = 'Excellent'; levelColor = 'success'; }
  else if (percentage >= 70) { level = 'Strong'; levelColor = 'success'; }
  else if (percentage >= 45) { level = 'Good'; levelColor = 'info'; }
  else if (percentage >= 20) { level = 'Weak'; levelColor = 'warning'; }

  return {
    items,
    percentage,
    level,
    levelColor,
    missing: items.filter((i) => i.earned < i.weight).map((i) => i.label)
  };
}

/**
 * Convenience wrapper that also returns the strength to persist.
 * @param {object} profile
 * @param {object} [user]
 */
function computeProfileStrength(profile, user) {
  const result = buildProfileChecklist(profile, user);
  return { ...result, profileStrength: result.percentage };
}

module.exports = { buildProfileChecklist, computeProfileStrength };