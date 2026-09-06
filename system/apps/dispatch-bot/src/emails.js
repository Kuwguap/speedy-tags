/**
 * Transactional emails sent by the dispatch bot via shared SendGrid mailer.
 *   - driver assignment email: PDF + full delivery details to the winning driver
 *   - customer tag email: the generated temp tag to the buyer
 */

import { sendEmail } from "@speedy/shared/mailer";

function esc(v) {
  return String(v ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fullName(o) {
  return `${o.first_name || ""} ${o.last_name || ""}`.trim() || "Customer";
}

function detailRows(order) {
  const rows = [
    ["Name", fullName(order)],
    ["Phone", order.phone],
    ["Delivery method", order.delivery_method],
    ["Delivery email", order.delivery_email],
    ["Registration address", [order.address, order.address2, `${order.city || ""} ${order.state || ""} ${order.zip || ""}`].filter(Boolean).join(", ")],
    ["Delivery address", order.delivery_address],
    ["Plate", order.plate],
    ["VIN", order.vin],
    ["Vehicle", [order.year, order.make, order.model].filter(Boolean).join(" ")],
    ["Color", order.color],
    ["Insurance company", order.insurance_company],
    ["Policy #", order.insurance_policy],
    ["Notes", order.notes],
  ];
  return rows
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px;color:#6b6257;font-weight:600;white-space:nowrap">${esc(k)}</td><td style="padding:6px 12px;color:#1a1a1a">${esc(v)}</td></tr>`,
    )
    .join("");
}

function shell(title, bodyHtml) {
  return `<div style="font-family:'Manrope',-apple-system,Segoe UI,sans-serif;max-width:600px;margin:0 auto;background:#fbf9f4;border-radius:16px;overflow:hidden;border:1px solid #ece5d8">
    <div style="background:#12161C;padding:24px 28px"><span style="color:#E8A33D;font-weight:700;letter-spacing:1px;font-size:18px;text-transform:uppercase">NJ Temporary Tag</span></div>
    <div style="padding:28px">
      <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:22px;color:#1a1a1a;margin:0 0 16px">${esc(title)}</h1>
      ${bodyHtml}
    </div>
    <div style="padding:16px 28px;color:#9a9284;font-size:12px;border-top:1px solid #ece5d8">Sent by the NJ Temporary Tag dispatch system.</div>
  </div>`;
}

/** Email the winning driver the PDF + full delivery details. */
export async function emailDriverAssignment(driver, order, tagBytes) {
  const body = `
    <p style="color:#3a352c;font-size:15px;line-height:1.6">You accepted order <b>#${esc(String(order.id).slice(0, 8))}</b>. The temporary tag PDF is attached. Delivery details:</p>
    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:10px;border:1px solid #ece5d8;margin-top:12px">${detailRows(order)}</table>
    <p style="color:#6b6257;font-size:13px;margin-top:16px">Once delivered, reply to the bot in Telegram with a photo of the signed receipt to close out this delivery.</p>`;
  const attachments = tagBytes
    ? [{ filename: `temp-tag-${order.plate || order.id}.pdf`, content: tagBytes }]
    : [];
  return sendEmail({
    to: driver.email,
    subject: `Delivery assigned — Order #${String(order.id).slice(0, 8)} (${order.plate || "tag"})`,
    html: shell("Delivery assigned to you", body),
    attachments,
  });
}

/** Email the customer their generated temp tag. */
export async function emailCustomerTag(order, tagBytes) {
  const to = order.delivery_email || order.email;
  if (!to) return false;
  const body = `
    <p style="color:#3a352c;font-size:15px;line-height:1.6">Your New Jersey 30-day temporary plate <b>${esc(order.plate || "")}</b> is attached. Print it, place it in the rear window, and keep proof of insurance with you while driving.</p>
    <p style="color:#6b6257;font-size:13px;margin-top:16px">Questions? Just reply to this email.</p>`;
  return sendEmail({
    to,
    subject: `Your temporary tag is ready — ${order.plate || ""}`.trim(),
    html: shell("Your temporary tag is ready", body),
    attachments: tagBytes ? [{ filename: `temp-tag-${order.plate || order.id}.pdf`, content: tagBytes }] : [],
  });
}
