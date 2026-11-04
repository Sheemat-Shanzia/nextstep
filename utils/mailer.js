/**
 * utils/mailer.js
 * ---------------------------------------------------------------------------
 * Optional e-mail delivery through Nodemailer.
 *
 * The app must start and work completely offline, therefore:
 *   - when SMTP_HOST is not configured we do NOT create a transport;
 *   - every message is printed to the server console instead;
 *   - with DEV_SHOW_RESET_LINK=true the password reset link is printed in a
 *     clearly marked block so it can be copied during local development.
 *
 * No function in here ever throws - a mail failure is logged, not fatal.
 */
'use strict';

const nodemailer = require('nodemailer');

const isSmtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
const showResetLink = String(process.env.DEV_SHOW_RESET_LINK || 'true').toLowerCase() === 'true';

let transporter = null;
if (isSmtpConfigured) {
  try {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: String(process.env.SMTP_SECURE || 'false') === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 8000
    });
    console.log(`[mailer] SMTP enabled -> ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}`);
  } catch (err) {
    console.warn(`[mailer] could not initialise SMTP (${err.message}); falling back to console output.`);
    transporter = null;
  }
} else {
  console.log('[mailer] SMTP not configured - e-mails will be printed to the console.');
}

const FROM = process.env.SMTP_FROM || 'ISMS <no-reply@isms.local>';

/** Print a message to the console instead of sending it. */
function printToConsole(subject, body) {
  const line = '='.repeat(72);
  // eslint-disable-next-line no-console
  console.log(`\n${line}\n[mailer] EMAIL (console fallback)\n  Subject: ${subject}\n${line}\n${body}\n${line}\n`);
}

/**
 * Send a plain-text e-mail.
 * @param {{to:string, subject:string, text:string, html?:string}} mail
 * @returns {Promise<{delivered:boolean, reason?:string}>}
 */
async function sendMail({ to, subject, text, html }) {
  if (!transporter) {
    printToConsole(`${subject} -> ${to}`, text);
    return { delivered: false, reason: 'console-fallback' };
  }
  try {
    await transporter.sendMail({ from: FROM, to, subject, text, html });
    // eslint-disable-next-line no-console
    console.log(`[mailer] sent "${subject}" to ${to}`);
    return { delivered: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[mailer] send failed for ${to}: ${err.message}`);
    printToConsole(`${subject} -> ${to}`, text);
    return { delivered: false, reason: err.message };
  }
}

/**
 * Password reset e-mail (bonus feature 4). Returns the reset link so the
 * controller can also show it on screen in development mode.
 * @param {{email:string, name:string, resetUrl:string}} args
 */
async function sendPasswordResetEmail({ email, name, resetUrl }) {
  const subject = 'ISMS - Password reset requested';
  const text = [
    `Hi ${name},`,
    '',
    'We received a request to reset the password for your ISMS account.',
    'Open the link below (valid for 1 hour) to choose a new password:',
    '',
    resetUrl,
    '',
    'If you did not request this, you can safely ignore this e-mail.',
    '',
    '-- ISMS Support'
  ].join('\n');

  await sendMail({ to: email, subject, text });

  if (showResetLink) {
    const line = '='.repeat(72);
    // eslint-disable-next-line no-console
    console.log(`\n${line}\n[mailer] PASSWORD RESET LINK (dev mode)\n  for: ${email}\n  ${resetUrl}\n${line}\n`);
  }

  return resetUrl;
}

module.exports = { sendMail, sendPasswordResetEmail, isSmtpConfigured, showResetLink };