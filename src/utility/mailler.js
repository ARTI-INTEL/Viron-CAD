/**
 * mailler.js  Ultimate CAD – Email Utility
 * Wraps nodemailer with simple helpers for transactional emails.
 * Falls back to console logging in development when no SMTP is configured.
 */

import nodemailer from 'nodemailer';
import { logInfo } from './logger.js';

const FROM_ADDRESS = process.env.SMTP_FROM || '"Ultimate CAD" <noreply@ultimatecad.com>';

/**
 * Build a nodemailer transporter from environment variables.
 * Returns null when SMTP_HOST is not set (dev / test environments).
 */
function createTransporter() {
  if (!process.env.SMTP_HOST) return null;

  return nodemailer.createTransport({
    host   : process.env.SMTP_HOST,
    port   : Number(process.env.SMTP_PORT) || 587,
    secure : process.env.SMTP_SECURE === 'true',
    auth   : {
      user : process.env.SMTP_USER,
      pass : process.env.SMTP_PASS,
    },
  });
}

/**
 * Send a 6-digit verification code to a user's email address.
 *
 * @param {string} email   – Recipient address
 * @param {string} code    – 6-digit verification code
 * @param {string} action  – Context label, e.g. 'delete_server_5'
 */
export async function sendVerificationCode(email, code, action) {
  const transporter = createTransporter();

  if (!transporter) {
    logInfo(`[DEV] No SMTP configured. Verification code for ${email} (${action}): ${code}`, 'Mailer');
    return;
  }

  await transporter.sendMail({
    from    : FROM_ADDRESS,
    to      : email,
    subject : 'Ultimate CAD – Verification Code',
    text    : [
      `Your verification code is: ${code}`,
      '',
      'This code expires in 10 minutes.',
      '',
      'If you did not request this, ignore this email.',
    ].join('\n'),
    html : `
      <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;
                  padding:2rem;background:#1a1a1a;border-radius:12px;color:#fff;">
        <h2 style="margin:0 0 1rem;font-size:1.5rem;color:#ffffff;">Ultimate CAD</h2>
        <p style="margin:0 0 1.5rem;color:rgba(255,255,255,0.65);">
          Here is your verification code:
        </p>
        <div style="background:#222222;border-radius:8px;padding:1.5rem;
                    text-align:center;margin-bottom:1.5rem;letter-spacing:0.45em;">
          <span style="font-size:2.25rem;font-weight:700;color:#ffffff;">
            ${code}
          </span>
        </div>
        <p style="margin:0 0 0.5rem;font-size:0.875rem;color:rgba(255,255,255,0.4);">
          This code expires in 10&nbsp;minutes.
        </p>
        <p style="margin:0;font-size:0.875rem;color:rgba(255,255,255,0.25);">
          If you did not request this, you can safely ignore this email.
        </p>
      </div>`,
  });

  logInfo(`Verification email sent to ${email} (${action})`, 'Mailer');
}

/**
 * Generic send-mail helper for arbitrary payloads.
 *
 * @param {{ to: string, subject: string, text?: string, html?: string }} opts
 */
export async function sendMail({ to, subject, text, html }) {
  const transporter = createTransporter();

  if (!transporter) {
    logInfo(`[DEV] No SMTP configured. Would have sent "${subject}" to ${to}.`, 'Mailer');
    return;
  }

  await transporter.sendMail({ from: FROM_ADDRESS, to, subject, text, html });
  logInfo(`Email sent: "${subject}" to ${to}`, 'Mailer');
}
