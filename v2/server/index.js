/**
 * TriStateTags v2 — Express API
 *
 * Self-contained: stores orders in a local JSON file, talks to Paystack
 * directly for init + verify, optionally sends an email receipt via Resend.
 * No external bots, no krab-dispatch-api, no Stripe.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3001;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me-please";
const APP_URL = (process.env.APP_URL || "http://localhost:5173").replace(/\/+$/, "");

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || "";
const PAYSTACK_CURRENCY = (process.env.PAYSTACK_CURRENCY || "USD").toUpperCase();
// Display currency on the customer-facing site is always "$" per spec.
const DISPLAY_CURRENCY_SYMBOL = "$";
// Flat price for the temporary tag, in major units (e.g. dollars). Change here.
const TAG_PRICE = Number(process.env.TAG_PRICE || 150);

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "TriStateTags <orders@example.com>";

const DATA_DIR = path.join(__dirname, "..", "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

const paystack = axios.create({
  baseURL: "https://api.paystack.co",
  headers: {
    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  },
  timeout: 15000,
});

// --- Storage helpers --------------------------------------------------------

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(ORDERS_FILE);
  } catch {
    await fs.writeFile(ORDERS_FILE, "[]", "utf8");
  }
}

async function readOrders() {
  await ensureDataDir();
  const raw = await fs.readFile(ORDERS_FILE, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeOrders(orders) {
  await ensureDataDir();
  await fs.writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2), "utf8");
}

async function upsertOrder(updates) {
  const orders = await readOrders();
  const idx = orders.findIndex(
    (o) => o.reference === updates.reference || o.id === updates.id,
  );
  if (idx === -1) {
    orders.unshift(updates);
  } else {
    orders[idx] = { ...orders[idx], ...updates };
  }
  await writeOrders(orders);
  return orders[idx === -1 ? 0 : idx];
}

async function findOrderByReference(reference) {
  const orders = await readOrders();
  return orders.find((o) => o.reference === reference) || null;
}

// --- Auth middleware --------------------------------------------------------

function requireAdmin(req, res, next) {
  const pw = req.header("x-admin-password") || req.header("X-Admin-Password");
  if (!pw || pw !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }
  next();
}

// --- Email (Resend, optional) ----------------------------------------------

async function sendReceiptEmail(order) {
  if (!RESEND_API_KEY) {
    console.log(
      `[email] RESEND_API_KEY not set — skipping receipt for ${order.email} (${order.reference})`,
    );
    return { skipped: true };
  }
  const html = `
  <div style="font-family:Nunito Sans,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0F172A">
    <h1 style="font-family:Rubik,Arial,sans-serif;color:#2563EB;margin:0 0 12px">
      Thanks for your payment, ${escapeHtml(order.firstName)}!
    </h1>
    <p style="margin:0 0 16px;line-height:1.5">
      We received your <strong>$${order.amount.toFixed(2)}</strong> payment for your NJ temporary tag.
      Your tag will be delivered to <strong>${escapeHtml(order.email)}</strong> shortly.
    </p>
    <p style="margin:0 0 16px;line-height:1.5;color:#475569">
      This is an <strong style="color:#0F172A">email delivery service only</strong> &mdash;
      no physical shipping is involved. Watch your inbox (and your spam folder, just in case).
    </p>
    <div style="border:1px solid #E2E8F0;border-radius:12px;padding:16px;background:#EFF6FF;margin:16px 0">
      <p style="margin:0 0 4px;font-size:12px;color:#475569">Reference</p>
      <code style="font-family:monospace;font-size:14px;color:#1E40AF">${escapeHtml(order.reference)}</code>
    </div>
    <p style="margin:24px 0 0;font-size:12px;color:#475569">
      &mdash; TriStateTags
    </p>
  </div>`;
  try {
    await axios.post(
      "https://api.resend.com/emails",
      {
        from: RESEND_FROM_EMAIL,
        to: [order.email],
        subject: `Payment received — your NJ temp tag is on the way (${order.reference})`,
        html,
      },
      {
        headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
        timeout: 10000,
      },
    );
    return { sent: true };
  } catch (err) {
    console.warn("[email] Resend failed:", err.response?.data || err.message);
    return { error: err.message };
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- App --------------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json({ limit: "200kb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/config", (_req, res) => {
  res.json({
    currencySymbol: DISPLAY_CURRENCY_SYMBOL,
    tagPrice: TAG_PRICE,
    paystackPublicKey: PAYSTACK_PUBLIC_KEY,
    paystackCurrency: PAYSTACK_CURRENCY,
  });
});

app.post("/api/checkout/init", async (req, res) => {
  try {
    const { email, firstName, lastName, phone, amount, notes } = req.body || {};
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "A valid email is required." });
    }
    if (!firstName || !lastName) {
      return res.status(400).json({ error: "First and last name are required." });
    }
    const amt = Number(amount);
    // Server-side trust: always use the configured TAG_PRICE, never the client value.
    const finalAmount = TAG_PRICE;
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: "Invalid amount." });
    }
    if (!PAYSTACK_SECRET_KEY || !PAYSTACK_PUBLIC_KEY) {
      return res
        .status(503)
        .json({ error: "Paystack is not configured on this server." });
    }
    const reference = `tst_${Date.now().toString(36)}_${nanoid(10)}`;

    const initResp = await paystack.post("/transaction/initialize", {
      email,
      // Paystack expects amount in the lowest unit of the currency (cents/kobo).
      amount: Math.round(finalAmount * 100),
      currency: PAYSTACK_CURRENCY,
      reference,
      callback_url: `${APP_URL}/success?reference=${encodeURIComponent(reference)}`,
      metadata: {
        firstName,
        lastName,
        phone: phone || "",
        notes: notes || "",
        custom_fields: [
          { display_name: "Name", variable_name: "name", value: `${firstName} ${lastName}` },
        ],
      },
    });

    const data = initResp.data?.data;
    if (!data?.authorization_url || !data?.access_code) {
      return res.status(502).json({ error: "Paystack did not return an authorization URL." });
    }

    await upsertOrder({
      id: nanoid(12),
      reference,
      email,
      firstName,
      lastName,
      phone: phone || "",
      notes: notes || "",
      amount: finalAmount,
      currency: DISPLAY_CURRENCY_SYMBOL,
      paystackCurrency: PAYSTACK_CURRENCY,
      status: "pending",
      fulfilled: false,
      createdAt: new Date().toISOString(),
    });

    res.json({
      reference,
      authorizationUrl: data.authorization_url,
      accessCode: data.access_code,
    });
  } catch (err) {
    console.error("[checkout/init]", err.response?.data || err.message);
    res
      .status(500)
      .json({ error: err.response?.data?.message || err.message || "Failed to start checkout." });
  }
});

app.get("/api/checkout/verify", async (req, res) => {
  const reference = String(req.query.reference || "").trim();
  if (!reference) return res.status(400).json({ error: "Missing reference" });
  if (!PAYSTACK_SECRET_KEY) {
    return res.status(503).json({ error: "Paystack is not configured on this server." });
  }
  try {
    const r = await paystack.get(`/transaction/verify/${encodeURIComponent(reference)}`);
    const tx = r.data?.data;
    if (!tx) return res.status(502).json({ error: "Paystack returned no transaction." });

    const status =
      tx.status === "success" ? "paid" : tx.status === "failed" ? "failed" : "pending";

    let existing = await findOrderByReference(reference);
    const wasAlreadyPaid = existing?.status === "paid";

    const updated = await upsertOrder({
      reference,
      id: existing?.id || nanoid(12),
      email: tx.customer?.email || existing?.email || "",
      firstName: existing?.firstName || tx.metadata?.firstName || "",
      lastName: existing?.lastName || tx.metadata?.lastName || "",
      phone: existing?.phone || tx.metadata?.phone || "",
      notes: existing?.notes || tx.metadata?.notes || "",
      amount: (tx.amount || 0) / 100,
      currency: DISPLAY_CURRENCY_SYMBOL,
      paystackCurrency: tx.currency || PAYSTACK_CURRENCY,
      status,
      fulfilled: existing?.fulfilled || false,
      channel: tx.channel || existing?.channel || "",
      paidAt: status === "paid" ? tx.paid_at || new Date().toISOString() : existing?.paidAt,
      createdAt: existing?.createdAt || new Date().toISOString(),
    });

    if (status === "paid" && !wasAlreadyPaid && updated.email) {
      // Fire-and-forget — don't block the response on email delivery.
      sendReceiptEmail(updated).catch((e) =>
        console.warn("[email] background send failed:", e.message),
      );
    }

    res.json(updated);
  } catch (err) {
    console.error("[checkout/verify]", err.response?.data || err.message);
    res
      .status(500)
      .json({ error: err.response?.data?.message || err.message || "Verification failed." });
  }
});

app.post("/api/admin/login", (req, res) => {
  const pw = String(req.body?.password || "");
  if (pw !== ADMIN_PASSWORD) return res.status(401).json({ error: "Wrong password" });
  res.json({ ok: true });
});

app.get("/api/admin/orders", requireAdmin, async (_req, res) => {
  const orders = await readOrders();
  // Newest first.
  orders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json({ orders });
});

app.post("/api/admin/orders/:id/fulfill", requireAdmin, async (req, res) => {
  const id = req.params.id;
  const orders = await readOrders();
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) return res.status(404).json({ error: "Order not found" });
  orders[idx] = { ...orders[idx], fulfilled: true, fulfilledAt: new Date().toISOString() };
  await writeOrders(orders);
  res.json(orders[idx]);
});

app.listen(PORT, () => {
  console.log(`[tristatetags-v2] API listening on http://localhost:${PORT}`);
  if (!PAYSTACK_SECRET_KEY) console.warn("[tristatetags-v2] PAYSTACK_SECRET_KEY not set");
  if (!RESEND_API_KEY)
    console.warn("[tristatetags-v2] RESEND_API_KEY not set — receipt emails disabled");
  if (ADMIN_PASSWORD === "change-me-please")
    console.warn("[tristatetags-v2] Using default admin password — set ADMIN_PASSWORD in .env");
});
