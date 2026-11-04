/**
 * utils/format.js
 * ---------------------------------------------------------------------------
 * Small presentation helpers shared by the EJS views so that formatting logic
 * never leaks into templates.
 */
'use strict';

/** '12 Mar 2026' */
function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** '12 Mar 2026, 14:05' */
function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString(
    'en-GB',
    { hour: '2-digit', minute: '2-digit' }
  )}`;
}

/** '3 hours ago' / 'in 2 days' */
function timeAgo(value) {
  if (!value) return '-';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '-';
  const diff = Date.now() - then;
  const future = diff < 0;
  const abs = Math.abs(diff);

  const units = [
    [1000, 'second'],
    [60 * 1000, 'minute'],
    [60 * 60 * 1000, 'hour'],
    [24 * 60 * 60 * 1000, 'day'],
    [7 * 24 * 60 * 60 * 1000, 'week'],
    [30 * 24 * 60 * 60 * 1000, 'month'],
    [365 * 24 * 60 * 60 * 1000, 'year']
  ];

  let label = 'a moment';
  if (abs >= units[units.length - 1][0]) {
    label = `${Math.floor(abs / units[units.length - 1][0])} year${Math.floor(abs / units[units.length - 1][0]) === 1 ? '' : 's'}`;
  } else {
    for (let i = 0; i < units.length; i += 1) {
      const [ms, name] = units[i];
      const next = units[i + 1];
      if (abs < ms && i === 0) { label = 'a moment'; break; }
      if (abs < (next ? next[0] : Infinity)) {
        const n = Math.max(1, Math.floor(abs / ms));
        label = `${n} ${name}${n === 1 ? '' : 's'}`;
        break;
      }
    }
  }
  return future ? `in ${label}` : `${label} ago`;
}

/** Number formatting used for stipend / amounts. */
function formatNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US');
}

/** Truncate long text for card previews. */
function truncate(text, len = 160) {
  const s = String(text || '');
  return s.length > len ? `${s.slice(0, len).trimEnd()}...` : s;
}

/** Bootstrap badge class for an opportunity moderation status. */
const OPPORTUNITY_STATUS_BADGE = {
  pending: 'bg-warning text-dark',
  approved: 'bg-success',
  rejected: 'bg-danger'
};

/** Bootstrap badge class for an application status. */
const APPLICATION_STATUS_BADGE = {
  submitted: 'bg-secondary',
  under_review: 'bg-info text-dark',
  shortlisted: 'bg-primary',
  interview: 'bg-dark',
  accepted: 'bg-success',
  rejected: 'bg-danger',
  withdrawn: 'bg-secondary'
};

/** Human label for an application status. */
function applicationStatusLabel(status) {
  return String(status || '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Icon used by the status badge. */
const APPLICATION_STATUS_ICON = {
  submitted: 'bi-send',
  under_review: 'bi-hourglass-split',
  shortlisted: 'bi-list-check',
  interview: 'bi-camera-video',
  accepted: 'bi-check-circle-fill',
  rejected: 'bi-x-circle-fill',
  withdrawn: 'bi-arrow-counterclockwise'
};

/** Badge colour for the "N days left" chip. */
function deadlineBadge(daysLeft) {
  if (daysLeft < 0) return { text: 'Expired', className: 'bg-secondary' };
  if (daysLeft === 0) return { text: 'Closes today', className: 'bg-danger' };
  if (daysLeft <= 3) return { text: `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`, className: 'bg-danger' };
  if (daysLeft <= 7) return { text: `${daysLeft} days left`, className: 'bg-warning text-dark' };
  if (daysLeft <= 30) return { text: `${daysLeft} days left`, className: 'bg-info text-dark' };
  return { text: `${daysLeft} days left`, className: 'bg-light text-dark border' };
}

module.exports = {
  formatDate,
  formatDateTime,
  timeAgo,
  formatNumber,
  truncate,
  OPPORTUNITY_STATUS_BADGE,
  APPLICATION_STATUS_BADGE,
  APPLICATION_STATUS_ICON,
  applicationStatusLabel,
  deadlineBadge
};