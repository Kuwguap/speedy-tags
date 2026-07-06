/**
 * SendGrid mailer — single sendEmail() used by every app/bot.
 * Replaces the per-app Resend usage. No-ops with a warning when
 * SENDGRID_API_KEY is unset (keeps local dev unblocked).
 *
 * Env: SENDGRID_API_KEY, SENDGRID_FROM (verified sender), APP_NAME (optional).
 */

import sgMail from "@sendgrid/mail";

const API_KEY = process.env.SENDGRID_API_KEY || "";
const FROM = process.env.SENDGRID_FROM || "no-reply@njtemporarytag.com";
const FROM_NAME = process.env.APP_NAME || "NJ Temporary Tag";

if (API_KEY) sgMail.setApiKey(API_KEY);

/**
 * @param {object} msg
 * @param {string|string[]} msg.to
 * @param {string} msg.subject
 * @param {string} msg.html
 * @param {string} [msg.text]
 * @param {Array<{filename:string, content:Uint8Array|Buffer, type?:string}>} [msg.attachments]
 * @returns {Promise<boolean>} true if actually dispatched.
 */
export async function sendEmail({ to, subject, html, text, attachments = [] }) {
  if (!API_KEY) {
    console.warn(`[mailer] SENDGRID_API_KEY not set — skipped email "${subject}" to ${to}`);
    return false;
  }
  const recipients = (Array.isArray(to) ? to : [to])
    .map((t) => String(t || "").trim())
    .filter((t) => t.includes("@"));
  if (recipients.length === 0) {
    console.warn(`[mailer] no valid recipient for "${subject}"`);
    return false;
  }

  const msg = {
    to: recipients,
    from: { email: FROM, name: FROM_NAME },
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  };

  if (attachments.length > 0) {
    msg.attachments = attachments.map((a) => ({
      filename: a.filename,
      type: a.type || "application/pdf",
      disposition: "attachment",
      content: Buffer.from(a.content).toString("base64"),
    }));
  }

  try {
    await sgMail.send(msg);
    return true;
  } catch (err) {
    const detail = err?.response?.body ? JSON.stringify(err.response.body) : err.message;
    console.error(`[mailer] send failed for "${subject}":`, detail);
    return false;
  }
}
