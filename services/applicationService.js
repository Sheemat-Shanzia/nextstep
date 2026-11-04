/**
 * services/applicationService.js
 * ---------------------------------------------------------------------------
 * Business rules that surround the `applications` collection:
 *
 *   - creating an application  (FR-11):  visibility, deadline, duplicate block
 *   - changing the status      (FR-18):  statusHistory + student notification
 *   - withdrawing              (bonus 9)
 *
 * Controllers stay thin because all of the rules live here.
 */
'use strict';

const Application = require('../models/Application');
const Opportunity = require('../models/Opportunity');
const StudentProfile = require('../models/StudentProfile');
const { notify } = require('../utils/notify');

/** Human readable labels for notification messages. */
const STATUS_LABEL = {
  submitted: 'Submitted',
  under_review: 'Under review',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  accepted: 'Accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn'
};

/** Which statuses a company is allowed to set. */
const COMPANY_SETTABLE = ['under_review', 'shortlisted', 'interview', 'accepted', 'rejected'];

/**
 * Create an application after checking every rule.
 *
 * @param {{
 *   studentUserId: string,
 *   opportunityId: string,
 *   coverLetter: string,
 *   answers?: Array<{question:string, answer:string}>,
 *   cvPath?: string, cvOriginalName?: string, cvSource?: 'profile'|'upload',
 *   documents?: Array<object>
 * }} payload
 * @returns {Promise<{application?:object, error?:string, code?:string}>}
 */
async function createApplication(payload) {
  const {
    studentUserId,
    opportunityId,
    coverLetter,
    answers = [],
    cvPath = '',
    cvOriginalName = '',
    cvSource = 'upload',
    documents = []
  } = payload;

  // ---- 1. the opportunity must still exist -------------------------------
  const opportunity = await Opportunity.findById(opportunityId);
  if (!opportunity) return { error: 'That opportunity no longer exists.', code: 'notfound' };

  // ---- 2. only approved + active posts accept applications ---------------
  if (opportunity.status !== 'approved') {
    return { error: 'This opportunity is not currently accepting applications.', code: 'forbidden' };
  }
  if (!opportunity.isActive) {
    return { error: 'This opportunity has been closed by the company.', code: 'closed' };
  }

  // ---- 3. deadline enforcement ------------------------------------------
  if (opportunity.isExpired) {
    return { error: 'The application deadline for this opportunity has passed.', code: 'expired' };
  }

  // ---- 4. duplicate protection ------------------------------------------
  const existing = await Application.findOne({ student: studentUserId, opportunity: opportunityId });
  if (existing) {
    return { error: 'You have already applied to this opportunity.', code: 'duplicate', application: existing };
  }

  // ---- 5. a CV is mandatory ---------------------------------------------
  let finalCvPath = cvPath;
  if (!finalCvPath) {
    const profile = await StudentProfile.findOne({ user: studentUserId }).lean();
    finalCvPath = profile ? profile.cvPath : '';
  }
  if (!finalCvPath) {
    return { error: 'Please upload a CV before applying.', code: 'nocv' };
  }

  // ---- 6. create ---------------------------------------------------------
  try {
    const application = await Application.create({
      student: studentUserId,
      opportunity: opportunity._id,
      company: opportunity.company,
      coverLetter,
      answers: answers.filter((a) => String(a.question || '').trim() && String(a.answer || '').trim()),
      cvPath: finalCvPath,
      cvOriginalName,
      cvSource,
      documents,
      status: 'submitted',
      appliedAt: new Date(),
      statusHistory: [
        {
          status: 'submitted',
          changedAt: new Date(),
          changedBy: studentUserId,
          note: 'Application submitted'
        }
      ]
    });

    // ---- 7. notify the company -------------------------------------------
    const student = await StudentProfile.findOne({ user: studentUserId }).select('user').populate('user', 'name');
    await notify(opportunity.company, {
      title: 'New applicant',
      message: `${student && student.user ? student.user.name : 'A student'} applied to "${opportunity.title}".`,
      type: 'application',
      link: `/company/applications/${application._id}`
    });

    return { application, opportunity };
  } catch (err) {
    // The unique compound index is the last line of defence against duplicates.
    if (err.code === 11000) {
      return { error: 'You have already applied to this opportunity.', code: 'duplicate' };
    }
    throw err;
  }
}

/**
 * Change an application status (company side) with an audit trail and a
 * notification for the student.
 *
 * @param {Application} application
 * @param {{status:string, note?:string, changedBy:string}} payload
 * @returns {Promise<{application:object, label:string}>}
 */
async function changeStatus(application, { status, note = '', changedBy }) {
  const previous = application.status;
  application.status = status;
  if (note) application.companyNote = note;

  application.statusHistory.push({
    status,
    changedAt: new Date(),
    changedBy,
    note: note || `Changed from "${STATUS_LABEL[previous] || previous}" to "${STATUS_LABEL[status] || status}"`
  });

  await application.save();

  const opportunity = await Opportunity.findById(application.opportunity).select('title');

  await notify(application.student, {
    title: `Application ${STATUS_LABEL[status] || status}`,
    message: `Your application for "${opportunity ? opportunity.title : 'an opportunity'}" is now marked as "${
      STATUS_LABEL[status] || status
    }".${note ? ` Note: ${note}` : ''}`,
    type: 'status',
    link: `/student/applications/${application._id}`
  });

  return { application, previous, label: STATUS_LABEL[status] || status };
}

/**
 * Withdraw an application (student side).
 * @param {Application} application
 * @param {{changedBy:string, note?:string}} payload
 */
async function withdrawApplication(application, { changedBy, note = 'Withdrawn by the student' }) {
  application.status = 'withdrawn';
  application.statusHistory.push({ status: 'withdrawn', changedAt: new Date(), changedBy, note });
  await application.save();

  const opportunity = await Opportunity.findById(application.opportunity).select('title');
  await notify(application.company, {
    title: 'Application withdrawn',
    message: `A student withdrew their application for "${opportunity ? opportunity.title : 'an opportunity'}".`,
    type: 'application',
    link: `/company/applications/${application._id}`
  });

  return application;
}

/**
 * Bulk status change from the company applicant table.
 * @param {string[]} ids
 * @param {{status:string, note?:string, changedBy:string}} payload
 */
async function bulkChangeStatus(ids, { status, note = '', changedBy }) {
  const applications = await Application.find({ _id: { $in: ids } });
  const results = [];
  for (const app of applications) {
    // eslint-disable-next-line no-await-in-loop
    await changeStatus(app, { status, note, changedBy });
    results.push(app._id.toString());
  }
  return results;
}

module.exports = {
  createApplication,
  changeStatus,
  withdrawApplication,
  bulkChangeStatus,
  STATUS_LABEL,
  COMPANY_SETTABLE
};