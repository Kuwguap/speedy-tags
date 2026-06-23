/**
 * Kingsman Tags — Express API
 *
 * Self-contained: stores users / orders / sessions in local JSON files,
 * talks to the payment processor directly for init + verify, sends welcome
 * + renewal-reminder emails through Resend when configured.
 *
 * Customer-facing strings never mention the payment processor by name or
 * any "from" email address.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Config -----------------------------------------------------------------

const PORT = Number(process.env.PORT) || 3001;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me-please";
const APP_URL = (process.env.APP_URL || "http://localhost:5173").replace(/\/+$/, "");

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || "";
const PAYSTACK_CURRENCY = (process.env.PAYSTACK_CURRENCY || "USD").toUpperCase();
const DISPLAY_CURRENCY_SYMBOL = "$";
const TAG_PRICE = Number(process.env.TAG_PRICE || 150);
const RENEWAL_PERIOD_DAYS = Number(process.env.RENEWAL_PERIOD_DAYS || 28);
const RENEWAL_CHECK_INTERVAL_MS =
  Number(process.env.RENEWAL_CHECK_INTERVAL_MINUTES || 60) * 60 * 1000;
const SESSION_TTL_DAYS = 30;
const MAGIC_LINK_TTL_HOURS = 24;
/** Don't send another reminder if the previous one is less than this old. */
const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM = process.env.RESEND_FROM || "Kingsman Tags <onboarding@resend.dev>";

const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const TOKENS_FILE = path.join(DATA_DIR, "tokens.json");

const paystack = axios.create({
  baseURL: "https://api.paystack.co",
  headers: {
    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  },
  timeout: 15000,
});

// --- Tiny JSON-file store ---------------------------------------------------

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  for (const f of [USERS_FILE, ORDERS_FILE, TOKENS_FILE]) {
    try {
      await fs.access(f);
    } catch {
      await fs.writeFile(f, "[]", "utf8");
    }
  }
}

async function readJson(file) {
  await ensureDataDir();
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return [];
  }
}

async function writeJson(file, data) {
  await ensureDataDir();
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

// --- Users ------------------------------------------------------------------

async function findUserByEmail(email) {
  const norm = String(email || "").trim().toLowerCase();
  if (!norm) return null;
  const users = await readJson(USERS_FILE);
  return users.find((u) => u.email === norm) || null;
}

async function findUserById(id) {
  const users = await readJson(USERS_FILE);
  return users.find((u) => u.id === id) || null;
}

async function upsertUser(user) {
  const users = await readJson(USERS_FILE);
  const idx = users.findIndex((u) => u.id === user.id || u.email === user.email);
  if (idx === -1) users.unshift(user);
  else users[idx] = { ...users[idx], ...user };
  await writeJson(USERS_FILE, users);
  return idx === -1 ? users[0] : users[idx];
}

async function ensureUser({ email, firstName, lastName }) {
  const existing = await findUserByEmail(email);
  if (existing) {
    // Backfill name fields if they were missing.
    const patch = {};
    if (firstName && !existing.firstName) patch.firstName = firstName;
    if (lastName && !existing.lastName) patch.lastName = lastName;
    if (Object.keys(patch).length) return upsertUser({ ...existing, ...patch });
    return existing;
  }
  const user = {
    id: `usr_${nanoid(12)}`,
    email: String(email).trim().toLowerCase(),
    firstName: firstName || "",
    lastName: lastName || "",
    renewalEnabled: true, // opt-in by default
    createdAt: new Date().toISOString(),
    lastReminderAt: null,
  };
  await upsertUser(user);
  return user;
}

// --- Orders -----------------------------------------------------------------

async function findOrderByReference(reference) {
  const orders = await readJson(ORDERS_FILE);
  return orders.find((o) => o.reference === reference) || null;
}

async function upsertOrder(updates) {
  const orders = await readJson(ORDERS_FILE);
  const idx = orders.findIndex(
    (o) => o.reference === updates.reference || o.id === updates.id,
  );
  if (idx === -1) orders.unshift(updates);
  else orders[idx] = { ...orders[idx], ...updates };
  await writeJson(ORDERS_FILE, orders);
  return idx === -1 ? orders[0] : orders[idx];
}

async function ordersForUser(userId) {
  const orders = await readJson(ORDERS_FILE);
  return orders
    .filter((o) => o.userId === userId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function lastPaidOrderForUser(userId) {
  const list = await ordersForUser(userId);
  return list.find((o) => o.status === "paid") || null;
}

// --- Tokens (sessions + magic links) ---------------------------------------

async function issueToken({ userId, kind, ttlHours }) {
  const tokens = await readJson(TOKENS_FILE);
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
  tokens.unshift({
    token,
    userId,
    kind, // "session" | "magic"
    createdAt: new Date().toISOString(),
    expiresAt,
    consumedAt: null,
  });
  // Prune expired/old to keep file small.
  const now = Date.now();
  const kept = tokens.filter((t) => new Date(t.expiresAt).getTime() > now - 14 * 86400000);
  await writeJson(TOKENS_FILE, kept);
  return { token, expiresAt };
}

async function consumeToken(token, expectedKind) {
  const tokens = await readJson(TOKENS_FILE);
  const idx = tokens.findIndex((t) => t.token === token);
  if (idx === -1) return null;
  const t = tokens[idx];
  if (expectedKind && t.kind !== expectedKind) return null;
  if (new Date(t.expiresAt).getTime() < Date.now()) return null;
  if (t.kind === "magic" && t.consumedAt) return null; // magic links: one-shot
  if (t.kind === "magic") {
    tokens[idx] = { ...t, consumedAt: new Date().toISOString() };
    await writeJson(TOKENS_FILE, tokens);
  }
  return t;
}

async function findSession(token) {
  const tokens = await readJson(TOKENS_FILE);
  const t = tokens.find((x) => x.token === token && x.kind === "session");
  if (!t) return null;
  if (new Date(t.expiresAt).getTime() < Date.now()) return null;
  return t;
}

async function revokeSession(token) {
  const tokens = await readJson(TOKENS_FILE);
  await writeJson(
    TOKENS_FILE,
    tokens.filter((t) => t.token !== token),
  );
}

// --- Renewal math -----------------------------------------------------------

function computeNextRenewalIso(lastPaidAt) {
  if (!lastPaidAt) return null;
  return new Date(new Date(lastPaidAt).getTime() + RENEWAL_PERIOD_DAYS * 86400000).toISOString();
}

// --- Email (Resend) ---------------------------------------------------------

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function brandedEmailShell({ heading, bodyHtml, ctaText, ctaUrl }) {
  return `
  <div style="font-family:Jost,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0C0A09;background:#FAF8F2;">
    <div style="text-align:center;margin-bottom:16px">
      <div style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#0F172A;color:#D4AF37;font-family:'Bodoni Moda',Georgia,serif;font-weight:700;line-height:36px;font-size:18px">K</div>
      <div style="font-family:'Bodoni Moda',Georgia,serif;font-size:18px;font-weight:700;color:#0F172A;margin-top:6px">Kingsman Tags</div>
    </div>
    <h1 style="font-family:'Bodoni Moda',Georgia,serif;color:#0F172A;margin:0 0 14px;font-size:24px;font-weight:700">
      ${escapeHtml(heading)}
    </h1>
    ${bodyHtml}
    ${
      ctaUrl
        ? `<p style="margin:24px 0;text-align:center"><a href="${escapeHtml(ctaUrl)}" style="background:#D4AF37;color:#0F172A;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:700;display:inline-block">${escapeHtml(ctaText || "Open")}</a></p>`
        : ""
    }
    <p style="margin:24px 0 0;font-size:12px;color:#57534E;text-align:center">
      &mdash; Kingsman Tags
    </p>
  </div>`;
}

async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.log(`[email] (skipped — no RESEND_API_KEY) ${subject} -> ${to}`);
    return { skipped: true };
  }
  try {
    await axios.post(
      "https://api.resend.com/emails",
      { from: RESEND_FROM, to: [to], subject, html },
      { headers: { Authorization: `Bearer ${RESEND_API_KEY}` }, timeout: 10000 },
    );
    return { sent: true };
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.warn(`[email] send failed (${subject} -> ${to})`, detail);
    return { error: typeof detail === "string" ? detail : JSON.stringify(detail) };
  }
}

async function sendWelcomeEmail(user, sessionToken) {
  const url = `${APP_URL}/account?token=${encodeURIComponent(sessionToken)}`;
  const html = brandedEmailShell({
    heading: `Welcome, ${escapeHtml(user.firstName || "there")}.`,
    bodyHtml: `
      <p style="margin:0 0 14px;line-height:1.6">
        Your Kingsman Tags account is ready. Use the link below to manage your
        renewals or grab a new tag from any device.
      </p>
      <p style="margin:0 0 14px;line-height:1.6;color:#57534E">
        Auto-renewal is on by default &mdash; we&rsquo;ll remind you every ${RENEWAL_PERIOD_DAYS} days so you can
        renew at the same flat price. You can switch it off any time.
      </p>
    `,
    ctaText: "Open my account",
    ctaUrl: url,
  });
  return sendEmail({
    to: user.email,
    subject: "Your Kingsman Tags account is ready",
    html,
  });
}

async function sendRenewalReminderEmail(user, magicToken, amount) {
  const url = `${APP_URL}/renew?token=${encodeURIComponent(magicToken)}`;
  const html = brandedEmailShell({
    heading: `Time to renew, ${escapeHtml(user.firstName || "there")}.`,
    bodyHtml: `
      <p style="margin:0 0 14px;line-height:1.6">
        Your previous tag has been active for ${RENEWAL_PERIOD_DAYS} days. Renew with one tap
        at the same flat price &mdash; <strong>${DISPLAY_CURRENCY_SYMBOL}${amount.toFixed(2)}</strong>.
      </p>
      <p style="margin:0 0 14px;line-height:1.6;color:#57534E">
        Not ready? You can pause auto-reminders from your account.
      </p>
    `,
    ctaText: `Renew for ${DISPLAY_CURRENCY_SYMBOL}${amount.toFixed(2)}`,
    ctaUrl: url,
  });
  return sendEmail({
    to: user.email,
    subject: `Renew your tag for ${DISPLAY_CURRENCY_SYMBOL}${amount.toFixed(2)}`,
    html,
  });
}

// --- Paystack init helper (shared by checkout + renewal) -------------------

async function initPaystackTransaction({ user, amount, reference, source }) {
  if (!PAYSTACK_SECRET_KEY || !PAYSTACK_PUBLIC_KEY) {
    const err = new Error("Payments are not configured on this server.");
    err.status = 503;
    throw err;
  }
  const resp = await paystack.post("/transaction/initialize", {
    email: user.email,
    amount: Math.round(amount * 100),
    currency: PAYSTACK_CURRENCY,
    reference,
    callback_url: `${APP_URL}/success?reference=${encodeURIComponent(reference)}`,
    metadata: {
      firstName: user.firstName,
      lastName: user.lastName,
      userId: user.id,
      source,
      custom_fields: [
        {
          display_name: "Name",
          variable_name: "name",
          value: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
        },
      ],
    },
  });
  const data = resp.data?.data;
  if (!data?.authorization_url || !data?.access_code) {
    const err = new Error("Could not start checkout right now. Please try again.");
    err.status = 502;
    throw err;
  }
  return data;
}

// --- Auth middleware --------------------------------------------------------

function requireAdmin(req, res, next) {
  const pw = req.header("x-admin-password") || req.header("X-Admin-Password");
  if (!pw || pw !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }
  next();
}

async function requireUser(req, res, next) {
  const h = req.header("authorization") || req.header("Authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) return res.status(401).json({ error: "UNAUTHORIZED" });
  const session = await findSession(token);
  if (!session) return res.status(401).json({ error: "UNAUTHORIZED" });
  const user = await findUserById(session.userId);
  if (!user) return res.status(401).json({ error: "UNAUTHORIZED" });
  req.user = user;
  req.sessionToken = token;
  next();
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
    renewalPeriodDays: RENEWAL_PERIOD_DAYS,
  });
});

// -- Checkout ----------------------------------------------------------------

app.post("/api/checkout/init", async (req, res) => {
  try {
    const { email, firstName, lastName, phone, notes } = req.body || {};
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "A valid email is required." });
    }
    if (!firstName || !lastName) {
      return res.status(400).json({ error: "First and last name are required." });
    }
    // Server-side trust: always use the configured TAG_PRICE.
    const finalAmount = TAG_PRICE;
    const user = await ensureUser({ email, firstName, lastName });
    const reference = `kt_${Date.now().toString(36)}_${nanoid(10)}`;
    const data = await initPaystackTransaction({
      user,
      amount: finalAmount,
      reference,
      source: "checkout",
    });

    await upsertOrder({
      id: nanoid(12),
      reference,
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: phone || "",
      notes: notes || "",
      amount: finalAmount,
      currency: DISPLAY_CURRENCY_SYMBOL,
      paystackCurrency: PAYSTACK_CURRENCY,
      status: "pending",
      fulfilled: false,
      createdAt: new Date().toISOString(),
      source: "checkout",
    });

    // Issue a session token straight away so the success page can land them
    // logged in to /account without an email round-trip.
    const { token: sessionToken } = await issueToken({
      userId: user.id,
      kind: "session",
      ttlHours: SESSION_TTL_DAYS * 24,
    });

    res.json({
      reference,
      authorizationUrl: data.authorization_url,
      accessCode: data.access_code,
      sessionToken,
      user,
    });
  } catch (err) {
    console.error("[checkout/init]", err.response?.data || err.message);
    res.status(err.status || 500).json({
      error:
        err.response?.data?.message ||
        err.message ||
        "Could not start checkout right now. Please try again.",
    });
  }
});

app.get("/api/checkout/verify", async (req, res) => {
  const reference = String(req.query.reference || "").trim();
  if (!reference) return res.status(400).json({ error: "Missing reference" });
  if (!PAYSTACK_SECRET_KEY) {
    return res
      .status(503)
      .json({ error: "Payments are not configured on this server." });
  }
  try {
    const r = await paystack.get(`/transaction/verify/${encodeURIComponent(reference)}`);
    const tx = r.data?.data;
    if (!tx) return res.status(502).json({ error: "No transaction found for that reference." });

    const status =
      tx.status === "success" ? "paid" : tx.status === "failed" ? "failed" : "pending";
    const existing = await findOrderByReference(reference);
    const wasAlreadyPaid = existing?.status === "paid";

    // Make sure we have a user record on file for this email.
    const user = await ensureUser({
      email: tx.customer?.email || existing?.email || "",
      firstName: existing?.firstName || tx.metadata?.firstName || "",
      lastName: existing?.lastName || tx.metadata?.lastName || "",
    });

    const updated = await upsertOrder({
      reference,
      id: existing?.id || nanoid(12),
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
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
      source: existing?.source || tx.metadata?.source || "checkout",
    });

    // First time we observe this order as paid, send a welcome email with a
    // permanent management link.
    if (status === "paid" && !wasAlreadyPaid) {
      const { token: sessionToken } = await issueToken({
        userId: user.id,
        kind: "session",
        ttlHours: SESSION_TTL_DAYS * 24,
      });
      sendWelcomeEmail(user, sessionToken).catch((e) =>
        console.warn("[email] welcome send failed", e.message),
      );
    }

    res.json(updated);
  } catch (err) {
    console.error("[checkout/verify]", err.response?.data || err.message);
    res.status(err.status || 500).json({
      error: err.response?.data?.message || err.message || "Could not verify that payment.",
    });
  }
});

// -- Magic-link auth ---------------------------------------------------------

app.post("/api/auth/magic-link", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email.includes("@")) return res.status(400).json({ error: "Enter a valid email." });
    const user = await findUserByEmail(email);
    // Always respond 200 so attackers can't enumerate accounts.
    if (user) {
      const { token } = await issueToken({
        userId: user.id,
        kind: "magic",
        ttlHours: MAGIC_LINK_TTL_HOURS,
      });
      const url = `${APP_URL}/account?token=${encodeURIComponent(token)}`;
      const html = brandedEmailShell({
        heading: "Your sign-in link",
        bodyHtml: `
          <p style="margin:0 0 14px;line-height:1.6">
            Click the button below to sign in to your account. This link expires
            in ${MAGIC_LINK_TTL_HOURS} hours and can only be used once.
          </p>
        `,
        ctaText: "Sign in",
        ctaUrl: url,
      });
      sendEmail({ to: user.email, subject: "Your Kingsman sign-in link", html }).catch(
        () => undefined,
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[auth/magic-link]", err.message);
    res.status(500).json({ error: "Could not send sign-in link right now." });
  }
});

app.get("/api/auth/consume", async (req, res) => {
  const token = String(req.query.token || "").trim();
  if (!token) return res.status(400).json({ error: "Missing token." });
  const consumed = await consumeToken(token);
  if (!consumed) return res.status(400).json({ error: "This link is invalid or has expired." });
  const user = await findUserById(consumed.userId);
  if (!user) return res.status(404).json({ error: "Account not found." });

  // If the link was already a session token, just hand it back. Otherwise mint
  // a fresh session so we don't burn the session token.
  let sessionToken = token;
  if (consumed.kind === "magic") {
    const issued = await issueToken({
      userId: user.id,
      kind: "session",
      ttlHours: SESSION_TTL_DAYS * 24,
    });
    sessionToken = issued.token;
  }
  res.json({ sessionToken, user });
});

app.post("/api/auth/logout", requireUser, async (req, res) => {
  await revokeSession(req.sessionToken);
  res.json({ ok: true });
});

// -- Account -----------------------------------------------------------------

async function accountPayload(user) {
  const orders = await ordersForUser(user.id);
  const lastPaid = orders.find((o) => o.status === "paid") || null;
  return {
    user: {
      ...user,
      nextRenewalDueAt: lastPaid ? computeNextRenewalIso(lastPaid.paidAt || lastPaid.createdAt) : null,
    },
    orders,
  };
}

app.get("/api/account", requireUser, async (req, res) => {
  res.json(await accountPayload(req.user));
});

app.post("/api/account/renewal", requireUser, async (req, res) => {
  const enabled = !!req.body?.enabled;
  const updated = await upsertUser({ ...req.user, renewalEnabled: enabled });
  res.json({ user: updated });
});

app.post("/api/account/renew", requireUser, async (req, res) => {
  try {
    const last = await lastPaidOrderForUser(req.user.id);
    const amount = last?.amount || TAG_PRICE;
    const reference = `kt_renew_${Date.now().toString(36)}_${nanoid(8)}`;
    const data = await initPaystackTransaction({
      user: req.user,
      amount,
      reference,
      source: "renewal",
    });
    await upsertOrder({
      id: nanoid(12),
      reference,
      userId: req.user.id,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      amount,
      currency: DISPLAY_CURRENCY_SYMBOL,
      paystackCurrency: PAYSTACK_CURRENCY,
      status: "pending",
      fulfilled: false,
      createdAt: new Date().toISOString(),
      source: "renewal",
    });
    res.json({
      reference,
      authorizationUrl: data.authorization_url,
      accessCode: data.access_code,
      amount,
    });
  } catch (err) {
    console.error("[account/renew]", err.response?.data || err.message);
    res
      .status(err.status || 500)
      .json({ error: err.message || "Could not start renewal right now." });
  }
});

// -- Admin -------------------------------------------------------------------

app.post("/api/admin/login", (req, res) => {
  const pw = String(req.body?.password || "");
  if (pw !== ADMIN_PASSWORD) return res.status(401).json({ error: "Wrong password" });
  res.json({ ok: true });
});

app.get("/api/admin/orders", requireAdmin, async (_req, res) => {
  const orders = await readJson(ORDERS_FILE);
  orders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json({ orders });
});

app.post("/api/admin/orders/:id/fulfill", requireAdmin, async (req, res) => {
  const orders = await readJson(ORDERS_FILE);
  const idx = orders.findIndex((o) => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Order not found" });
  orders[idx] = { ...orders[idx], fulfilled: true, fulfilledAt: new Date().toISOString() };
  await writeJson(ORDERS_FILE, orders);
  res.json(orders[idx]);
});

app.get("/api/admin/users", requireAdmin, async (_req, res) => {
  const users = await readJson(USERS_FILE);
  const orders = await readJson(ORDERS_FILE);
  const view = users.map((u) => {
    const us = orders.filter((o) => o.userId === u.id);
    const paid = us.filter((o) => o.status === "paid");
    const lastPaid = paid.sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1))[0];
    return {
      ...u,
      ordersCount: us.length,
      lastPaidAt: lastPaid?.paidAt || null,
      totalSpent: paid.reduce((s, o) => s + (Number(o.amount) || 0), 0),
      nextRenewalDueAt: lastPaid ? computeNextRenewalIso(lastPaid.paidAt) : null,
    };
  });
  view.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json({ users: view });
});

app.post("/api/admin/users/:id/send-reminder", requireAdmin, async (req, res) => {
  const user = await findUserById(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const result = await runReminderForUser(user, { force: true });
  res.json({ ok: true, ...result });
});

// -- Renewal sweep -----------------------------------------------------------

async function runReminderForUser(user, { force = false } = {}) {
  if (!user.renewalEnabled && !force) return { sent: false, reason: "renewal disabled" };
  const lastPaid = await lastPaidOrderForUser(user.id);
  if (!lastPaid) return { sent: false, reason: "no paid order yet" };

  const now = Date.now();
  const paidAt = new Date(lastPaid.paidAt || lastPaid.createdAt).getTime();
  const dueAt = paidAt + RENEWAL_PERIOD_DAYS * 86400000;
  if (!force && now < dueAt) {
    return { sent: false, reason: "not due yet" };
  }
  if (!force && user.lastReminderAt) {
    const last = new Date(user.lastReminderAt).getTime();
    if (now - last < REMINDER_COOLDOWN_MS) {
      return { sent: false, reason: "cooldown" };
    }
  }

  const { token } = await issueToken({
    userId: user.id,
    kind: "magic",
    ttlHours: 7 * 24,
  });
  const result = await sendRenewalReminderEmail(user, token, lastPaid.amount || TAG_PRICE);
  await upsertUser({ ...user, lastReminderAt: new Date().toISOString() });
  return { sent: !!result.sent || !!result.skipped, detail: result };
}

async function sweepRenewals() {
  try {
    const users = await readJson(USERS_FILE);
    let touched = 0;
    for (const u of users) {
      if (!u.renewalEnabled) continue;
      const r = await runReminderForUser(u);
      if (r.sent) touched += 1;
    }
    if (touched) console.log(`[renewal] sent ${touched} reminder(s) in this sweep`);
  } catch (err) {
    console.warn("[renewal] sweep failed:", err.message);
  }
}

// --- Boot -------------------------------------------------------------------

app.listen(PORT, async () => {
  await ensureDataDir();
  console.log(`[kingsman-tags] API listening on http://localhost:${PORT}`);
  if (!PAYSTACK_SECRET_KEY) console.warn("[kingsman-tags] PAYSTACK_SECRET_KEY not set");
  if (!RESEND_API_KEY) console.warn("[kingsman-tags] RESEND_API_KEY not set — emails disabled");
  if (ADMIN_PASSWORD === "change-me-please")
    console.warn("[kingsman-tags] Using default admin password — set ADMIN_PASSWORD in .env");
  console.log(
    `[kingsman-tags] Renewal sweep every ${(RENEWAL_CHECK_INTERVAL_MS / 60000).toFixed(0)} min; period ${RENEWAL_PERIOD_DAYS} days`,
  );
  setInterval(sweepRenewals, RENEWAL_CHECK_INTERVAL_MS).unref?.();
  // Kick off one sweep shortly after boot to catch anything overdue.
  setTimeout(sweepRenewals, 5_000).unref?.();
});
