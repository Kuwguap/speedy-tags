/**
 * Dispatch bot HTTP service (Render).
 *   POST /leads            ← tag site pushes a paid order id to dispatch
 *   POST /telegram/webhook ← Telegram updates (callback_query + message)
 *   GET  /health
 */

import express from "express";
import { config, assertConfig } from "./config.js";
import { setWebhook, sendMessage, downloadTelegramFile, answerCallbackQuery } from "./telegram.js";
import { generateAndDispatch, handleAccept, handleDecline } from "./dispatch.js";
import { handleLeadText, handleLeadDocument, handleRouteCallback } from "./agent.js";
import {
  driverByTelegramId,
  isKnownSupervisor,
  latestDeliveryForDriver,
  markDelivered,
  storeReceipt,
} from "./db.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "dispatch-bot" }));

// ─── Lead intake from the tag site ───────────────────────────────────────────
app.post("/leads", async (req, res) => {
  if (config.sharedSecret && req.get("x-dispatch-secret") !== config.sharedSecret) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  const orderId = req.body?.orderId;
  if (!orderId) return res.status(400).json({ ok: false, error: "orderId required" });
  try {
    const result = await generateAndDispatch(orderId);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[/leads]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Telegram webhook ────────────────────────────────────────────────────────
app.post("/telegram/webhook", async (req, res) => {
  res.json({ ok: true }); // ack immediately; process async
  const update = req.body;
  try {
    if (update.callback_query) await onCallback(update.callback_query);
    else if (update.message) await onMessage(update.message);
  } catch (err) {
    console.error("[webhook] handler error:", err);
  }
});

async function onCallback(cq) {
  const data = cq.data || "";
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const fromId = cq.from?.id;

  // Driver claim actions
  if (data.startsWith("accept_") || data.startsWith("decline_")) {
    const orderId = data.slice(data.indexOf("_") + 1);
    const driver = await driverByTelegramId(fromId);
    if (!driver) {
      return answerCallbackQuery(cq.id, "You're not registered as a driver.", { alert: true });
    }
    if (data.startsWith("accept_")) {
      return handleAccept({ orderId, driver, callbackQueryId: cq.id, chatId, messageId });
    }
    return handleDecline({ orderId, callbackQueryId: cq.id, chatId, messageId });
  }

  // Agent routing actions: all_<id> | pick_<id> | discard_<id> | drv_<id>_<driverId>
  const parts = data.split("_");
  const action = parts[0];
  if (["all", "pick", "discard", "drv"].includes(action)) {
    return handleRouteCallback({
      action,
      orderId: parts[1],
      driverId: parts[2],
      callbackQueryId: cq.id,
      chatId,
      messageId,
    });
  }
}

async function onMessage(msg) {
  const chatId = msg.chat?.id;
  const fromId = msg.from?.id;
  const text = msg.text || "";

  // /start and /help
  if (text.startsWith("/start") || text.startsWith("/help")) {
    return sendMessage(
      chatId,
      [
        "👋 <b>NJ Temporary Tag — dispatch bot</b>",
        "",
        "• Drivers get Accept/Decline for each new order — first to accept wins.",
        "• Supervisors can paste a lead (text) or forward a document; I'll parse it, make the tag, and ask whether to send to all drivers or pick one.",
        "• Drivers: after delivering, send a photo of the signed receipt to close the delivery.",
      ].join("\n"),
    );
  }

  // A photo/document could be: a driver's delivery receipt, or a supervisor's lead.
  const fileId = pickFileId(msg);
  const driver = await driverByTelegramId(fromId);

  if (fileId && driver) {
    // Treat as a delivery receipt if the driver has an open accepted delivery.
    const delivery = await latestDeliveryForDriver(driver.id);
    if (delivery) {
      const file = await downloadTelegramFile(fileId);
      if (file) {
        const ext = file.mime === "application/pdf" ? "pdf" : file.mime === "image/png" ? "png" : "jpg";
        const path = await storeReceipt(delivery.order_id, `receipt.${ext}`, file.bytes, file.mime);
        await markDelivered(delivery.id, path);
        return sendMessage(chatId, "✅ Receipt received — delivery marked as completed. Thank you!");
      }
    }
    return sendMessage(chatId, "📎 Got your file, but I don't see an open delivery to attach it to.");
  }

  // Supervisor lead intake
  const isSupervisor = await isKnownSupervisor(fromId);
  if (fileId && isSupervisor) return handleLeadDocument(chatId, fileId);
  if (text && isSupervisor && !text.startsWith("/")) return handleLeadText(chatId, text);

  // Unknown sender / unhandled
  if (text && !text.startsWith("/")) {
    return sendMessage(chatId, "I only take leads from supervisors and receipts from drivers. If that's you, ask an admin to add your Telegram id in the dashboard.");
  }
}

/** Pick the best file id from a photo/document message. */
function pickFileId(msg) {
  if (msg.document) return msg.document.file_id;
  if (Array.isArray(msg.photo) && msg.photo.length) return msg.photo[msg.photo.length - 1].file_id;
  return null;
}

app.listen(config.port, async () => {
  assertConfig();
  console.log(`[dispatch-bot] listening on :${config.port}`);
  await setWebhook();
});
