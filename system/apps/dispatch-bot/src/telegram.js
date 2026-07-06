/**
 * Thin Telegram Bot API wrapper. Node 20 globals (fetch/FormData/Blob) only.
 * Every send is best-effort: failures are logged and returned, never thrown,
 * so one bad chat id can't abort a whole broadcast.
 */

import { config, tg } from "./config.js";

async function callApi(method, payload) {
  try {
    const res = await fetch(tg.api(method), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.ok) {
      console.warn(`[telegram] ${method} failed:`, json.description);
      return { ok: false, error: json.description };
    }
    return { ok: true, result: json.result };
  } catch (err) {
    console.warn(`[telegram] ${method} threw:`, err.message);
    return { ok: false, error: err.message };
  }
}

export async function sendMessage(chatId, text, { keyboard, disablePreview = true } = {}) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: disablePreview,
  };
  if (keyboard) payload.reply_markup = { inline_keyboard: keyboard };
  return callApi("sendMessage", payload);
}

export async function editMessageText(chatId, messageId, text, { keyboard } = {}) {
  const payload = { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" };
  payload.reply_markup = keyboard ? { inline_keyboard: keyboard } : { inline_keyboard: [] };
  return callApi("editMessageText", payload);
}

export async function answerCallbackQuery(callbackQueryId, text, { alert = false } = {}) {
  return callApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: alert,
  });
}

/** Send a PDF (Uint8Array/Buffer) as a document. Uses multipart upload. */
export async function sendDocument(chatId, bytes, filename, caption) {
  try {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    if (caption) {
      form.append("caption", caption);
      form.append("parse_mode", "HTML");
    }
    form.append(
      "document",
      new Blob([bytes], { type: "application/pdf" }),
      filename || "document.pdf",
    );
    const res = await fetch(tg.api("sendDocument"), { method: "POST", body: form });
    const json = await res.json();
    if (!json.ok) {
      console.warn(`[telegram] sendDocument failed:`, json.description);
      return { ok: false, error: json.description };
    }
    return { ok: true, result: json.result };
  } catch (err) {
    console.warn(`[telegram] sendDocument threw:`, err.message);
    return { ok: false, error: err.message };
  }
}

/** Download a file the user sent us (photo/document) → bytes + mime. */
export async function downloadTelegramFile(fileId) {
  const info = await callApi("getFile", { file_id: fileId });
  if (!info.ok) return null;
  const filePath = info.result.file_path;
  const res = await fetch(tg.file(filePath));
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = filePath.endsWith(".pdf")
    ? "application/pdf"
    : filePath.match(/\.png$/i)
      ? "image/png"
      : "image/jpeg";
  return { bytes: buf, mime, filePath };
}

/** Register the webhook so Telegram pushes updates to us. */
export async function setWebhook() {
  if (!config.publicUrl) {
    console.warn("[telegram] DISPATCH_PUBLIC_URL not set — webhook not registered (use polling/tunnel in dev).");
    return { ok: false };
  }
  const url = `${config.publicUrl}/telegram/webhook`;
  const r = await callApi("setWebhook", {
    url,
    allowed_updates: ["callback_query", "message"],
  });
  if (r.ok) console.log(`[telegram] webhook set → ${url}`);
  return r;
}

/** Inline keyboard builders (labels say exactly what happens). */
export const keyboards = {
  claim: (orderId) => [
    [
      { text: "✅ Accept & get details", callback_data: `accept_${orderId}` },
      { text: "❌ Decline", callback_data: `decline_${orderId}` },
    ],
  ],
  routeLead: (draftId) => [
    [{ text: "📄 Send to all drivers", callback_data: `all_${draftId}` }],
    [{ text: "👤 Pick a driver", callback_data: `pick_${draftId}` }],
    [{ text: "🗑 Discard", callback_data: `discard_${draftId}` }],
  ],
  driverList: (draftId, drivers) =>
    drivers.map((d) => [
      { text: `👤 ${d.name}`, callback_data: `drv_${draftId}_${d.id}` },
    ]),
};
