/**
 * Core dispatch flow:
 *   1. generate the tag PDF (NJ vs non-NJ, shared pipeline)
 *   2. store it, send the FULL PDF to every supervisor (informational)
 *   3. broadcast an Accept/Decline claim to every active driver
 *   4. first driver to accept wins (atomic) → delivery row, PDF + details in
 *      Telegram, PDF + details by email; customer gets their tag by email
 *   5. unclaimed leads are re-broadcast once after FALLBACK_CLAIM_TIMEOUT_MS
 */

import { generateDocumentsForOrder } from "@speedy/shared/pdf";
import { makeAllocator } from "@speedy/shared/plates";
import {
  supa,
  getOrder,
  updateOrder,
  activeDrivers,
  activeSupervisors,
  tryAcceptOrder,
  createDelivery,
  driverById,
  storeDocument,
  downloadDocument,
} from "./db.js";
import {
  sendMessage,
  sendDocument,
  editMessageText,
  answerCallbackQuery,
  keyboards,
} from "./telegram.js";
import { emailDriverAssignment, emailCustomerTag } from "./emails.js";
import { config } from "./config.js";

const fallbackTimers = new Map();

function esc(v) {
  return String(v ?? "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function fullName(o) {
  return `${o.first_name || ""} ${o.last_name || ""}`.trim() || "Customer";
}

/** Map a DB order row → generateDocumentsForOrder() input. */
function genInput(order) {
  return {
    user: { firstName: order.first_name, lastName: order.last_name },
    order: {
      id: order.id,
      reference: order.reference || order.id,
      state: order.state,
      address: order.address,
      city: order.city,
      zip: order.zip,
      vin: order.vin,
      year: order.year,
      make: order.make,
      model: order.model,
      color: order.color,
      body: order.body,
      insuranceCompany: order.insurance_company,
      insurancePolicy: order.insurance_policy,
      insuranceOptIn: order.insurance_opt_in,
      paidAt: order.paid_at,
    },
    allocatePlate: makeAllocator(supa()),
  };
}

function claimSummary(order) {
  return [
    "🆕 <b>New tag order — accept to claim</b>",
    `Order #${esc(String(order.id).slice(0, 8))}`,
    `• ${esc(fullName(order))}`,
    `• ${esc([order.year, order.make, order.model].filter(Boolean).join(" "))}`,
    `• Plate <b>${esc(order.plate)}</b>`,
    order.state ? `• ${esc(order.state)}` : null,
    "",
    "Tap <b>Accept</b> to receive the PDF + full delivery details here and by email.",
  ].filter(Boolean).join("\n");
}

function fullDetails(order) {
  const reg = [order.address, order.address2, `${order.city || ""} ${order.state || ""} ${order.zip || ""}`.trim()]
    .filter(Boolean).join(", ");
  return [
    `✅ <b>Order #${esc(String(order.id).slice(0, 8))}</b>`,
    `<b>Name:</b> ${esc(fullName(order))}`,
    order.phone ? `<b>Phone:</b> ${esc(order.phone)}` : null,
    order.delivery_method ? `<b>Delivery:</b> ${esc(order.delivery_method)}` : null,
    order.delivery_email ? `<b>Delivery email:</b> ${esc(order.delivery_email)}` : null,
    `<b>Registration address:</b> ${esc(reg)}`,
    order.delivery_address ? `<b>Ship-to:</b> ${esc(order.delivery_address)}` : null,
    `<b>Plate:</b> ${esc(order.plate)}`,
    `<b>VIN:</b> ${esc(order.vin)}`,
    `<b>Vehicle:</b> ${esc([order.year, order.make, order.model, order.color].filter(Boolean).join(" "))}`,
    order.insurance_company ? `<b>Insurance:</b> ${esc(order.insurance_company)} (${esc(order.insurance_policy)})` : null,
    order.notes ? `<b>Notes:</b> ${esc(order.notes)}` : null,
  ].filter(Boolean).join("\n");
}

/**
 * Generate the PDF for an order and broadcast it. Idempotent-ish: regenerates
 * only if the order has no stored tag yet.
 */
export async function generateAndDispatch(orderId) {
  let order = await getOrder(orderId);

  // 1 + 2: generate + store (skip if already generated)
  let tagBytes;
  if (!order.tag_pdf_path) {
    const docs = await generateDocumentsForOrder(genInput(order));
    tagBytes = Buffer.from(docs.tagBytes);
    const tagPath = await storeDocument(orderId, "tag.pdf", tagBytes);
    const patch = { plate: docs.plate, tag_pdf_path: tagPath };
    if (docs.insuranceBytes) {
      patch.insurance_pdf_path = await storeDocument(orderId, "insurance.pdf", Buffer.from(docs.insuranceBytes));
    }
    order = await updateOrder(orderId, patch);
  } else {
    tagBytes = await downloadDocument(order.tag_pdf_path);
  }

  // 3: supervisors get the full PDF (informational, no buttons)
  const supervisors = await activeSupervisors();
  const supCaption = `📄 <b>New order dispatched</b>\n${fullDetails(order)}`;
  for (const s of supervisors) {
    await sendDocument(s.telegram_id, tagBytes, `temp-tag-${order.plate || order.id}.pdf`, supCaption);
  }

  // 4: drivers get Accept/Decline
  const drivers = await activeDrivers();
  const claimIds = { ...(order.telegram_claim_message_ids || {}) };
  const recipients = [];
  for (const d of drivers) {
    const res = await sendMessage(d.telegram_id, claimSummary(order), {
      keyboard: keyboards.claim(order.id),
    });
    if (res.ok) {
      claimIds[d.telegram_id] = res.result.message_id;
      recipients.push(d.telegram_id);
    }
  }
  await updateOrder(orderId, {
    telegram_sent: true,
    telegram_claim_message_ids: claimIds,
    telegram_recipients: recipients,
  });

  scheduleFallback(orderId);
  return { dispatched: recipients.length, supervisors: supervisors.length };
}

function scheduleFallback(orderId) {
  clearFallback(orderId);
  const t = setTimeout(async () => {
    try {
      const order = await getOrder(orderId);
      if (order.telegram_accepted_by) return; // already claimed
      const drivers = await activeDrivers();
      for (const d of drivers) {
        await sendMessage(
          d.telegram_id,
          `⏰ <b>Still unclaimed</b> — Order #${esc(String(order.id).slice(0, 8))} (${esc(order.plate)}). First to accept gets it.`,
          { keyboard: keyboards.claim(order.id) },
        );
      }
    } catch (err) {
      console.warn("[dispatch] fallback failed:", err.message);
    } finally {
      clearFallback(orderId);
    }
  }, config.fallbackTimeoutMs);
  fallbackTimers.set(orderId, t);
}

function clearFallback(orderId) {
  const t = fallbackTimers.get(orderId);
  if (t) clearTimeout(t);
  fallbackTimers.delete(orderId);
}

/**
 * Handle a driver tapping Accept. Atomic — only the first winner proceeds.
 * @param {object} params { orderId, driver, callbackQueryId, chatId, messageId }
 */
export async function handleAccept({ orderId, driver, callbackQueryId, chatId, messageId }) {
  const won = await tryAcceptOrder(orderId, driver);
  if (!won) {
    const order = await getOrder(orderId);
    const winner = order.telegram_accepted_driver_id
      ? await driverById(order.telegram_accepted_driver_id)
      : null;
    await answerCallbackQuery(callbackQueryId, `Already claimed${winner ? ` by ${winner.name}` : ""}.`, { alert: true });
    await editMessageText(chatId, messageId, `🔒 <b>Claimed${winner ? ` by ${esc(winner.name)}` : ""}</b> — Order #${esc(String(orderId).slice(0, 8))}.`);
    return;
  }

  const order = won;
  clearFallback(orderId);
  await createDelivery({ orderId, driverId: driver.id, status: "accepted" });
  await answerCallbackQuery(callbackQueryId, "Accepted — details sent to your email.");

  // Winner's own message → full details
  await editMessageText(chatId, messageId, fullDetails(order));

  // Everyone else's claim message → locked
  const claimIds = order.telegram_claim_message_ids || {};
  for (const [tgId, msgId] of Object.entries(claimIds)) {
    if (String(tgId) === String(driver.telegram_id)) continue;
    await editMessageText(tgId, msgId, `🔒 <b>Claimed by ${esc(driver.name)}</b> — Order #${esc(String(orderId).slice(0, 8))}.`);
  }

  // Send the PDF to the winning driver in Telegram, and email PDF + details
  const tagBytes = order.tag_pdf_path ? await downloadDocument(order.tag_pdf_path) : null;
  if (tagBytes) {
    await sendDocument(driver.telegram_id, tagBytes, `temp-tag-${order.plate || order.id}.pdf`, "📄 Temporary tag for this delivery.");
  }
  await emailDriverAssignment(driver, order, tagBytes);
  await emailCustomerTag(order, tagBytes);
}

export async function handleDecline({ orderId, callbackQueryId, chatId, messageId }) {
  await answerCallbackQuery(callbackQueryId, "Declined.");
  await editMessageText(chatId, messageId, `↩️ You declined Order #${esc(String(orderId).slice(0, 8))}. Others can still claim it.`);
}

/**
 * Direct assignment (agent "pick a driver" path) — no accept race.
 * Sends the driver the PDF + details in Telegram and by email.
 */
export async function assignToDriver(orderId, driver) {
  const order = await updateOrder(orderId, {
    telegram_accepted_by: driver.telegram_id,
    telegram_accepted_driver_id: driver.id,
    telegram_accepted_at: new Date().toISOString(),
    telegram_sent: true,
  });
  clearFallback(orderId);
  await createDelivery({ orderId, driverId: driver.id, status: "accepted" });
  const tagBytes = order.tag_pdf_path ? await downloadDocument(order.tag_pdf_path) : null;
  await sendMessage(driver.telegram_id, `📦 <b>Delivery assigned to you</b>\n${fullDetails(order)}`);
  if (tagBytes) {
    await sendDocument(driver.telegram_id, tagBytes, `temp-tag-${order.plate || order.id}.pdf`, "📄 Temporary tag for this delivery.");
  }
  await emailDriverAssignment(driver, order, tagBytes);
  await emailCustomerTag(order, tagBytes);
  return order;
}

export { fullDetails };
