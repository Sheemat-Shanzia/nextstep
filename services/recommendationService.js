/**
 * services/recommendationService.js
 * ---------------------------------------------------------------------------
 * Skill based recommendation engine (bonus feature 2).
 *
 * Every approved / active / unexpired opportunity is scored against the
 * student's profile:
 *
 *      match% = |requiredSkills INTERSECT studentSkills| / |requiredSkills| * 100
 *
 * Skill proficiency nudges the score (an "expert" match counts a little more
 * than a "beginner" match) and a small bonus is added when the student's CGPA
 * already clears the post's minimum, both capped at 100%.
 */
'use strict';

const Opportunity = require('../models/Opportunity');
const StudentProfile = require('../models/StudentProfile');

const LEVEL_WEIGHT = { beginner: 1, intermediate: 2, advanced: 3, expert: 4 };
const CANDIDATE_LIMIT = 300;

/** Lower-case + trimmed skill name map with proficiency weights. */
function skillMap(profile) {
  const map = new Map();
  (profile?.skills || []).forEach((s) => {
    const key = String(s.name || '').trim().toLowerCase();
    if (!key) return;
    map.set(key, LEVEL_WEIGHT[s.level] || 2);
  });
  return map;
}

/**
 * Score a single opportunity against a skill map.
 * @param {object} opp  Opportunity document
 * @param {Map<string, number>} map
 * @param {number|null} cgpa
 * @returns {{opp:object, match:number, matchedSkills:string[], missingSkills:string[], eligible:boolean}}
 */
function scoreOpportunity(opp, map, cgpa) {
  const required = (opp.requiredSkills || []).filter(Boolean);
  const matchedSkills = [];
  const missingSkills = [];
  let earned = 0;
  let possible = 0;

  required.forEach((raw) => {
    const key = String(raw).trim().toLowerCase();
    possible += 2; // a "perfect" match for one required skill
    if (map.has(key)) {
      matchedSkills.push(raw);
      earned += LEVEL_WEIGHT[map.get(key)] || 2;
    } else {
      missingSkills.push(raw);
    }
  });

  let match = possible === 0 ? 35 : Math.round((earned / possible) * 100);

  // Small CGPA nudge, only when the student already meets the requirement.
  const eligible = cgpa === null || cgpa === undefined ? null : cgpa >= (opp.minCgpa || 0);
  if (eligible === true) match = Math.min(100, match + 5);

  return {
    opp,
    match: Math.max(0, Math.min(100, match)),
    matchedSkills,
    missingSkills,
    eligible
  };
}

/**
 * Recommended opportunities for a student.
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {{limit?:number, excludeIds?:Array, minMatch?:number}} [opts]
 * @returns {Promise<Array>}
 */
async function recommendForStudent(userId, { limit = 6, excludeIds = [], minMatch = 0 } = {}) {
  const profile = await StudentProfile.findOne({ user: userId }).lean();
  const map = skillMap(profile);
  const cgpa = profile ? profile.cgpa : null;

  const candidates = await Opportunity.find({
    status: 'approved',
    isActive: true,
    deadline: { $gt: new Date() },
    ...(excludeIds.length ? { _id: { $nin: excludeIds } } : {})
  })
    .select('title type company companyProfile companyNameCopy location mode duration stipend deadline category requiredSkills minCgpa tags views createdAt')
    .populate({ path: 'companyProfile', select: 'companyName logo verified' })
    .sort({ deadline: 1 })
    .limit(CANDIDATE_LIMIT)
    .lean();

  return candidates
    .map((opp) => scoreOpportunity(opp, map, cgpa))
    .filter((r) => r.match >= minMatch)
    .sort((a, b) => b.match - a.match || new Date(a.opp.deadline) - new Date(b.opp.deadline))
    .slice(0, limit)
    // Attach the score onto the opportunity itself so any card / view can
    // render the match percentage without extra plumbing.
    .map((r) => Object.assign(r.opp, { match: r.match, matchedSkills: r.matchedSkills, missingSkills: r.missingSkills }));
}

/**
 * "Jobs you match" - recommended opportunities the student has NOT applied to.
 * @param {string} userId
 * @param {{limit?:number, excludeIds?:Array}} [opts]
 */
async function recommendedOpportunities(userId, { limit = 6, excludeIds = [] } = {}) {
  return recommendForStudent(userId, { limit, excludeIds, minMatch: 1 });
}

/**
 * Opportunities the student has already applied to (used to exclude them from
 * the recommendations block).
 */
async function appliedOpportunityIds(userId) {
  const Application = require('../models/Application');
  const rows = await Application.find({ student: userId }).distinct('opportunity');
  return rows;
}

/**
 * Count how many of the student's skills are demanded by the market - used for
 * the "skill gap" insight on the student dashboard.
 * @param {string} userId
 */
async function skillDemandInsight(userId) {
  const profile = await StudentProfile.findOne({ user: userId }).lean();
  if (!profile || !(profile.skills || []).length) return { inDemand: [], totalOpenings: 0 };

  const names = profile.skills.map((s) => String(s.name || '').trim().toLowerCase()).filter(Boolean);
  if (!names.length) return { inDemand: [], totalOpenings: 0 };

  const rows = await Opportunity.aggregate([
    { $match: { status: 'approved', isActive: true, deadline: { $gt: new Date() } } },
    { $unwind: '$requiredSkills' },
    {
      $match: {
        requiredSkills: { $in: names.map((n) => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) }
      }
    },
    { $group: { _id: { skill: '$requiredSkills', title: '$title' }, openings: { $sum: '$openings' } } },
    { $group: { _id: '$_id.skill', openings: { $sum: '$openings' } } },
    { $sort: { openings: -1 } },
    { $limit: 8 }
  ]);

  return { inDemand: rows, totalOpenings: rows.reduce((s, r) => s + r.openings, 0) };
}

module.exports = { recommendForStudent, recommendedOpportunities, appliedOpportunityIds, skillDemandInsight, scoreOpportunity };