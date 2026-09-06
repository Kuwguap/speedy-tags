/**
 * AI-agent chat mode. A supervisor pastes text or forwards a document; the bot
 * uses OpenAI to extract the order fields, generates the plate PDF, previews it
 * in chat, and asks how to route it:
 *   "Send to all drivers"  → broadcast Accept/Decline (first-to-accept wins)
 *   "Pick a driver"        → assign directly to one driver
 *
 * The draft *is* a real order row (so the PDF/plate are real); it's only
 * dispatched once the supervisor chooses a route. Discard deletes it.
 */

import { parseTagInfoText, parseTagInfoDocument, openAiEnabled } from "@speedy/shared/openai";
import { generateDocumentsForOrder } from "@speedy/shared/pdf";
import { makeAllocator } from "@speedy/shared/plates";
import { supa, insertOrder, updateOrder, getOrder, activeDrivers, driverById, storeDocument } from "./db.js";
import { sendMessage, sendDocument, downloadTelegramFile, keyboards, answerCallbackQuery, editMessageText } from "./telegram.js";
import { generateAndDispatch, assignToDriver, fullDetails } from "./dispatch.js";

function parsedToOrderRow(p) {
  return {
    reference: `manual-${Date.now().toString(36)}`,
    status: "paid",
    paid_at: new Date().toISOString(),
    state: p.state || null,
    first_name: p.firstName || null,
    last_name: p.lastName || null,
    email: p.email || null,
    phone: p.phone || null,
    address: p.address || null,
    address2: p.address2 || null,
    city: p.city || null,
    zip: p.zip || null,
    vin: p.vin || null,
    year: p.year || null,
    make: p.make || null,
    model: p.model || null,
    color: p.color || null,
    body: p.body || null,
    insurance_company: p.insuranceCompany || null,
    insurance_policy: p.policyNumber || null,
    insurance_opt_in: Boolean(p.insuranceCompany || p.policyNumber),
    notes: p.notes || null,
  };
}

function genInput(order) {
  return {
    user: { firstName: order.first_name, lastName: order.last_name },
    order: {
      id: order.id,
      reference: order.reference,
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

/** Build a draft order from parsed fields, generate the PDF, preview + route. */
async function createDraftAndPreview(chatId, parsed) {
  if (!parsed.vin && !parsed.firstName && !parsed.make) {
    await sendMessage(
      chatId,
      "🤔 I couldn't find enough to build a tag (need at least a name, VIN, or vehicle). Send the lead again with more detail.",
    );
    return;
  }

  const order = await insertOrder(parsedToOrderRow(parsed));
  const docs = await generateDocumentsForOrder(genInput(order));
  const tagBytes = Buffer.from(docs.tagBytes);
  const patch = { plate: docs.plate, tag_pdf_path: await storeDocument(order.id, "tag.pdf", tagBytes) };
  if (docs.insuranceBytes) {
    patch.insurance_pdf_path = await storeDocument(order.id, "insurance.pdf", Buffer.from(docs.insuranceBytes));
  }
  const saved = await updateOrder(order.id, patch);

  await sendDocument(chatId, tagBytes, `temp-tag-${saved.plate}.pdf`, `📝 <b>Draft ready</b>\n${fullDetails(saved)}`);
  await sendMessage(chatId, "How should I route this order?", { keyboard: keyboards.routeLead(saved.id) });
}

/** Entry: a plain text message (not a command) from a supervisor. */
export async function handleLeadText(chatId, text) {
  if (!openAiEnabled()) {
    await sendMessage(chatId, "⚠️ OpenAI isn't configured (set <code>OPENAI_API_KEY</code>), so I can't parse leads yet.");
    return;
  }
  await sendMessage(chatId, "⏳ Reading the lead…");
  try {
    const parsed = await parseTagInfoText(text);
    await createDraftAndPreview(chatId, parsed);
  } catch (err) {
    await sendMessage(chatId, `❌ Couldn't parse that: ${err.message}`);
  }
}

/** Entry: a document/photo message from a supervisor. */
export async function handleLeadDocument(chatId, fileId) {
  if (!openAiEnabled()) {
    await sendMessage(chatId, "⚠️ OpenAI isn't configured (set <code>OPENAI_API_KEY</code>), so I can't parse documents yet.");
    return;
  }
  await sendMessage(chatId, "⏳ Reading the document…");
  try {
    const file = await downloadTelegramFile(fileId);
    if (!file) {
      await sendMessage(chatId, "❌ I couldn't download that file. Try again.");
      return;
    }
    const parsed = await parseTagInfoDocument(file.bytes, file.mime);
    await createDraftAndPreview(chatId, parsed);
  } catch (err) {
    await sendMessage(chatId, `❌ Couldn't parse that document: ${err.message}`);
  }
}

/** Route-choice callbacks from the preview keyboard. */
export async function handleRouteCallback({ action, orderId, driverId, callbackQueryId, chatId, messageId }) {
  if (action === "all") {
    await answerCallbackQuery(callbackQueryId, "Broadcasting to all drivers…");
    await editMessageText(chatId, messageId, "📡 Sent to all drivers — first to accept wins.");
    await generateAndDispatch(orderId);
    return;
  }
  if (action === "pick") {
    const drivers = await activeDrivers();
    if (drivers.length === 0) {
      await answerCallbackQuery(callbackQueryId, "No active drivers.", { alert: true });
      return;
    }
    await answerCallbackQuery(callbackQueryId, "Choose a driver.");
    await editMessageText(chatId, messageId, "👥 Pick a driver to assign this order to:", {
      keyboard: keyboards.driverList(orderId, drivers),
    });
    return;
  }
  if (action === "drv") {
    const driver = await driverById(driverId);
    if (!driver) {
      await answerCallbackQuery(callbackQueryId, "Driver not found.", { alert: true });
      return;
    }
    await answerCallbackQuery(callbackQueryId, `Assigned to ${driver.name}.`);
    await editMessageText(chatId, messageId, `✅ Assigned to <b>${driver.name}</b> — PDF + details sent to their Telegram and email.`);
    await assignToDriver(orderId, driver);
    return;
  }
  if (action === "discard") {
    await supa().from("orders").delete().eq("id", orderId);
    await answerCallbackQuery(callbackQueryId, "Discarded.");
    await editMessageText(chatId, messageId, "🗑 Draft discarded.");
  }
}
