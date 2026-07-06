/**
 * 28-day renewal sweep. Finds paid tag orders whose renewal is due and that
 * haven't been reminded yet, emails the customer via SendGrid with a one-tap
 * renew link, and marks them reminded (idempotent).
 */

import { sendEmail } from "@speedy/shared/mailer";
import { supa } from "./db.js";
import { config } from "./config.js";

function esc(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renewalEmailHtml(order) {
  const name = `${order.first_name || ""}`.trim() || "there";
  const renewUrl = `${config.appUrl}/checkout`;
  return `<div style="font-family:Archivo,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;background:#FBFAF4;border:1px solid #ECE5D8;border-radius:16px;overflow:hidden">
    <div style="background:#12161C;padding:22px 26px"><span style="color:#E8A33D;font-weight:700;letter-spacing:1px;text-transform:uppercase">NJ Temporary Tag</span></div>
    <div style="padding:26px">
      <h1 style="font-family:Oswald,sans-serif;font-size:22px;color:#12161C;margin:0 0 14px;text-transform:uppercase;letter-spacing:.5px">Your tag is about to expire</h1>
      <p style="color:#3A352C;font-size:15px;line-height:1.6">Hi ${esc(name)}, your 30-day temporary plate${order.plate ? ` <b>${esc(order.plate)}</b>` : ""} reaches the end of its term soon. Renew now and we'll issue a fresh one in minutes.</p>
      <p style="margin:22px 0"><a href="${renewUrl}" style="display:inline-block;background:#12161C;color:#F5F3EC;text-decoration:none;font-family:Oswald,sans-serif;text-transform:uppercase;letter-spacing:.5px;padding:13px 26px;border-radius:999px">Renew my tag →</a></p>
      <p style="color:#6B6257;font-size:13px">Keep proof of insurance with you while driving.</p>
    </div>
  </div>`;
}

/**
 * @param {object} [opts] { force:boolean } — ignore the reminded guard (manual).
 * @returns {Promise<{sent:number, considered:number, errors:number}>}
 */
export async function runRenewalSweep(opts = {}) {
  const client = supa();
  let query = client
    .from("orders")
    .select("id, first_name, email, delivery_email, plate, renewal_due_at, renewal_count")
    .eq("status", "paid")
    .not("renewal_due_at", "is", null)
    .lte("renewal_due_at", new Date().toISOString());
  if (!opts.force) query = query.is("renewal_reminded_at", null);

  const { data: due, error } = await query.limit(200);
  if (error) throw new Error(`[renewals] query: ${error.message}`);

  let sent = 0;
  let errors = 0;
  for (const order of due || []) {
    const to = order.delivery_email || order.email;
    if (!to) continue;
    const ok = await sendEmail({
      to,
      subject: "Your NJ temporary tag is expiring — renew in minutes",
      html: renewalEmailHtml(order),
    });
    if (ok) {
      sent += 1;
      await client
        .from("orders")
        .update({
          renewal_reminded_at: new Date().toISOString(),
          renewal_count: (order.renewal_count || 0) + 1,
        })
        .eq("id", order.id);
    } else {
      errors += 1;
    }
  }
  return { sent, considered: (due || []).length, errors };
}
