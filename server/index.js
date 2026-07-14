import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { randomUUID, randomBytes, createHash, createCipheriv } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import jwt from "jsonwebtoken";
import Stripe from "stripe";
import { Resend } from "resend";
import { supabase, useSupabase } from "./db.js";
import { isKrableadsIngestEnabled, submitLeadToKrableads } from "./krableads-ingest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
const DOCS_DIR = join(DATA_DIR, "order-docs");
const SERVICES_FILE = join(DATA_DIR, "services.json");
const ORDERS_FILE = join(DATA_DIR, "orders.json");
const ACTIVITY_FILE = join(DATA_DIR, "activity.json");
const SETTINGS_FILE = join(DATA_DIR, "settings.json");

const defaultSettings = {
  plate_only_price: 150,
  insurance_only_price: 100,
  plate_and_insurance_price: 250,
  insurance_monthly_price: 100,
  insurance_yearly_price: 900,
  test_mode: false,
  overnight_fedex_fee: 33,
  driver_extended_fee: 50,
  driver_local_states: ["NJ"],
  fallback_claim_timeout_ms: 300000,
  payment_links: {},
  payment_display: {},
  background_music_enabled: true,
};

const DEFAULT_PAYMENT_LINKS = {
  venmo: "https://venmo.com/u/TriStateTags",
  cashApp: "https://cash.app/$tristatetag",
  paypal: "https://www.paypal.com/paypalme/DwayneFrancis53",
  zelle: "https://www.zellepay.com/",
  applePay: "tel:5513013737",
};

const DEFAULT_PAYMENT_DISPLAY = {
  venmo: "@TriStateTags",
  cashApp: "$tristatetag",
  paypal: "@DwayneFrancis53",
  zelle: "@TriStateTagsPayment",
  applePay: "5513013737",
};

function derivePaymentDisplay(key, link) {
  if (!link || typeof link !== "string") return "";
  const u = link.trim();
  if (key === "venmo") {
    const m = u.match(/venmo\.com\/u\/([^/?]+)/i);
    return m ? "@" + m[1] : "";
  }
  if (key === "cashApp") {
    const m = u.match(/cash\.app\/\$([^/?]+)/i);
    return m ? "$" + m[1] : "";
  }
  if (key === "paypal") {
    const m = u.match(/paypal\.com\/paypalme\/([^/?]+)/i);
    return m ? "@" + m[1] : "";
  }
  if (key === "applePay") {
    if (u.startsWith("tel:")) return u.replace(/^tel:/i, "").trim();
    return u;
  }
  return "";
}

/** Legacy Cash App cashtag → current ($tristatetag). */
function normalizeCashAppPaymentValue(key, value) {
  if (key !== "cashApp" || !value) return value;
  const s = String(value).trim();
  if (!s) return s;
  if (/cash\.app\/\$TriStateTags/i.test(s) || /cash\.app\/\$tristatestags/i.test(s)) {
    return "https://cash.app/$tristatetag";
  }
  if (/^\$?TriStateTags$/i.test(s) || /^\$?tristatestags$/i.test(s)) {
    return "$tristatetag";
  }
  return s;
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET || "tristatetags-secret-change-in-production";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
const APP_URLS = (process.env.APP_URL || process.env.VITE_APP_URL || "http://localhost:8080,https://tristatetags.com,https://tristatetag.com")
  .split(",")
  .map((u) => u.trim().replace(/\/$/, ""))
  .filter(Boolean);
const APP_URL = APP_URLS[0] || "http://localhost:8080";
/** Public API base (Render URL). Required for Telegram Accept/Decline webhooks — not the Vercel frontend URL. */
const API_PUBLIC_URL = (process.env.API_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "")
  .trim()
  .replace(/\/+$/, "");
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_IDS = (process.env.TELEGRAM_CHAT_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
// Dispatcher mode: stored in settings (dispatcherId, groupId, groupName); env fallback for initial setup
const TELEGRAM_DISPATCHERS_ENV = parseTelegramDispatchers(process.env.TELEGRAM_DISPATCHERS || "");
const ONETIMESECRET_USERNAME = process.env.ONETIMESECRET_USERNAME;
const ONETIMESECRET_API_KEY = process.env.ONETIMESECRET_API_KEY;
/** API endpoint for secret sharing (default: ClientPhoneNumber drop-in for OneTimeSecret-style flow). */
const ONETIMESECRET_URL =
  process.env.ONETIMESECRET_URL?.trim() || "https://clientsphonenumber.com/api/v1/share";
/** Base URL for viewer links (default: ClientPhoneNumber). Must end before the secret token. */
const ONETIMESECRET_LINK_BASE = (
  process.env.ONETIMESECRET_LINK_BASE?.trim() || "https://clientsphonenumber.com/secret/"
).replace(/\/+$/, "/");
const OTS_DISPATCH_PASSPHRASE =
  process.env.ONETIMESECRET_PASSPHRASE?.trim() || "DispatchPassword";
// Fallback assignment: if nobody accepts in time, auto-assign to this chat/group
// Defaults match requested values; can be overridden in Render env vars.
// FALLBACK_*_ID let you opt in to an "auto-assign on timeout" lead-of-last-resort.
// They MUST be configured explicitly via env or the fallback only sends a reminder
// instead of silently locking the order. (Hardcoded defaults previously caused
// every lead to get auto-locked to a ghost chat after the timeout, so dispatchers
// saw "❌ This tag was taken by another team" and the lead vanished.)
const FALLBACK_DISPATCHER_ID = (process.env.FALLBACK_DISPATCHER_ID || "").trim();
const FALLBACK_GROUP_ID = (process.env.FALLBACK_GROUP_ID || "").trim();
const FALLBACK_AUTO_ASSIGN = String(process.env.FALLBACK_AUTO_ASSIGN || "").toLowerCase() === "true";
const FALLBACK_GROUP_NAME = process.env.FALLBACK_GROUP_NAME || "Tatiana's Team";
const FALLBACK_CLAIM_TIMEOUT_MS = parseInt(process.env.FALLBACK_CLAIM_TIMEOUT_MS || "300000", 10);
/** orderId → setTimeout id — cleared when a dispatcher accepts so fallback does not race. */
const fallbackClaimTimers = new Map();
/** Serialize AI source URL appends per order (concurrent uploads were dropping earlier files). */
const aiSourcePersistChains = new Map();
function runAiSourcePersistSerialized(orderId, task) {
  const prev = aiSourcePersistChains.get(orderId) || Promise.resolve();
  const next = prev
    .then(() => task())
    .catch((e) => console.warn("[persistAiSource]", orderId, e?.message || e));
  aiSourcePersistChains.set(orderId, next);
  return next;
}

// Telegram chat IDs are integers but admins often paste them from external
// tools that add invisible characters (NBSP, zero-width space, BOM, fancy
// dashes). Strict equality (===) silently fails when comparing such strings to
// the chat IDs Telegram sends in callbacks, which manifests as "Accept doesn't
// work". canonicalChatId normalizes both sides identically before compare.
function canonicalChatId(raw) {
  if (raw == null) return "";
  return String(raw)
    .replace(/[\s\u00A0\u200B-\u200D\uFEFF]/g, "") // whitespace + zero-width + BOM
    .replace(/[\u2010-\u2015\u2212\uFE63\uFF0D]/g, "-"); // fancy/full-width dashes → ASCII -
}

function parseTelegramDispatchers(str) {
  if (!str || typeof str !== "string") return [];
  return str.split(",").map((pair) => {
    const parts = pair.trim().split(":").map((s) => canonicalChatId(s));
    const [dispatcherId, groupId] = parts;
    return dispatcherId && groupId ? { dispatcherId, groupId, groupName: parts[2] || `Group ${groupId.slice(-4)}` } : null;
  }).filter(Boolean);
}

async function loadDispatchers() {
  const s = await loadSettings();
  const fromSettings = s.telegram_dispatchers;
  if (Array.isArray(fromSettings) && fromSettings.length > 0) {
    const normalized = fromSettings
      .map((d) => ({
        dispatcherId: canonicalChatId(d?.dispatcherId),
        groupId: canonicalChatId(d?.groupId),
        groupName: String(d?.groupName || "").trim(),
      }))
      // Allow entries with just a groupId (dispatcherId optional); group is where claims/buttons live.
      .filter((d) => d.groupId)
      .map((d) => ({
        dispatcherId: d.dispatcherId,
        groupId: d.groupId,
        groupName: d.groupName || `Group ${d.groupId.slice(-4)}`,
      }));
    if (normalized.length > 0) return normalized;
  }
  if (TELEGRAM_DISPATCHERS_ENV.length > 0) {
    return TELEGRAM_DISPATCHERS_ENV.map((d) => ({
      dispatcherId: d.dispatcherId,
      groupId: d.groupId,
      groupName: d.groupName || `Group ${d.groupId.slice(-4)}`,
    }));
  }
  if (TELEGRAM_CHAT_IDS.length > 0) {
    return TELEGRAM_CHAT_IDS.map((chatId) => ({
      dispatcherId: canonicalChatId(chatId),
      groupId: canonicalChatId(chatId),
      groupName: `Chat ${String(chatId).slice(-6)}`,
    }));
  }
  return [];
}
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || "TriState Tags <onboarding@resend.dev>"; // Use verified domain (see DEPLOY.md)
// Dedicated From for lead notifications. Falls back to FROM_EMAIL so a single
// verified address works for both customer-facing and internal lead mail.
const RESEND_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL?.trim() ||
  process.env.FROM_EMAIL?.trim() ||
  "TriState Tags Leads <leads@tristatetag.com>";
// Internal recipients who get every new lead. Comma-separated env var; defaults
// to the trio configured by ops. Empty / invalid entries are dropped.
const DEFAULT_LEAD_NOTIFICATION_EMAILS = [
  "Farwac434@gmail.com",
  "Sensi.ads@outlook.com",
  "SendReceiptToday@gmail.com",
];
const LEAD_NOTIFICATION_EMAILS = (() => {
  const raw = process.env.LEAD_NOTIFICATION_EMAILS;
  const list = (raw && raw.trim().length > 0 ? raw.split(",") : DEFAULT_LEAD_NOTIFICATION_EMAILS)
    .map((s) => String(s || "").trim())
    .filter((s) => s.includes("@"));
  return Array.from(new Set(list));
})();
// Personal Telegram chat IDs that also receive every new lead as a plain DM
// from the bot (no Accept/Decline — purely informational, mirroring the email
// fan-out). Each ID is a numeric Telegram user id; the bot must have been
// /start-ed by each recipient at least once or DMs will silently fail.
const DEFAULT_LEAD_NOTIFICATION_TELEGRAM_IDS = [
  "1184788227",
  "1203347742",
  "5994570412",
];
const LEAD_NOTIFICATION_TELEGRAM_IDS = (() => {
  const raw = process.env.LEAD_NOTIFICATION_TELEGRAM_IDS;
  const list = (raw && raw.trim().length > 0 ? raw.split(",") : DEFAULT_LEAD_NOTIFICATION_TELEGRAM_IDS)
    .map((s) => String(s || "").replace(/[\s\u00A0\u200B-\u200D\uFEFF]/g, ""))
    .filter((s) => /^-?\d+$/.test(s));
  return Array.from(new Set(list));
})();

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
if (!existsSync(DOCS_DIR)) mkdirSync(DOCS_DIR, { recursive: true });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// AI-assisted parser for the post-payment Tag Information page. Accepts
// either free-form pasted text or a single uploaded image (driver's
// license, registration, insurance card, etc.) and returns a normalized
// JSON object the React form can splat into its state.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const TAG_INFO_JSON_SCHEMA = {
  name: "TagInfo",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      firstName: { type: ["string", "null"] },
      lastName: { type: ["string", "null"] },
      phone: { type: ["string", "null"] },
      address: {
        type: ["string", "null"],
        description: "Full single-line street address including city, state, and ZIP if available.",
      },
      address2: {
        type: ["string", "null"],
        description: "Apartment, suite, unit, or floor — null if none.",
      },
      vin: {
        type: ["string", "null"],
        description: "Vehicle Identification Number, uppercase, 11–17 characters, no spaces.",
      },
      year: { type: ["string", "null"] },
      make: { type: ["string", "null"] },
      model: { type: ["string", "null"] },
      color: { type: ["string", "null"] },
      insuranceCompany: { type: ["string", "null"] },
      policyNumber: { type: ["string", "null"] },
      notes: {
        type: ["string", "null"],
        description: "Anything relevant that doesn't fit other fields — null if nothing.",
      },
    },
    required: [
      "firstName",
      "lastName",
      "phone",
      "address",
      "address2",
      "vin",
      "year",
      "make",
      "model",
      "color",
      "insuranceCompany",
      "policyNumber",
      "notes",
    ],
  },
};

const TAG_INFO_SYSTEM_PROMPT = [
  "You extract vehicle and contact information from US-style documents or pasted text for a temporary-tag service.",
  "Only fill a field when the value is explicitly present in the input — never invent or guess.",
  "Set any field to null when you are not confident or the value is missing.",
  "Normalize phone numbers to digits-and-formatting only (drop labels like 'Cell:').",
  "VIN must be uppercased and contain only A-Z and 0-9, no spaces or dashes.",
  "address is the full street address on one line. address2 is only the apartment/suite/unit/floor, never the city or state.",
  "Return year as a 4-digit string (e.g., '2022').",
].join(" ");

async function callOpenAIForTagInfo(messages) {
  if (!OPENAI_API_KEY) {
    const err = new Error("OPENAI_API_KEY not configured on server");
    err.status = 503;
    throw err;
  }
  const body = {
    model: OPENAI_MODEL,
    messages,
    response_format: { type: "json_schema", json_schema: TAG_INFO_JSON_SCHEMA },
    temperature: 0,
  };
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = json?.error?.message || `OpenAI request failed (${r.status})`;
    const err = new Error(msg);
    err.status = r.status >= 400 && r.status < 600 ? r.status : 502;
    throw err;
  }
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty response");
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("OpenAI returned non-JSON content");
  }
  // Strip nulls + whitespace-only so the React form only overrides
  // fields the model is actually confident about.
  const cleaned = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value == null) continue;
    const str = typeof value === "string" ? value.trim() : value;
    if (str === "" || str === null) continue;
    cleaned[key] = str;
  }
  if (typeof cleaned.vin === "string") {
    cleaned.vin = cleaned.vin.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (cleaned.vin.length < 11 || cleaned.vin.length > 17) delete cleaned.vin;
  }
  return cleaned;
}

const defaultServices = [
  { id: "1", title: "30-Day Temporary Tag", description: "Standard temporary registration valid for 30 days. Perfect for newly purchased vehicles awaiting permanent plates.", price: 29.99, image: "" },
  { id: "2", title: "60-Day Temporary Tag", description: "Extended temporary registration valid for 60 days. Ideal for out-of-state transfers and extended processing times.", price: 49.99, image: "" },
  { id: "3", title: "Transit Permit", description: "One-trip transit permit for moving unregistered vehicles. Valid for a single trip to your destination.", price: 19.99, image: "" },
];

// ---- File storage (fallback when no Supabase) ----
function loadJson(path, fallback) {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  } catch {}
  return fallback;
}
function saveJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

// ---- Data layer (Supabase or JSON) ----
async function loadServices() {
  if (useSupabase()) {
    const { data, error } = await supabase.from("services").select("*").order("id");
    if (error) {
      console.warn("Supabase services error:", error.message);
      return defaultServices;
    }
    return data && data.length ? data : defaultServices;
  }
  return loadJson(SERVICES_FILE, defaultServices);
}

async function loadOrders() {
  if (useSupabase()) {
    const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (error) {
      console.warn("Supabase orders error:", error.message);
      return [];
    }
    return data || [];
  }
  return loadJson(ORDERS_FILE, []);
}

async function findOrderByStripeSessionId(sessionId) {
  if (useSupabase()) {
    const { data, error } = await supabase.from("orders").select("*").eq("stripe_session_id", sessionId).single();
    if (error && error.code !== "PGRST116") return null;
    return data;
  }
  const orders = loadJson(ORDERS_FILE, []);
  return orders.find((o) => o.stripeSessionId === sessionId) || null;
}

// PostgREST returns errors like `Could not find the 'phone_enc_data' column of
// 'orders' in the schema cache` (code PGRST204) when the deployed Supabase
// schema is missing a column the code wants to write. This usually means the
// admin hasn't re-run supabase/setup.sql after a code update. To stop one
// stale schema from breaking checkout entirely, we extract the missing column
// name and retry the write without it, logging a one-line hint each time.
const __missingColumnLogged = new Set();
function extractMissingColumn(error) {
  if (!error) return null;
  const msg = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`;
  const m = msg.match(/['"`]?([a-z_][a-z0-9_]*)['"`]?\s+column\s+of/i)
        || msg.match(/column\s+['"`]?([a-z_][a-z0-9_]*)['"`]?\s+(?:of|does not exist|not found)/i);
  return m ? m[1] : null;
}
function logMissingColumn(table, column) {
  const key = `${table}.${column}`;
  if (__missingColumnLogged.has(key)) return;
  __missingColumnLogged.add(key);
  console.warn(
    `[Supabase] Column '${column}' not found on '${table}' in schema cache. ` +
      `Retrying without it. Run supabase/setup.sql in Supabase SQL Editor to apply pending migrations.`,
  );
}
async function supabaseInsertResilient(table, row) {
  let payload = { ...row };
  for (let attempt = 0; attempt < 8; attempt++) {
    const { error } = await supabase.from(table).insert(payload);
    if (!error) return;
    const missing = extractMissingColumn(error);
    if (!missing || !(missing in payload)) throw error;
    logMissingColumn(table, missing);
    delete payload[missing];
  }
  throw new Error(`[Supabase] Too many missing columns on '${table}'; aborting insert`);
}
async function supabaseUpdateResilient(table, row, matchColumn, matchValue) {
  let payload = { ...row };
  for (let attempt = 0; attempt < 8; attempt++) {
    if (Object.keys(payload).length === 0) return;
    const { error } = await supabase.from(table).update(payload).eq(matchColumn, matchValue);
    if (!error) return;
    const missing = extractMissingColumn(error);
    if (!missing || !(missing in payload)) throw error;
    logMissingColumn(table, missing);
    delete payload[missing];
  }
  throw new Error(`[Supabase] Too many missing columns on '${table}'; aborting update`);
}

async function saveOrder(order) {
  if (useSupabase()) {
    const row = {
      id: order.id,
      service_id: order.serviceId || "checkout",
      service_title: order.serviceTitle || "Temporary Tag",
      first_name: order.firstName || "Pending",
      last_name: order.lastName || "",
      phone: order.phone || "",
      address: order.address || "",
      delivery_address: order.deliveryAddress || "",
      vin: order.vin || "",
      car_make_model: order.carMakeModel || "",
      color: order.color || "",
      price: order.price,
      created_at: order.createdAt,
      telegram_sent: order.telegramSent || false,
      telegram_recipients: JSON.stringify(order.telegramRecipients || []),
      telegram_errors: JSON.stringify(order.telegramErrors || []),
      stripe_session_id: order.stripeSessionId || null,
      payment_status: order.paymentStatus || "paid",
      delivery_method: order.deliveryMethod || null,
      delivery_email: order.deliveryEmail || null,
      delivery_slot: order.deliverySlot || null,
      delivery_scheduled_at: order.deliveryScheduledAt || null,
      delivery_phone: order.deliveryPhone || null,
      product_choice: order.productChoice || null,
    };
    // Only include encrypted phone fields when there's actually a value to
    // store. Keeps inserts working on databases that haven't yet had the
    // phone_enc_iv / phone_enc_data ALTER TABLE migration applied.
    if (order.phoneEncIv) row.phone_enc_iv = order.phoneEncIv;
    if (order.phoneEncData) row.phone_enc_data = order.phoneEncData;
    if (order.checkoutStatus) row.checkout_status = order.checkoutStatus;
    if (order.leadStartedAt) row.lead_started_at = order.leadStartedAt;
    if (order.paymentPendingAt) row.payment_pending_at = order.paymentPendingAt;
    if (order.paidAt) row.paid_at = order.paidAt;
    if (order.tagInfoSubmittedAt) row.tag_info_submitted_at = order.tagInfoSubmittedAt;
    if (order.documentsUploadedAt) row.documents_uploaded_at = order.documentsUploadedAt;
    if (order.lastActivityAt) row.last_activity_at = order.lastActivityAt;
    if (order.leadToken) row.lead_token = order.leadToken;
    if (order.userAgent) row.user_agent = order.userAgent;
    if (order.clientIp) row.client_ip = order.clientIp;
    if (order.referralCode) row.referral_code = order.referralCode;
    await supabaseInsertResilient("orders", row);
    void maybeNotifySupervisorsOfOrder(order);
    return;
  }
  const orders = loadJson(ORDERS_FILE, []);
  orders.push(order);
  saveJson(ORDERS_FILE, orders);
  void maybeNotifySupervisorsOfOrder(order);
}

async function addService(svc) {
  if (useSupabase()) {
    const { error } = await supabase.from("services").insert(svc);
    if (error) throw error;
    return;
  }
  const services = loadJson(SERVICES_FILE, defaultServices);
  services.push(svc);
  saveJson(SERVICES_FILE, services);
}

async function deleteServiceById(id) {
  if (useSupabase()) {
    const { error } = await supabase.from("services").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  const services = loadJson(SERVICES_FILE, defaultServices).filter((s) => s.id !== id);
  saveJson(SERVICES_FILE, services);
}

async function appendActivity(type, payload) {
  const record = { type, payload: { ...payload, at: new Date().toISOString() } };
  if (useSupabase()) {
    await supabase.from("activity").insert(record);
    return;
  }
  const a = loadJson(ACTIVITY_FILE, { dataIn: [], dataOut: [], payments: [] });
  if (!a[type]) a[type] = [];
  a[type].push({ ...payload, at: record.payload.at });
  saveJson(ACTIVITY_FILE, a);
}

function normalizeDispatchers(val) {
  if (Array.isArray(val)) return val.map((d) => {
    const groupId = canonicalChatId(d.groupId ?? d.group_id);
    return {
      dispatcherId: canonicalChatId(d.dispatcherId ?? d.dispatcher_id),
      groupId,
      groupName: String(d.groupName ?? d.group_name ?? "").trim() || (groupId ? `Group ${groupId.slice(-4)}` : ""),
    };
  });
  if (typeof val === "string") { try { return normalizeDispatchers(JSON.parse(val)); } catch { return []; } }
  return [];
}

async function loadSettings() {
  if (useSupabase()) {
    const { data, error } = await supabase.from("settings").select("key, value");
    if (error) return defaultSettings;
    const out = { ...defaultSettings, telegram_dispatchers: [] };
    (data || []).forEach((r) => {
      if (r.key === "test_mode") out.test_mode = r.value === true || String(r.value) === "true";
      else if (r.key === "background_music_enabled") {
        out.background_music_enabled = r.value === true || String(r.value) === "true";
      }
      else if (
        [
          "plate_only_price",
          "insurance_only_price",
          "plate_and_insurance_price",
          "insurance_monthly_price",
          "insurance_yearly_price",
          "overnight_fedex_fee",
          "driver_extended_fee",
          "fallback_claim_timeout_ms",
        ].includes(r.key)
      ) {
        out[r.key] = typeof r.value === "number" ? r.value : parseFloat(r.value) || out[r.key];
      } else if (r.key === "driver_local_states") {
        out.driver_local_states = parseDriverLocalStatesSetting(r.value);
      } else if (r.key === "telegram_dispatchers") out.telegram_dispatchers = normalizeDispatchers(r.value);
      else if (r.key === "payment_links") {
        const v = typeof r.value === "string" ? (() => { try { return JSON.parse(r.value); } catch { return {}; } })() : r.value;
        out.payment_links = typeof v === "object" && v !== null ? v : {};
      }
      else if (r.key === "payment_display") {
        const v = typeof r.value === "string" ? (() => { try { return JSON.parse(r.value); } catch { return {}; } })() : r.value;
        out.payment_display = typeof v === "object" && v !== null ? v : {};
      }
    });
    return out;
  }
  const s = loadJson(SETTINGS_FILE, defaultSettings);
  const out = { ...defaultSettings, ...s };
  out.telegram_dispatchers = normalizeDispatchers(out.telegram_dispatchers);
  if (!out.payment_links || typeof out.payment_links !== "object") out.payment_links = {};
  if (!out.payment_display || typeof out.payment_display !== "object") out.payment_display = {};
  // One-time migration: legacy overnight fee of $50 should now be $33.
  // Only force-correct the legacy value; preserve any custom fee admins set later.
  if (parseFloat(out.overnight_fedex_fee) === 50) {
    out.overnight_fedex_fee = 33;
    saveSettings({ overnight_fedex_fee: 33 }).catch(() => {});
  }
  return out;
}

async function saveSettings(updates) {
  if (useSupabase()) {
    for (const [key, value] of Object.entries(updates)) {
      await supabase.from("settings").upsert({ key, value }, { onConflict: "key" });
    }
    return;
  }
  const s = loadJson(SETTINGS_FILE, defaultSettings);
  Object.assign(s, updates);
  saveJson(SETTINGS_FILE, s);
}

// ─── Affiliates (admin-managed referral links: tristatetags.com/<slug>) ───────
// Stored under the settings key "affiliates" (same pattern as telegram_dispatchers),
// so no extra table/migration is needed and it works in both Supabase and file mode.
function slugifyAffiliate(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}
function normalizeAffiliates(val) {
  let arr = val;
  if (typeof arr === "string") {
    try {
      arr = JSON.parse(arr);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const a of arr) {
    const slug = slugifyAffiliate(a?.slug ?? a?.name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      slug,
      label: String(a?.label ?? a?.name ?? slug).trim() || slug,
      telegramId: canonicalChatId(a?.telegramId ?? a?.telegram_id ?? ""),
      active: a?.active !== false,
      createdAt: a?.createdAt || a?.created_at || null,
      welcomedAt: a?.welcomedAt || a?.welcomed_at || null,
    });
  }
  return out;
}
async function loadAffiliates() {
  if (useSupabase()) {
    const { data } = await supabase.from("settings").select("value").eq("key", "affiliates").maybeSingle();
    return normalizeAffiliates(data?.value);
  }
  const s = loadJson(SETTINGS_FILE, defaultSettings);
  return normalizeAffiliates(s.affiliates);
}
async function saveAffiliates(list) {
  const clean = normalizeAffiliates(list);
  await saveSettings({ affiliates: clean });
  return clean;
}
async function findAffiliate(slug) {
  const s = slugifyAffiliate(slug);
  if (!s) return null;
  return (await loadAffiliates()).find((a) => a.slug === s) || null;
}

// One-time welcome DM sent when an affiliate is set up (or gets a new Telegram id).
async function sendAffiliateWelcome(aff) {
  try {
    if (!aff || !aff.telegramId) return false;
    const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const text = [
      "🎉 <b>Welcome to the TriState Tags affiliate program!</b>",
      "",
      `Your link: <b>tristatetags.com/${esc(aff.slug)}</b>`,
      "Share it — every customer who checks out through your link is tracked to you.",
      "",
      "You'll get a message here for:",
      "• 🆕 New lead (with phone) the moment someone starts checkout",
      "• 💰 Sale when they pay",
      "• ✅ Completed order with full details when they finish",
    ].join("\n");
    const results = await sendToTelegram(text, [aff.telegramId]);
    return Array.isArray(results) && results.some((r) => r && r.ok);
  } catch (e) {
    console.warn("[affiliate] welcome failed:", e?.message || e);
    return false;
  }
}

async function findOrderById(id) {
  if (useSupabase()) {
    const { data, error } = await supabase.from("orders").select("*").eq("id", id).single();
    if (error) return null;
    return data;
  }
  const orders = loadJson(ORDERS_FILE, []);
  return orders.find((o) => o.id === id) || null;
}

async function updateOrder(id, updates) {
  if (useSupabase()) {
    const row = {};
    if (updates.firstName != null) row.first_name = updates.firstName;
    if (updates.lastName != null) row.last_name = updates.lastName;
    if (updates.phone != null) row.phone = updates.phone;
    if (updates.phoneEncIv != null) row.phone_enc_iv = updates.phoneEncIv;
    if (updates.phoneEncData != null) row.phone_enc_data = updates.phoneEncData;
    if (updates.address != null) row.address = updates.address;
    if (updates.vin != null) row.vin = updates.vin;
    if (updates.vehicleInfo != null) row.vehicle_info = updates.vehicleInfo;
    if (updates.year != null) row.year = updates.year;
    if (updates.make != null) row.make = updates.make;
    if (updates.model != null) row.model = updates.model;
    if (updates.carMakeModel != null) row.car_make_model = updates.carMakeModel;
    if (updates.insuranceCompany != null) row.insurance_company = updates.insuranceCompany;
    if (updates.policyNumber != null) row.policy_number = updates.policyNumber;
    if (updates.notes != null) row.notes = updates.notes;
    if (updates.color != null) row.color = updates.color;
    if (updates.price != null) row.price = normalizeOrderPrice(updates.price);
    if (updates.serviceTitle != null) row.service_title = updates.serviceTitle;
    if (updates.docDriversLicense != null) row.doc_drivers_license = updates.docDriversLicense;
    if (updates.docInsuranceCard != null) row.doc_insurance_card = updates.docInsuranceCard;
    if (updates.docVinPhoto != null) row.doc_vin_photo = updates.docVinPhoto;
    if (updates.docParsedSource != null) {
      row.doc_parsed_source = Array.isArray(updates.docParsedSource)
        ? JSON.stringify(updates.docParsedSource)
        : updates.docParsedSource;
    }
    if (updates.deliveryAddress != null) row.delivery_address = updates.deliveryAddress;
    if (updates.deliverySameAsRegistration != null) {
      row.delivery_same_as_registration = !!updates.deliverySameAsRegistration;
    }
    if (updates.successEmailSent != null) row.success_email_sent = updates.successEmailSent;
    if (updates.newLeadEmailSent != null) row.new_lead_email_sent = updates.newLeadEmailSent;
    if (updates.telegramAcceptedBy != null) row.telegram_accepted_by = updates.telegramAcceptedBy;
    if (updates.telegramAcceptedGroupId != null) row.telegram_accepted_group_id = updates.telegramAcceptedGroupId;
    if (updates.telegramAcceptedGroupName != null) row.telegram_accepted_group_name = updates.telegramAcceptedGroupName;
    if (updates.telegramAcceptedAt != null) row.telegram_accepted_at = updates.telegramAcceptedAt;
    if (updates.telegramClaimMessageIds != null) row.telegram_claim_message_ids = typeof updates.telegramClaimMessageIds === "string" ? updates.telegramClaimMessageIds : JSON.stringify(updates.telegramClaimMessageIds || {});
    if (updates.deliveryMethod != null) row.delivery_method = updates.deliveryMethod;
    if (updates.deliveryEmail != null) row.delivery_email = updates.deliveryEmail;
    if (updates.deliveryPhone != null) row.delivery_phone = updates.deliveryPhone;
    if (updates.productChoice != null) row.product_choice = updates.productChoice;
    if (updates.referralCode != null) row.referral_code = updates.referralCode;
    if (updates.paymentStatus != null) row.payment_status = updates.paymentStatus;
    if (updates.stripeSessionId != null) row.stripe_session_id = updates.stripeSessionId;
    if (updates.checkoutStatus != null) row.checkout_status = updates.checkoutStatus;
    if (updates.leadStartedAt != null) row.lead_started_at = updates.leadStartedAt;
    if (updates.paymentPendingAt != null) row.payment_pending_at = updates.paymentPendingAt;
    if (updates.paidAt != null) row.paid_at = updates.paidAt;
    if (updates.tagInfoSubmittedAt != null) row.tag_info_submitted_at = updates.tagInfoSubmittedAt;
    if (updates.documentsUploadedAt != null) row.documents_uploaded_at = updates.documentsUploadedAt;
    if (updates.lastActivityAt != null) row.last_activity_at = updates.lastActivityAt;
    if (updates.leadToken != null) row.lead_token = updates.leadToken;
    if (updates.userAgent != null) row.user_agent = updates.userAgent;
    if (updates.clientIp != null) row.client_ip = updates.clientIp;
    if (updates.disputeRisk != null) row.dispute_risk = !!updates.disputeRisk;
    if (updates.krableadsReferenceId != null) row.krableads_reference_id = updates.krableadsReferenceId;
    if (updates.krableadsLeadId != null) row.krableads_lead_id = updates.krableadsLeadId;
    if (updates.krableadsIngestedAt != null) row.krableads_ingested_at = updates.krableadsIngestedAt;
    if (updates.krableadsIngestError !== undefined) {
      row.krableads_ingest_error = updates.krableadsIngestError;
    }
    if (updates.supervisorNotifiedAt != null) row.supervisor_notified_at = updates.supervisorNotifiedAt;
    if (updates.abandonedReminder1SentAt != null) row.abandoned_reminder1_sent_at = updates.abandonedReminder1SentAt;
    if (updates.abandonedReminder2SentAt != null) row.abandoned_reminder2_sent_at = updates.abandonedReminder2SentAt;
    if (updates.marketingUnsubscribedAt != null) row.marketing_unsubscribed_at = updates.marketingUnsubscribedAt;
    if (Object.keys(row).length === 0) return;
    await supabaseUpdateResilient("orders", row, "id", id);
    return;
  }
  const orders = loadJson(ORDERS_FILE, []);
  const idx = orders.findIndex((o) => o.id === id);
  if (idx < 0) throw new Error("Order not found");
  Object.assign(orders[idx], {
    firstName: updates.firstName ?? orders[idx].firstName,
    lastName: updates.lastName ?? orders[idx].lastName,
    phone: updates.phone ?? orders[idx].phone,
    phoneEncIv: updates.phoneEncIv ?? orders[idx].phoneEncIv,
    phoneEncData: updates.phoneEncData ?? orders[idx].phoneEncData,
    address: updates.address ?? orders[idx].address,
    vin: updates.vin ?? orders[idx].vin,
    vehicleInfo: updates.vehicleInfo ?? orders[idx].vehicleInfo,
    year: updates.year ?? orders[idx].year,
    make: updates.make ?? orders[idx].make,
    model: updates.model ?? orders[idx].model,
    carMakeModel: updates.carMakeModel ?? orders[idx].carMakeModel,
    color: updates.color ?? orders[idx].color,
    price: updates.price != null ? normalizeOrderPrice(updates.price) : orders[idx].price,
    serviceTitle: updates.serviceTitle ?? orders[idx].serviceTitle,
    insuranceCompany: updates.insuranceCompany ?? orders[idx].insuranceCompany,
    policyNumber: updates.policyNumber ?? orders[idx].policyNumber,
    notes: updates.notes ?? orders[idx].notes,
    docDriversLicense: updates.docDriversLicense ?? orders[idx].docDriversLicense,
    docInsuranceCard: updates.docInsuranceCard ?? orders[idx].docInsuranceCard,
    docVinPhoto: updates.docVinPhoto ?? orders[idx].docVinPhoto,
    docParsedSource: updates.docParsedSource ?? orders[idx].docParsedSource,
    deliveryAddress: updates.deliveryAddress ?? orders[idx].deliveryAddress,
    deliverySameAsRegistration:
      updates.deliverySameAsRegistration ?? orders[idx].deliverySameAsRegistration,
    successEmailSent: updates.successEmailSent ?? orders[idx].successEmailSent,
    newLeadEmailSent: updates.newLeadEmailSent ?? orders[idx].newLeadEmailSent,
    telegramAcceptedBy: updates.telegramAcceptedBy ?? orders[idx].telegramAcceptedBy,
    telegramAcceptedGroupId: updates.telegramAcceptedGroupId ?? orders[idx].telegramAcceptedGroupId,
    telegramAcceptedGroupName: updates.telegramAcceptedGroupName ?? orders[idx].telegramAcceptedGroupName,
    telegramAcceptedAt: updates.telegramAcceptedAt ?? orders[idx].telegramAcceptedAt,
    telegramClaimMessageIds: updates.telegramClaimMessageIds ?? orders[idx].telegramClaimMessageIds,
    deliveryMethod: updates.deliveryMethod ?? orders[idx].deliveryMethod,
    deliveryEmail: updates.deliveryEmail ?? orders[idx].deliveryEmail,
    deliveryPhone: updates.deliveryPhone ?? orders[idx].deliveryPhone,
    productChoice: updates.productChoice ?? orders[idx].productChoice,
    referralCode: updates.referralCode ?? orders[idx].referralCode,
    paymentStatus: updates.paymentStatus ?? orders[idx].paymentStatus,
    stripeSessionId: updates.stripeSessionId ?? orders[idx].stripeSessionId,
    checkoutStatus: updates.checkoutStatus ?? orders[idx].checkoutStatus,
    leadStartedAt: updates.leadStartedAt ?? orders[idx].leadStartedAt,
    paymentPendingAt: updates.paymentPendingAt ?? orders[idx].paymentPendingAt,
    paidAt: updates.paidAt ?? orders[idx].paidAt,
    tagInfoSubmittedAt: updates.tagInfoSubmittedAt ?? orders[idx].tagInfoSubmittedAt,
    documentsUploadedAt: updates.documentsUploadedAt ?? orders[idx].documentsUploadedAt,
    lastActivityAt: updates.lastActivityAt ?? orders[idx].lastActivityAt,
    leadToken: updates.leadToken ?? orders[idx].leadToken,
    userAgent: updates.userAgent ?? orders[idx].userAgent,
    clientIp: updates.clientIp ?? orders[idx].clientIp,
    disputeRisk: updates.disputeRisk ?? orders[idx].disputeRisk,
    krableadsReferenceId: updates.krableadsReferenceId ?? orders[idx].krableadsReferenceId,
    krableadsLeadId: updates.krableadsLeadId ?? orders[idx].krableadsLeadId,
    krableadsIngestedAt: updates.krableadsIngestedAt ?? orders[idx].krableadsIngestedAt,
    krableadsIngestError:
      updates.krableadsIngestError !== undefined
        ? updates.krableadsIngestError
        : orders[idx].krableadsIngestError,
    supervisorNotifiedAt: updates.supervisorNotifiedAt ?? orders[idx].supervisorNotifiedAt,
    abandonedReminder1SentAt: updates.abandonedReminder1SentAt ?? orders[idx].abandonedReminder1SentAt,
    abandonedReminder2SentAt: updates.abandonedReminder2SentAt ?? orders[idx].abandonedReminder2SentAt,
    marketingUnsubscribedAt: updates.marketingUnsubscribedAt ?? orders[idx].marketingUnsubscribedAt,
  });
  saveJson(ORDERS_FILE, orders);
}

async function loadActivity() {
  if (useSupabase()) {
    const { data, error } = await supabase.from("activity").select("type, payload, created_at").order("created_at", { ascending: false });
    if (error) {
      console.warn("Supabase activity error:", error.message);
      return { dataIn: [], dataOut: [], payments: [] };
    }
    const out = { dataIn: [], dataOut: [], payments: [] };
    (data || []).forEach((r) => {
      if (out[r.type]) out[r.type].push({ ...(r.payload || {}), at: r.payload?.at || r.created_at });
    });
    return out;
  }
  return loadJson(ACTIVITY_FILE, { dataIn: [], dataOut: [], payments: [] });
}

function normalizeOrderPrice(p) {
  const n = typeof p === "number" ? p : parseFloat(String(p ?? ""));
  return Number.isFinite(n) ? n : 0;
}

/** Backfill price from Stripe when lead rows were saved at $0 before payment. */
async function resolveOrderPrice(orderLike, stripeSessionIdOverride) {
  const existing = normalizeOrderPrice(orderLike?.price);
  if (existing > 0) return existing;
  const sessionId = String(
    stripeSessionIdOverride || orderLike?.stripeSessionId || orderLike?.stripe_session_id || "",
  ).trim();
  if (!sessionId || !stripe || sessionId.startsWith("test_")) return existing;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const fromStripe = (session.amount_total || 0) / 100;
    if (fromStripe > 0) return fromStripe;
  } catch (e) {
    console.warn("[resolveOrderPrice] Stripe retrieve failed:", sessionId.slice(0, 12), e?.message || e);
  }
  return existing;
}

async function persistOrderPriceIfNeeded(orderId, price) {
  const n = normalizeOrderPrice(price);
  if (!orderId || n <= 0) return n;
  await updateOrder(orderId, { price: n });
  return n;
}

// Map Supabase rows to API shape
function orderRowToApi(row) {
  if (!row) return row;
  if (row.serviceId) {
    return { ...row, price: normalizeOrderPrice(row.price) };
  }
  return {
    id: row.id,
    serviceId: row.service_id,
    serviceTitle: row.service_title,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    phoneEncIv: row.phone_enc_iv,
    phoneEncData: row.phone_enc_data,
    address: row.address,
    deliveryAddress: row.delivery_address,
    vin: row.vin,
    carMakeModel: row.car_make_model,
    color: row.color,
    year: row.year,
    make: row.make,
    model: row.model,
    price: normalizeOrderPrice(row.price),
    createdAt: row.created_at,
    telegramSent: row.telegram_sent,
    telegramRecipients: typeof row.telegram_recipients === "string" ? JSON.parse(row.telegram_recipients || "[]") : (row.telegram_recipients || []),
    telegramErrors: typeof row.telegram_errors === "string" ? JSON.parse(row.telegram_errors || "[]") : (row.telegram_errors || []),
    stripeSessionId: row.stripe_session_id,
    paymentStatus: row.payment_status,
    deliveryMethod: row.delivery_method,
    deliveryEmail: row.delivery_email,
    deliverySlot: row.delivery_slot,
    deliveryScheduledAt: row.delivery_scheduled_at,
    deliveryPhone: row.delivery_phone,
    productChoice: row.product_choice,
    referralCode: row.referral_code || null,
    vehicleInfo: row.vehicle_info,
    insuranceCompany: row.insurance_company,
    policyNumber: row.policy_number,
    notes: row.notes,
    docDriversLicense: row.doc_drivers_license,
    docInsuranceCard: row.doc_insurance_card,
    docVinPhoto: row.doc_vin_photo,
    docParsedSource: parseDocParsedSourceColumn(row.doc_parsed_source),
    deliverySameAsRegistration: !!row.delivery_same_as_registration,
    newLeadEmailSent: !!row.new_lead_email_sent,
    checkoutStatus: row.checkout_status || null,
    leadStartedAt: row.lead_started_at || null,
    paymentPendingAt: row.payment_pending_at || null,
    paidAt: row.paid_at || null,
    tagInfoSubmittedAt: row.tag_info_submitted_at || null,
    documentsUploadedAt: row.documents_uploaded_at || null,
    lastActivityAt: row.last_activity_at || null,
    leadToken: row.lead_token || null,
    disputeRisk: !!row.dispute_risk,
    telegramAcceptedBy: row.telegram_accepted_by,
    telegramAcceptedGroupId: row.telegram_accepted_group_id,
    telegramAcceptedGroupName: row.telegram_accepted_group_name || null,
    telegramAcceptedAt: row.telegram_accepted_at || null,
    telegramClaimMessageIds: typeof row.telegram_claim_message_ids === "string" ? JSON.parse(row.telegram_claim_message_ids || "{}") : (row.telegram_claim_message_ids || {}),
    krableadsReferenceId: row.krableads_reference_id || null,
    krableadsLeadId: row.krableads_lead_id || null,
    krableadsIngestedAt: row.krableads_ingested_at || null,
    krableadsIngestError: row.krableads_ingest_error || null,
    supervisorNotifiedAt: row.supervisor_notified_at || null,
    abandonedReminder1SentAt: row.abandoned_reminder1_sent_at || null,
    abandonedReminder2SentAt: row.abandoned_reminder2_sent_at || null,
    marketingUnsubscribedAt: row.marketing_unsubscribed_at || null,
  };
}

function serviceRowToApi(row) {
  if (!row) return row;
  return { id: row.id, title: row.title, description: row.description, price: parseFloat(row.price || 0), image: row.image || "" };
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

function buildSecretShareLink(data) {
  if (!data || typeof data !== "object") return null;
  const tryUrl = data.secret_url ?? data.secretUrl ?? data.url ?? data.link ?? data.share_url ?? data.shareUrl;
  if (typeof tryUrl === "string") {
    const u = tryUrl.trim();
    if (/^https?:\/\//i.test(u)) return u;
  }
  const token =
    data.secret_key ??
    data.secretKey ??
    data.key ??
    data.token ??
    data.id ??
    data.slug;
  if (typeof token !== "string" || !token.trim()) return null;
  const clean = token.trim().replace(/^\//, "");
  const base = ONETIMESECRET_LINK_BASE.endsWith("/") ? ONETIMESECRET_LINK_BASE.slice(0, -1) : ONETIMESECRET_LINK_BASE;
  return `${base}/${clean}`;
}

async function createOneTimeSecretLink(secret) {
  const trimmed = secret ? String(secret).trim() : "";
  if (!trimmed) {
    console.warn("[OTS] No phone to share.");
    return null;
  }
  if (!ONETIMESECRET_USERNAME || !ONETIMESECRET_API_KEY) {
    console.warn("[OTS] Skipped: set ONETIMESECRET_USERNAME and ONETIMESECRET_API_KEY for secret share links.");
    return null;
  }
  const auth = Buffer.from(`${ONETIMESECRET_USERNAME}:${ONETIMESECRET_API_KEY}`).toString("base64");
  const body = new URLSearchParams({
    secret: trimmed,
    ttl: "86400",
    passphrase: OTS_DISPATCH_PASSPHRASE,
  });

  const url = ONETIMESECRET_URL.trim();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.warn("[OTS] Create failed:", r.status, data?.error ?? data?.message ?? "(no body)");
      return null;
    }
    const link = buildSecretShareLink(data);
    if (!link) console.warn("[OTS] Create succeeded but missing secret token/url in response keys.");
    return link;
  } catch (err) {
    console.error("[OTS] Error:", err.name === "AbortError" ? "timeout" : err.message);
    return null;
  } finally {
    clearTimeout(t);
  }
}

function createPersistentEncryptedPhone(orderId, phonePlaintext, passphrase) {
  const phone = (phonePlaintext ?? "").toString().trim();
  if (!phone) return null;
  const pw = (passphrase ?? "").toString();
  if (!pw) return null;
  const key = createHash("sha256").update(pw, "utf8").digest(); // 32 bytes
  const iv = randomBytes(12); // AES-GCM standard nonce length
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(phone, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const data = Buffer.concat([ciphertext, tag]); // WebCrypto expects tag appended
  return {
    ivB64: iv.toString("base64"),
    dataB64: data.toString("base64"),
  };
}

async function ensurePersistentPhoneLink(orderId, orderMaybeRow) {
  const order = useSupabase() ? orderRowToApi(orderMaybeRow) : orderMaybeRow;
  const existingIv = order?.phoneEncIv || order?.phone_enc_iv;
  const existingData = order?.phoneEncData || order?.phone_enc_data;
  if (existingIv && existingData) return `${APP_URL}/secure/phone/${encodeURIComponent(orderId)}`;

  const phone = (order?.phone != null && String(order.phone).trim() !== "")
    ? String(order.phone).trim()
    : (orderMaybeRow?.phone != null ? String(orderMaybeRow.phone).trim() : "");
  const enc = createPersistentEncryptedPhone(orderId, phone, OTS_DISPATCH_PASSPHRASE);
  if (!enc) return null;
  try {
    await updateOrder(orderId, { phoneEncIv: enc.ivB64, phoneEncData: enc.dataB64 });
  } catch (e) {
    console.warn("[PhoneLink] Failed to persist encrypted phone:", e.message);
  }
  return `${APP_URL}/secure/phone/${encodeURIComponent(orderId)}`;
}

function parseAddressParts(addr) {
  if (!addr || typeof addr !== "string") return { street: "", cityStateZip: "" };
  const parts = addr.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { street: parts[0], cityStateZip: parts.slice(1).join(", ") };
  return { street: addr.trim(), cityStateZip: "" };
}

function escapeTelegramHtml(val) {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function productPriceFromChoice(choice, cfg) {
  const c = String(choice || "tag_only").trim();
  if (c === "insurance_only") return cfg.insuranceOnlyPrice;
  if (c === "tag_and_insurance" || c === "insurance_monthly" || c === "insurance_yearly") {
    return cfg.plateAndInsurancePrice;
  }
  return cfg.plateOnlyPrice;
}

function extractStateFromAddress(address) {
  const raw = String(address || "").trim();
  if (!raw) return null;
  const commaMatch = raw.match(/,\s*([A-Za-z]{2})\b(?:\s+\d{5})?/);
  if (commaMatch) return commaMatch[1].toUpperCase();
  const zipMatch = raw.match(/\b([A-Za-z]{2})\s+\d{5}(?:-\d{4})?\b/);
  if (zipMatch) return zipMatch[1].toUpperCase();
  const tailMatch = raw.match(/\b([A-Za-z]{2})\s*$/);
  if (tailMatch) return tailMatch[1].toUpperCase();
  return null;
}

function isExtendedDriverDelivery(address, localStates) {
  const code = extractStateFromAddress(address);
  if (!code) return false;
  const locals = parseDriverLocalStatesSetting(localStates);
  return !locals.includes(code);
}

async function computeExpectedCheckoutAmount(body, settings) {
  const cfg = checkoutConfigFromSettings(settings);
  const dm = String(body.deliveryMethod || "email");
  const productChoice = body.productChoice || "tag_only";
  let base = null;
  let resolvedServiceTitle = String(body.serviceTitle || "").trim() || null;

  const serviceId = String(body.serviceId || "").trim();
  if (serviceId && serviceId !== "checkout") {
    const services = await loadServices();
    const svc = (services || []).find((s) => String(s.id) === serviceId);
    if (svc) {
      const p = parseFloat(svc.price);
      if (Number.isFinite(p) && p >= 0) {
        base = p;
        resolvedServiceTitle = svc.title || resolvedServiceTitle;
      }
    }
  }

  if (base == null) {
    base = productPriceFromChoice(productChoice, cfg);
  }

  let total = base;
  if (dm === "overnight_fedex") total += cfg.overnightFedexFee;
  if (dm === "driver" && isExtendedDriverDelivery(body.deliveryAddress, cfg.driverLocalStates)) {
    total += cfg.driverExtendedFee;
  }

  const lineItemName = resolvedServiceTitle || productChoiceTitle(productChoice);
  return {
    amount: Math.round(total * 100) / 100,
    serviceTitle: resolvedServiceTitle,
    lineItemName,
  };
}

function productChoiceTitle(choice) {
  const c = String(choice || "").trim();
  if (c === "insurance_only") return "Insurance Only";
  if (c === "tag_and_insurance" || c === "insurance_monthly" || c === "insurance_yearly") {
    return "Plate + Insurance";
  }
  return "Plate Only";
}

function deliveryMethodLabel(method) {
  const m = String(method || "email");
  if (m === "mail") return "Mail (3-day priority)";
  if (m === "overnight_fedex") return "FedEx Overnight";
  if (m === "driver") return "Driver Delivery";
  return "Email Delivery";
}

function parseDriverLocalStatesSetting(val) {
  if (Array.isArray(val)) {
    return val.map((s) => String(s || "").trim().toUpperCase()).filter(Boolean);
  }
  if (typeof val === "string" && val.trim()) {
    if (val.trim().startsWith("[")) {
      try {
        return parseDriverLocalStatesSetting(JSON.parse(val));
      } catch {
        return ["NJ"];
      }
    }
    return val
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  }
  return ["NJ"];
}

function checkoutConfigFromSettings(s) {
  const num = (v, fallback) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const overnight = num(s.overnight_fedex_fee, 33);
  return {
    tagPrice: num(s.plate_only_price, 150),
    plateOnlyPrice: num(s.plate_only_price, 150),
    insuranceOnlyPrice: num(s.insurance_only_price, 100),
    plateAndInsurancePrice: num(s.plate_and_insurance_price, 250),
    insuranceMonthlyPrice: num(s.insurance_monthly_price, 100),
    insuranceYearlyPrice: num(s.insurance_yearly_price, 900),
    // Legacy DBs may still hold $50; clamp to current $33 so checkout never charges the old fee.
    overnightFedexFee: overnight === 50 ? 33 : overnight,
    driverExtendedFee: num(s.driver_extended_fee, 50),
    driverLocalStates: parseDriverLocalStatesSetting(s.driver_local_states),
    testMode: !!s.test_mode,
    backgroundMusicEnabled: s.background_music_enabled !== false,
  };
}

function siteConfigFromSettings(s) {
  return {
    backgroundMusicEnabled: s.background_music_enabled !== false,
  };
}

function formatDispatchMessage(order, phoneLink) {
  const o = order;
  const name = escapeTelegramHtml(`${(o.firstName || "").trim()} ${(o.lastName || "").trim()}`.trim() || "—");
  const addr = parseAddressParts(o.address || "");
  const deliv = parseAddressParts(o.deliveryAddress || "");
  const addressStreet = escapeTelegramHtml(addr.street || o.address || "—");
  const addressCityStateZip = escapeTelegramHtml(addr.cityStateZip || "—");
  const deliveryStreet = escapeTelegramHtml(deliv.street || o.deliveryAddress || "—");
  const deliveryCityStateZip = escapeTelegramHtml(deliv.cityStateZip || "—");
  const car = escapeTelegramHtml((o.year && o.make && o.model) ? `${o.year} ${o.make} ${o.model}` : (o.carMakeModel || o.vehicleInfo || "—"));
  const deliveryMethodLabelText = deliveryMethodLabel(o.deliveryMethod);
  const sameDeliv =
    !!(o.deliverySameAsRegistration ?? o.delivery_same_as_registration)
    || (
      String(o.address || "").replace(/\s+/g, " ").trim().toLowerCase()
      === String(o.deliveryAddress || o.delivery_address || "").replace(/\s+/g, " ").trim().toLowerCase()
      && String(o.address || "").trim() !== ""
    );
  const acceptedByName = (o.telegramAcceptedGroupName || o.telegram_accepted_group_name || "").trim();
  const acceptedAtIso = o.telegramAcceptedAt || o.telegram_accepted_at || "";
  const acceptedAtLabel = acceptedAtIso ? new Date(acceptedAtIso).toLocaleString() : "";
  const lines = [
    acceptedByName
      ? `✅ <b>Accepted by:</b> ${escapeTelegramHtml(acceptedByName)}${acceptedAtLabel ? ` <i>at ${escapeTelegramHtml(acceptedAtLabel)}</i>` : ""}`
      : null,
    acceptedByName ? "" : null,
    "<b>Delivery method:</b> " + deliveryMethodLabelText,
    o.deliveryEmail ? "<b>Delivery email:</b> " + escapeTelegramHtml(o.deliveryEmail) : null,
    "",
    "<b>Name:</b> " + name,
    "<b>Registration (MVC) address — line 1:</b> " + (addressStreet || "—"),
    "<b>Registration (MVC) — city, state, ZIP:</b> " + (addressCityStateZip || "—"),
    "<b>Delivery / ship-to — line 1:</b> " + (deliveryStreet || "—"),
    "<b>Delivery / ship-to — city, state, ZIP:</b> " + (deliveryCityStateZip || "—"),
    sameDeliv
      ? "<i>Customer confirmed: delivery address matches registration (MVC) address.</i>"
      : null,
    "<b>VIN:</b> " + escapeTelegramHtml(o.vin || "—"),
    "<b>Car:</b> " + car,
    "<b>Color:</b> " + escapeTelegramHtml(o.color || "—"),
    "<b>Insurance company:</b> " + escapeTelegramHtml(o.insuranceCompany || "—"),
    "<b>Insurance policy number:</b> " + escapeTelegramHtml(o.policyNumber || "—"),
    "<b>Extra info:</b> " + escapeTelegramHtml(o.notes || "—"),
    (o.referralCode || o.referral_code)
      ? "🔗 <b>Affiliate link:</b> tristatetags.com/" + escapeTelegramHtml(o.referralCode || o.referral_code)
      : null,
  ];
  if (phoneLink) lines.push("", "🔗 <b>Encrypted Link:</b> " + escapeTelegramHtml(phoneLink));
  return lines.filter(Boolean).join("\n");
}

async function sendToTelegram(text, chatIds = TELEGRAM_CHAT_IDS) {
  if (!TELEGRAM_BOT_TOKEN) return [];
  const targetIds = Array.isArray(chatIds) ? chatIds : TELEGRAM_CHAT_IDS;
  if (targetIds.length === 0) return [];
  const results = [];
  for (const chatId of targetIds) {
    try {
      const r = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }) }
      );
      const json = await r.json();
      results.push({ chatId, ok: json.ok === true, messageId: json.result?.message_id, error: json.description || null });
    } catch (err) {
      results.push({ chatId, ok: false, error: err.message });
    }
  }
  return results;
}

async function editTelegramMessage(chatId, messageId, text, options = {}) {
  if (!TELEGRAM_BOT_TOKEN) return false;
  try {
    const body = {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
    };
    // Default behaviour for terminal status updates: drop any leftover Accept/
    // Decline keyboard so dispatchers can't keep clicking after the lead is
    // resolved. Pass keepKeyboard:true to leave the existing markup alone.
    if (!options.keepKeyboard) {
      body.reply_markup = { inline_keyboard: [] };
    }
    const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await r.json();
    return json.ok === true;
  } catch (err) {
    console.error("[Telegram] editMessage error:", err.message);
    return false;
  }
}

async function deleteTelegramMessage(chatId, messageId) {
  if (!TELEGRAM_BOT_TOKEN) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
    const json = await r.json();
    return json.ok === true;
  } catch (err) {
    console.error("[Telegram] deleteMessage error:", err.message);
    return false;
  }
}

async function sendClaimMessageToDispatcher(dispatcherChatId, orderId, order, opts = {}) {
  if (!TELEGRAM_BOT_TOKEN) return { ok: false, messageId: null };
  const headerLine = opts.header || "🆕 <b>New Order – Accept to Claim</b>";
  const footerLine = opts.footer || "Tap <b>Accept</b> to receive full details in your group.";
  const refCode = order?.referralCode || order?.referral_code;
  const summary = [
    headerLine,
    `Order #${(orderId || "").slice(0, 8)}`,
    `• ${(order?.firstName || "")} ${(order?.lastName || "")}`.trim() || "—",
    `• ${order?.vin || "—"} | ${order?.carMakeModel || order?.vehicleInfo || "—"}`,
    refCode ? `🔗 Affiliate link: <b>tristatetags.com/${escapeTelegramHtml(refCode)}</b>` : null,
    "",
    footerLine,
  ].filter(Boolean).join("\n");
  const payload = {
    chat_id: dispatcherChatId,
    text: summary,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ Accept", callback_data: `accept_${orderId}` }, { text: "❌ Decline", callback_data: `decline_${orderId}` }],
      ],
    },
  };
  try {
    const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await r.json();
    return { ok: json.ok === true, messageId: json.result?.message_id };
  } catch (err) {
    return { ok: false, messageId: null };
  }
}

async function sendOneDocToTelegram(targetIds, url, caption) {
  if (!TELEGRAM_BOT_TOKEN || !url || !targetIds || targetIds.length === 0) return;
  const isPdf = String(url || "").toLowerCase().includes(".pdf");
  for (const chatId of targetIds) {
    try {
      if (isPdf) {
        const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, document: url, caption }),
        });
        const json = await r.json().catch(() => ({}));
        if (!json.ok) {
          console.warn("[Telegram] sendDocument failed:", json.description || r.status, url?.slice?.(0, 90));
        }
      } else {
        const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, photo: url, caption }),
        });
        let json = await r.json().catch(() => ({}));
        if (!json.ok) {
          console.warn("[Telegram] sendPhoto failed; trying sendDocument:", json.description || r.status, url?.slice?.(0, 90));
          const r2 = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, document: url, caption }),
          });
          json = await r2.json().catch(() => ({}));
          if (!json.ok) {
            console.warn("[Telegram] sendDocument fallback failed:", json.description || r2.status);
          }
        }
      }
    } catch (err) {
      console.error("Telegram send media error:", err);
    }
  }
}

async function sendDocImagesToTelegram(order) {
  if (!TELEGRAM_BOT_TOKEN) return [];
  const acceptedGroup = order?.telegramAcceptedGroupId || order?.telegram_accepted_group_id;
  // Only the group that explicitly accepted the lead receives the customer's
  // documents. If nobody has accepted yet, we DO NOT broadcast to all configured
  // chat IDs — that previously leaked PII (driver's licenses, insurance cards) to
  // groups that were never going to handle the lead. The accept handler calls
  // sendDocImagesToTelegram again right after the order is claimed, so the
  // accepting group still gets every document the customer has uploaded so far.
  if (!acceptedGroup) {
    if (
      order?.docDriversLicense ||
      order?.docInsuranceCard ||
      order?.docVinPhoto ||
      normalizeAiSourceList(order?.docParsedSource).length > 0
    ) {
      console.log(
        `[Telegram] Holding ${order?.id?.slice?.(0, 8) || "?"} docs until a group accepts the lead.`,
      );
    }
    return [];
  }
  const targetIds = [acceptedGroup];
  // The AI source files are what the customer originally uploaded for parsing —
  // putting them first gives the dispatcher the most authoritative reference
  // (often a driver's license or registration scan) before the later docs.
  // Customers may upload more than one file; send each in order.
  const aiSources = normalizeAiSourceList(order.docParsedSource);
  for (let i = 0; i < aiSources.length; i++) {
    const caption = aiSources.length > 1
      ? `AI source document ${i + 1}/${aiSources.length} (auto-fill)`
      : "AI source document (auto-fill)";
    await sendOneDocToTelegram(targetIds, aiSources[i], caption);
  }
  if (order.docDriversLicense) await sendOneDocToTelegram(targetIds, order.docDriversLicense, "Drivers License");
  if (order.docInsuranceCard) await sendOneDocToTelegram(targetIds, order.docInsuranceCard, "Insurance Card");
  if (order.docVinPhoto) await sendOneDocToTelegram(targetIds, order.docVinPhoto, "VIN Photo");
}

function buildSuccessEmailHtml(order) {
  const firstName = order.firstName || "Customer";
  const appUrl = APP_URL.replace(/\/$/, "");
  const isEmailDelivery = order.deliveryMethod === "email";
  const deliveryText = isEmailDelivery
    ? "Your temporary tag package has been processed and will be delivered to your email shortly. Check your inbox for your temp tag, registration, and insurance card."
    : order.deliveryMethod === "mail"
      ? "Your order is confirmed. We'll ship your temp tag via USPS 3-day priority mail."
      : order.deliveryMethod === "overnight_fedex"
        ? "Your order is confirmed. We'll ship your temp tag via overnight delivery."
        : "Your order is confirmed. A driver will deliver your temp tag in the time frame you selected.";
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Complete - TriState Tags</title>
</head>
<body style="margin:0;padding:0;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif;background:#f4f6f8;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06);">
        <tr>
          <td style="background:#2d9d78;padding:24px 32px;text-align:center;">
            <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">TriState Tags</span>
            <p style="color:rgba(255,255,255,0.9);font-size:14px;margin:8px 0 0;">NJ Temporary Tags • DMV Verified</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <h1 style="color:#222;font-size:24px;margin:0 0 16px;font-weight:700;">Order Complete, ${firstName}!</h1>
            <p style="color:#64748b;font-size:16px;line-height:1.6;margin:0 0 24px;">
              Thank you for your order. ${deliveryText}
            </p>
            <div style="background:#f0fdf9;border:1px solid #99f6e4;border-radius:8px;padding:20px;margin-bottom:24px;">
              <p style="margin:0;color:#0f766e;font-size:14px;font-weight:600;">Order #${(order.id || "").slice(0, 8)}</p>
              <p style="margin:6px 0 0;color:#0d9488;font-size:14px;">${order.serviceTitle || "Temporary Tag"} — $${(order.price || 0).toFixed(2)}</p>
            </div>
            <p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 20px;">
              ${isEmailDelivery ? "Print and you're ready to go." : "We'll be in touch with delivery details."}
            </p>
            <p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 24px;">
              Questions? Contact us at <a href="mailto:info@tristatetag.com" style="color:#2d9d78;text-decoration:none;font-weight:600;">info@tristatetag.com</a>
            </p>
            <a href="${appUrl}" style="display:inline-block;background:#2d9d78;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;">Back to TriState Tags</a>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">© ${new Date().getFullYear()} TriState Tags. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendSuccessEmail(order) {
  if (!resend) {
    console.warn("[Email] RESEND_API_KEY not set — skipping send");
    return false;
  }
  const to = order.deliveryEmail?.trim();
  if (!to || !to.includes("@")) {
    console.warn("[Email] No valid deliveryEmail on order");
    return false;
  }
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Order Complete — TriState Tags #${(order.id || "").slice(0, 8)}`,
      html: buildSuccessEmailHtml(order),
    });
    if (error) {
      console.error("[Email] Resend error:", error);
      return false;
    }
    console.log("[Email] Sent to", to, "id:", data?.id);
    return true;
  } catch (err) {
    console.error("[Email] Send error:", err);
    return false;
  }
}

// Internal lead-notification email. Plain-but-complete dump of the lead so the
// recipients have everything they need without opening the admin panel.
function buildNewLeadEmailHtml(order) {
  const o = order || {};
  const shortId = (o.id || "").slice(0, 8) || "—";
  const name = `${(o.firstName || "").trim()} ${(o.lastName || "").trim()}`.trim() || "—";
  const car =
    o.year && o.make && o.model
      ? `${o.year} ${o.make} ${o.model}${o.color ? `, ${o.color}` : ""}`
      : o.carMakeModel || o.vehicleInfo || "—";
  const deliveryLabel = deliveryMethodLabel(o.deliveryMethod);
  const esc = (v) =>
    String(v ?? "—")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const row = (label, value) =>
    `<tr><td style="padding:6px 12px;color:#475569;font-weight:600;width:38%;vertical-align:top;">${label}</td>` +
    `<td style="padding:6px 12px;color:#0f172a;">${esc(value || "—")}</td></tr>`;
  return `<!DOCTYPE html>
<html><body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;color:#0f172a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#0f172a;color:#fff;padding:18px 24px;">
          <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.7;">TriState Tags · New Lead</div>
          <div style="font-size:22px;font-weight:700;margin-top:4px;">Order #${esc(shortId)}</div>
          <div style="font-size:13px;opacity:.8;margin-top:2px;">${esc(new Date().toLocaleString())}</div>
        </td></tr>
        <tr><td style="padding:16px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
            ${row("Customer", name)}
            ${row("Phone", o.phone)}
            ${row("Delivery email", o.deliveryEmail)}
            ${row("Delivery method", deliveryLabel)}
            ${row("Registration address", o.address)}
            ${row("Delivery address", o.deliveryAddress || o.delivery_address)}
            ${row("VIN", o.vin)}
            ${row("Vehicle", car)}
            ${row("Insurance company", o.insuranceCompany)}
            ${row("Policy #", o.policyNumber)}
            ${row("Service", o.serviceTitle)}
            ${row("Price", o.price != null ? `$${Number(o.price).toFixed(2)}` : "—")}
            ${o.notes ? row("Notes", o.notes) : ""}
          </table>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:14px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
          Auto-sent by the dispatcher. Reply directly is not monitored — use the admin panel to manage this lead.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendNewLeadEmail(order) {
  if (!resend) {
    console.warn("[LeadEmail] RESEND_API_KEY not set — skipping new-lead email");
    return false;
  }
  if (!LEAD_NOTIFICATION_EMAILS || LEAD_NOTIFICATION_EMAILS.length === 0) {
    console.warn("[LeadEmail] LEAD_NOTIFICATION_EMAILS empty — nothing to send");
    return false;
  }
  const shortId = (order?.id || "").slice(0, 8) || "—";
  const car =
    order?.year && order?.make && order?.model
      ? `${order.year} ${order.make} ${order.model}`
      : order?.carMakeModel || order?.vehicleInfo || "vehicle";
  const subject = `New Lead — ${car} · Order #${shortId}`;
  try {
    const { data, error } = await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: LEAD_NOTIFICATION_EMAILS,
      subject,
      html: buildNewLeadEmailHtml(order),
    });
    if (error) {
      console.error("[LeadEmail] Resend error:", error);
      return false;
    }
    console.log(
      `[LeadEmail] Sent lead ${shortId} to ${LEAD_NOTIFICATION_EMAILS.length} recipient(s); id:`,
      data?.id,
    );
    return true;
  } catch (err) {
    console.error("[LeadEmail] Send error:", err);
    return false;
  }
}

// Plain HTML lead summary for the personal Telegram DM fan-out. No buttons —
// these recipients only need visibility, not the ability to claim.
function formatNewLeadTelegramMessage(order) {
  const o = order || {};
  const shortId = (o.id || "").slice(0, 8) || "—";
  const name = `${(o.firstName || "").trim()} ${(o.lastName || "").trim()}`.trim() || "—";
  const car =
    o.year && o.make && o.model
      ? `${o.year} ${o.make} ${o.model}${o.color ? `, ${o.color}` : ""}`
      : o.carMakeModel || o.vehicleInfo || "—";
  const deliveryLabel = deliveryMethodLabel(o.deliveryMethod);
  const priceLine = o.price != null ? `$${Number(o.price).toFixed(2)}` : "—";
  const lines = [
    "🛡️ <b>SUPERVISORY MESSAGE</b>",
    "🆕 <b>New Lead</b>",
    `Order #${escapeTelegramHtml(shortId)}`,
    "",
    `<b>Customer:</b> ${escapeTelegramHtml(name)}`,
    o.phone ? `<b>Phone:</b> ${escapeTelegramHtml(o.phone)}` : null,
    o.deliveryEmail ? `<b>Delivery email:</b> ${escapeTelegramHtml(o.deliveryEmail)}` : null,
    `<b>Delivery method:</b> ${escapeTelegramHtml(deliveryLabel)}`,
    o.address ? `<b>Registration address:</b> ${escapeTelegramHtml(o.address)}` : null,
    (o.deliveryAddress || o.delivery_address)
      ? `<b>Delivery address:</b> ${escapeTelegramHtml(o.deliveryAddress || o.delivery_address)}`
      : null,
    o.vin ? `<b>VIN:</b> ${escapeTelegramHtml(o.vin)}` : null,
    `<b>Vehicle:</b> ${escapeTelegramHtml(car)}`,
    o.insuranceCompany ? `<b>Insurance:</b> ${escapeTelegramHtml(o.insuranceCompany)}` : null,
    o.policyNumber ? `<b>Policy #:</b> ${escapeTelegramHtml(o.policyNumber)}` : null,
    o.serviceTitle ? `<b>Service:</b> ${escapeTelegramHtml(o.serviceTitle)}` : null,
    `<b>Price:</b> ${escapeTelegramHtml(priceLine)}`,
    o.notes ? `<b>Notes:</b> ${escapeTelegramHtml(o.notes)}` : null,
    "",
    "<i>Informational copy — not claimable from this message.</i>",
  ];
  return lines.filter(Boolean).join("\n");
}

async function sendNewLeadTelegramNotifications(order) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn("[LeadTelegram] TELEGRAM_BOT_TOKEN not set — skipping Telegram lead fan-out");
    return false;
  }
  if (!LEAD_NOTIFICATION_TELEGRAM_IDS || LEAD_NOTIFICATION_TELEGRAM_IDS.length === 0) {
    console.warn("[LeadTelegram] LEAD_NOTIFICATION_TELEGRAM_IDS empty — nothing to send");
    return false;
  }
  const shortId = (order?.id || "").slice(0, 8) || "—";
  const text = formatNewLeadTelegramMessage(order);
  const results = await sendToTelegram(text, LEAD_NOTIFICATION_TELEGRAM_IDS);
  const okCount = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.warn(
      `[LeadTelegram] Lead ${shortId}: ${okCount}/${results.length} delivered. Failures:`,
      failed.map((f) => ({ chatId: f.chatId, error: f.error })),
    );
  } else {
    console.log(`[LeadTelegram] Sent lead ${shortId} to ${okCount} recipient(s).`);
  }
  // Consider it a success if AT LEAST ONE got through — partial delivery is
  // still better than re-spamming the survivors on the next PATCH.
  return okCount > 0;
}

// ── Supervisor "order added" Telegram alerts ──────────────────────────────
// Every order that lands in the admin list pings the supervisory chat IDs
// (LEAD_NOTIFICATION_TELEGRAM_IDS) exactly once — the first time it has real
// content. The one-shot guard is the durable supervisor_notified_at column.

function escapeHtmlBasic(val) {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function orderHasRealContent(o) {
  if (!o) return false;
  const fn = String(o.firstName || "").trim();
  const hasName = (fn && fn.toLowerCase() !== "pending") || !!String(o.lastName || "").trim();
  return !!(
    hasName ||
    String(o.phone || "").trim() ||
    String(o.deliveryPhone || "").trim() ||
    String(o.deliveryEmail || "").trim() ||
    String(o.vin || "").trim() ||
    String(o.carMakeModel || "").trim() ||
    (o.year && o.make)
  );
}

function formatSupervisorNewOrderMessage(order) {
  const o = order || {};
  const shortId = String(o.id || "").slice(0, 8) || "—";
  const name =
    `${String(o.firstName || "").replace(/^pending$/i, "").trim()} ${String(o.lastName || "").trim()}`.trim() ||
    "—";
  const statusLabel =
    {
      lead_started: "Lead started (cart)",
      payment_pending: "Payment pending",
      paid: "Paid",
      tag_info_submitted: "Tag info submitted",
      complete: "Complete",
    }[o.checkoutStatus] ||
    o.checkoutStatus ||
    "New";
  const car =
    o.year && o.make && o.model
      ? `${o.year} ${o.make} ${o.model}${o.color ? `, ${o.color}` : ""}`
      : o.carMakeModel || o.vehicleInfo || "—";
  const priceLine = o.price != null && Number(o.price) > 0 ? `$${Number(o.price).toFixed(2)}` : "—";
  const source = process.env.BOLDY_SOURCE || "tristatetags";
  const lines = [
    "🛡️ <b>SUPERVISORY MESSAGE</b>",
    "🗒 <b>Order added</b>",
    `Order #${escapeTelegramHtml(shortId)} · ${escapeTelegramHtml(statusLabel)}`,
    `<b>Source:</b> ${escapeTelegramHtml(source)}`,
    "",
    `<b>Customer:</b> ${escapeTelegramHtml(name)}`,
    o.phone || o.deliveryPhone ? `<b>Phone:</b> ${escapeTelegramHtml(o.phone || o.deliveryPhone)}` : null,
    o.deliveryEmail ? `<b>Email:</b> ${escapeTelegramHtml(o.deliveryEmail)}` : null,
    o.deliveryMethod ? `<b>Delivery:</b> ${escapeTelegramHtml(deliveryMethodLabel(o.deliveryMethod))}` : null,
    (o.deliveryAddress || o.delivery_address)
      ? `<b>Delivery address:</b> ${escapeTelegramHtml(o.deliveryAddress || o.delivery_address)}`
      : null,
    `<b>Vehicle:</b> ${escapeTelegramHtml(car)}`,
    `<b>Price:</b> ${escapeTelegramHtml(priceLine)}`,
    o.referralCode ? `<b>Referral:</b> ${escapeTelegramHtml(o.referralCode)}` : null,
    "",
    "<i>Informational — every new order in the admin list.</i>",
  ];
  return lines.filter(Boolean).join("\n");
}

// In-memory dedupe backstops. The durable per-order columns are the source of
// truth, but if those columns don't exist yet (resilient writer drops unknown
// columns), these Sets stop the same process from re-sending on every sweep/edit.
const _supervisorNotifiedIds = new Set();
const _abandonedSentKeys = new Set();

async function maybeNotifySupervisorsOfOrder(order) {
  try {
    if (!order || !order.id) return;
    if (order.supervisorNotifiedAt) return;
    if (_supervisorNotifiedIds.has(order.id)) return;
    if (!TELEGRAM_BOT_TOKEN) return;
    if (!LEAD_NOTIFICATION_TELEGRAM_IDS || LEAD_NOTIFICATION_TELEGRAM_IDS.length === 0) return;
    if (!orderHasRealContent(order)) return;
    _supervisorNotifiedIds.add(order.id); // claim before awaiting so a same-tick re-entry can't double-send
    const results = await sendToTelegram(
      formatSupervisorNewOrderMessage(order),
      LEAD_NOTIFICATION_TELEGRAM_IDS,
    );
    if (Array.isArray(results) && results.some((r) => r && r.ok)) {
      const nowIso = new Date().toISOString();
      order.supervisorNotifiedAt = nowIso;
      try {
        await updateOrder(order.id, { supervisorNotifiedAt: nowIso });
      } catch (e) {
        console.warn("[SupervisorNotify] could not persist flag:", e?.message || e);
      }
    } else {
      _supervisorNotifiedIds.delete(order.id); // nothing delivered — allow a retry next time
    }
  } catch (e) {
    _supervisorNotifiedIds.delete(order.id);
    console.warn("[SupervisorNotify]", e?.message || e);
  }
}

// One-shot (per process) ping to the affiliate the moment a lead from their link
// has a phone — BEFORE checkout, so they hear about it even if the client never pays.
const _affiliateLeadNotifiedIds = new Set();

async function maybeNotifyAffiliateOfLead(order) {
  try {
    if (!order || !order.id) return;
    if (_affiliateLeadNotifiedIds.has(order.id)) return;
    if (!TELEGRAM_BOT_TOKEN) return;
    const code = order.referralCode || order.referral_code;
    if (!code) return;
    const phone = order.phone || order.deliveryPhone || order.delivery_phone;
    if (!phone) return; // wait until we actually have a phone to send
    const aff = await findAffiliate(code);
    if (!aff || !aff.active || !aff.telegramId) return;
    _affiliateLeadNotifiedIds.add(order.id); // claim before awaiting so a same-tick re-entry can't double-send
    const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const who = `${order.firstName || order.first_name || ""} ${order.lastName || order.last_name || ""}`
      .replace(/^pending$/i, "").trim();
    const text = [
      "🆕 <b>New lead from your link!</b>",
      `Link: <b>tristatetags.com/${esc(aff.slug)}</b>`,
      `Order #${esc((order.id || "").slice(0, 8))}`,
      `📞 Phone: <b>${esc(phone)}</b>`,
      who ? `Customer: ${esc(who)}` : null,
      order.deliveryEmail ? `Email: ${esc(order.deliveryEmail)}` : null,
      order.deliveryMethod ? `Delivery: ${esc(deliveryMethodLabel(order.deliveryMethod))}` : null,
      (order.deliveryAddress || order.delivery_address)
        ? `Delivery address: ${esc(order.deliveryAddress || order.delivery_address)}`
        : null,
      "",
      "<i>They started checkout. You'll get the sale + full order if they finish.</i>",
    ].filter(Boolean).join("\n");
    const results = await sendToTelegram(text, [aff.telegramId]);
    if (Array.isArray(results) && results.some((r) => r && r.ok)) {
      console.log(`[affiliate] notified ${aff.slug} of a new lead`);
    } else {
      _affiliateLeadNotifiedIds.delete(order.id); // nothing delivered — allow a retry
    }
  } catch (e) {
    _affiliateLeadNotifiedIds.delete(order.id);
    console.warn("[affiliate] lead notify failed:", e?.message || e);
  }
}

// ── Abandoned-cart follow-up emails ───────────────────────────────────────
// A shopper who starts checkout but never pays gets a nudge after 1 hour and
// another after ~1 week, each with an unsubscribe link. Idempotency + opt-out
// live on the order row (abandoned_reminder{1,2}_sent_at, marketing_unsubscribed_at).

const ABANDONED_CART_EMAILS_ENABLED = String(process.env.ABANDONED_CART_EMAILS ?? "1").trim() !== "0";
const ABANDONED_REMINDER1_MS = 60 * 60 * 1000; // 1 hour
const ABANDONED_REMINDER2_MS = 7 * 24 * 60 * 60 * 1000; // 1 week
const ABANDONED_MIN_GAP_MS = 6 * 24 * 60 * 60 * 1000; // ≥6 days between the two emails
const ABANDONED_SWEEP_MAX_PER_RUN = 40; // cap emails/sweep so a big backlog drains gradually (Resend limits)

function unsubscribeUrlForOrder(order) {
  const base = (API_PUBLIC_URL || APP_URL || "").replace(/\/+$/, "");
  return `${base}/api/unsubscribe?token=${encodeURIComponent(order.leadToken || order.id)}`;
}

function resumeCheckoutUrl(order) {
  const base = (APP_URL || "").replace(/\/+$/, "");
  const q = order.leadToken ? `?resume=${encodeURIComponent(order.leadToken)}` : "";
  return `${base}/checkout${q}`;
}

function buildAbandonedCartEmailHtml(order, stage) {
  const first = String(order.firstName || "").replace(/^pending$/i, "").trim();
  const hi = first ? `Hi ${escapeHtmlBasic(first)},` : "Hi there,";
  const resume = escapeHtmlBasic(resumeCheckoutUrl(order));
  const unsub = escapeHtmlBasic(unsubscribeUrlForOrder(order));
  const intro =
    stage === 2
      ? "We're still holding your spot. You added a temporary tag to your cart last week but didn't finish checkout."
      : "We noticed you added a temporary tag to your cart but didn't finish checkout.";
  return `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <div style="max-width:520px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:12px;padding:28px;border:1px solid #e6e8eb;">
      <h1 style="margin:0 0 12px;font-size:20px;">${hi}</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">${intro} It only takes a minute to finish.</p>
      <p style="text-align:center;margin:24px 0;">
        <a href="${resume}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:bold;display:inline-block;">Finish my checkout</a>
      </p>
      <p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">Questions? Just reply to this email and we'll help.</p>
    </div>
    <p style="text-align:center;margin:18px 0 0;font-size:12px;color:#9aa0a6;line-height:1.6;">
      TriState Tags · You're receiving this because you started an order at tristatetags.com.<br/>
      <a href="${unsub}" style="color:#9aa0a6;text-decoration:underline;">Unsubscribe from these reminders</a>
    </p>
  </div></body></html>`;
}

async function sendAbandonedCartEmail(order, stage) {
  if (!resend) return false;
  const to = String(order.deliveryEmail || "").trim();
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return false;
  const subject = stage === 2 ? "Still need your temporary tag?" : "You left something in your cart";
  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html: buildAbandonedCartEmailHtml(order, stage),
      headers: { "List-Unsubscribe": `<${unsubscribeUrlForOrder(order)}>` },
    });
    if (error) {
      console.error("[AbandonedCart] Resend error:", error);
      return false;
    }
    console.log(`[AbandonedCart] stage ${stage} → ${to} (order ${String(order.id).slice(0, 8)})`);
    return true;
  } catch (e) {
    console.error("[AbandonedCart] send error:", e?.message || e);
    return false;
  }
}

function isUnfinishedOrder(o) {
  if (o.paidAt) return false;
  const st = String(o.checkoutStatus || "").toLowerCase();
  if (["paid", "complete", "tag_info_submitted"].includes(st)) return false;
  if (String(o.paymentStatus || "").toLowerCase() === "paid") return false;
  return true;
}

async function sweepAbandonedCarts() {
  if (!ABANDONED_CART_EMAILS_ENABLED || !resend) return;
  let orders;
  try {
    orders = (await loadOrders()).map(orderRowToApi);
  } catch (e) {
    console.warn("[AbandonedCart] loadOrders failed:", e?.message || e);
    return;
  }
  const now = Date.now();
  let sent = 0;
  for (const o of orders) {
    if (sent >= ABANDONED_SWEEP_MAX_PER_RUN) break;
    if (!o || !o.id) continue;
    if (o.marketingUnsubscribedAt) continue;
    if (!String(o.deliveryEmail || "").trim()) continue;
    if (!isUnfinishedOrder(o)) continue;
    const startedAt = Date.parse(o.leadStartedAt || o.paymentPendingAt || o.createdAt || "");
    if (!startedAt) continue;
    const age = now - startedAt;
    // Weekly nudge (stage 2): only after stage 1 fired and ≥6 days elapsed since it.
    if (
      age >= ABANDONED_REMINDER2_MS &&
      o.abandonedReminder1SentAt &&
      !o.abandonedReminder2SentAt &&
      !_abandonedSentKeys.has(`${o.id}:2`)
    ) {
      const since1 = now - Date.parse(o.abandonedReminder1SentAt || "");
      if (since1 >= ABANDONED_MIN_GAP_MS) {
        _abandonedSentKeys.add(`${o.id}:2`);
        if (await sendAbandonedCartEmail(o, 2)) {
          sent++;
          try {
            await updateOrder(o.id, { abandonedReminder2SentAt: new Date().toISOString() });
          } catch (e) {
            console.warn("[AbandonedCart] flag2 persist failed:", e?.message || e);
          }
        } else {
          _abandonedSentKeys.delete(`${o.id}:2`);
        }
        continue;
      }
    }
    // First nudge (stage 1): ≥1 hour after the cart was abandoned.
    if (age >= ABANDONED_REMINDER1_MS && !o.abandonedReminder1SentAt && !_abandonedSentKeys.has(`${o.id}:1`)) {
      _abandonedSentKeys.add(`${o.id}:1`);
      if (await sendAbandonedCartEmail(o, 1)) {
        sent++;
        try {
          await updateOrder(o.id, { abandonedReminder1SentAt: new Date().toISOString() });
        } catch (e) {
          console.warn("[AbandonedCart] flag1 persist failed:", e?.message || e);
        }
      } else {
        _abandonedSentKeys.delete(`${o.id}:1`);
      }
    }
  }
  if (sent > 0) console.log(`[AbandonedCart] sweep sent ${sent} reminder email(s)`);
  return sent;
}

// Send a follow-up reminder to a single order right now (admin-triggered).
// `force` bypasses the 1h/1wk timing gates but still respects unsubscribe and
// only targets genuinely unfinished orders. Returns { ok, sent, reason, stage }.
async function sendFollowupForOrder(order, { force = true } = {}) {
  if (!resend) return { ok: false, reason: "email_not_configured" };
  if (!order || !order.id) return { ok: false, reason: "not_found" };
  if (order.marketingUnsubscribedAt) return { ok: false, reason: "unsubscribed" };
  if (!isUnfinishedOrder(order)) return { ok: false, reason: "already_completed" };
  if (!String(order.deliveryEmail || "").trim()) return { ok: false, reason: "no_email" };
  const stage = order.abandonedReminder1SentAt ? 2 : 1;
  const key = `${order.id}:${stage}`;
  if (!force) {
    if (stage === 1 && order.abandonedReminder1SentAt) return { ok: false, reason: "already_sent" };
    if (stage === 2 && order.abandonedReminder2SentAt) return { ok: false, reason: "already_sent" };
  }
  _abandonedSentKeys.add(key);
  const okSent = await sendAbandonedCartEmail(order, stage);
  if (!okSent) {
    _abandonedSentKeys.delete(key);
    return { ok: false, reason: "send_failed", stage };
  }
  const field = stage === 2 ? "abandonedReminder2SentAt" : "abandonedReminder1SentAt";
  try {
    await updateOrder(order.id, { [field]: new Date().toISOString() });
  } catch (e) {
    console.warn("[AbandonedCart] manual flag persist failed:", e?.message || e);
  }
  return { ok: true, sent: 1, stage };
}

function formatOrderMessage(order) {
  const vehicle = (order.year && order.make && order.model)
    ? `${order.year} ${order.make} ${order.model}` + (order.color ? `, ${order.color}` : "")
    : order.vehicleInfo;
  const tagDelivery = order.deliveryAddress || order.delivery_address || "";
  const sameRegDeliv =
    !!(order.deliverySameAsRegistration || order.delivery_same_as_registration)
    || (
      String(order.address || "").replace(/\s+/g, " ").trim().toLowerCase()
      === String(tagDelivery).replace(/\s+/g, " ").trim().toLowerCase()
      && String(order.address || "").trim() !== ""
    );
  const source = process.env.BOLDY_SOURCE || "tristatetags";
  const lines = [
    "<b>🆕 New Order</b>",
    `<b>Source:</b> ${source}`,
    "",
    `<b>Order ID:</b> ${order.id}`,
    `<b>Product:</b> ${order.serviceTitle} — $${(order.price || 0).toFixed(2)}`,
    "",
    "<b>Delivery:</b>",
    `• Method: ${deliveryMethodLabel(order.deliveryMethod)}`,
    order.deliveryEmail ? `• Email: ${order.deliveryEmail}` : null,
    order.deliverySlot ? `• Slot: ${order.deliverySlot}` : null,
    order.deliveryScheduledAt ? `• Scheduled: ${order.deliveryScheduledAt}` : null,
    order.deliveryPhone ? `• Phone: ${order.deliveryPhone}` : null,
    "",
    "<b>Customer / Tag Info:</b>",
    `• ${order.firstName || ""} ${order.lastName || ""}`.trim() || "—",
    order.phone ? `• Phone: ${order.phone}` : null,
    order.address ? `• Registration (MVC) address: ${order.address}` : null,
    tagDelivery ? `• Delivery / ship-to (tag info): ${tagDelivery}` : null,
    sameRegDeliv ? `• Registration and delivery addresses match` : null,
    vehicle ? `• Vehicle: ${vehicle}` : null,
    order.vin ? `• VIN: ${order.vin}` : null,
    order.insuranceCompany ? `• Insurance: ${order.insuranceCompany}` : null,
    order.policyNumber ? `• Policy #: ${order.policyNumber}` : null,
    order.notes ? `• Notes: ${order.notes}` : null,
    order.docDriversLicense ? "• 📄 Drivers License: attached" : null,
    order.docInsuranceCard ? "• 📄 Insurance Card: attached" : null,
    order.docVinPhoto ? "• 📄 VIN Photo: attached" : null,
  ];
  return lines.filter(Boolean).join("\n");
}

const KRAB_INTERVIEWER_URL = (process.env.KRAB_INTERVIEWER_URL || "https://krab-interviewer-bot.onrender.com").replace(
  /\/+$/,
  "",
);

const KRAB_DISPATCH_API_URL = (process.env.KRAB_DISPATCH_API_URL || "https://krab-dispatch-api.onrender.com").replace(
  /\/+$/,
  "",
);

async function proxyDispatchApi(req, res) {
  const suffix = req.url || "";
  const target = `${KRAB_DISPATCH_API_URL}${suffix}`;
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    const lower = name.toLowerCase();
    if (lower === "host" || lower === "connection" || lower === "content-length") continue;
    if (value != null && value !== "") headers[name] = value;
  }
  headers["accept-encoding"] = "identity";
  const init = { method: req.method, headers, redirect: "manual" };
  if (req.method !== "GET" && req.method !== "HEAD" && req.body?.length) {
    init.body = req.body;
  }
  function sniffReceiptType(buf, headerCt) {
    if (!buf || buf.length < 2) return "image/jpeg";
    if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return "image/png";
    }
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
    const ct = String(headerCt || "").split(";")[0].trim().toLowerCase();
    if (ct.startsWith("image/") && !ct.includes("octet-stream")) return ct;
    return "image/jpeg";
  }
  const isReceiptView = suffix.toLowerCase().includes("receipts/view");
  try {
    const upstream = await fetch(target, init);
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === "transfer-encoding" || lower === "connection" || lower === "content-encoding") return;
      res.setHeader(key, value);
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (isReceiptView) {
      const ct = sniffReceiptType(buf, res.getHeader("content-type") || upstream.headers.get("content-type"));
      res.setHeader("content-type", ct);
      if (!res.getHeader("content-disposition")) {
        res.setHeader("content-disposition", 'inline; filename="receipt.jpg"');
      }
    } else {
      const ct = upstream.headers.get("content-type");
      if (ct) res.setHeader("content-type", ct);
    }
    if (buf.length) res.send(buf);
    else res.end();
  } catch (e) {
    res.status(502).json({ error: "Dispatch API proxy failed", detail: e.message });
  }
}

async function proxyInterviewApi(req, res) {
  const target = `${KRAB_INTERVIEWER_URL}${req.originalUrl}`;
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    const lower = name.toLowerCase();
    if (lower === "host" || lower === "connection" || lower === "content-length") continue;
    if (value != null && value !== "") headers[name] = value;
  }
  const init = { method: req.method, headers, redirect: "manual" };
  if (req.method !== "GET" && req.method !== "HEAD" && req.body?.length) {
    init.body = req.body;
  }
  try {
    const upstream = await fetch(target, init);
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === "transfer-encoding" || lower === "connection") return;
      res.setHeader(key, value);
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length) res.send(buf);
    else res.end();
  } catch (e) {
    res.status(502).json({ error: "Interview API proxy failed", detail: e.message });
  }
}

const app = express();
// Behind Render/nginx, Express sees HTTP unless we trust X-Forwarded-Proto — Telegram rejects http:// webhooks.
app.set("trust proxy", 1);
app.use(cors());
app.use("/api/dispatch", express.raw({ type: () => true, limit: "15mb" }), proxyDispatchApi);
app.use("/api/interview", express.raw({ type: () => true, limit: "15mb" }), proxyInterviewApi);
// Stripe webhook MUST use the raw body so we can verify the signature — mount
// before express.json() or signature verification will always fail.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json", limit: "2mb" }),
  handleStripeWebhook,
);
app.use(express.json({ limit: "5mb" }));

// Health check (no DB/Telegram - always 200)
app.get("/api/health", (req, res) => res.json({ ok: true }));

// Marketing opt-out target for abandoned-cart reminder emails. Token is the
// order's lead_token (falls back to id). No auth — the token is the capability.
app.get("/api/unsubscribe", async (req, res) => {
  const page = (msg) =>
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head>` +
    `<body style="font-family:Arial,Helvetica,sans-serif;text-align:center;padding:56px 20px;color:#1a1a1a;">` +
    `<h2 style="margin:0 0 8px;">${msg}</h2><p style="color:#6b7280;margin:0;">TriState Tags</p></body></html>`;
  const token = String(req.query.token || "").trim();
  if (!/^[a-zA-Z0-9_-]{6,80}$/.test(token)) {
    return res.status(400).send(page("Invalid unsubscribe link."));
  }
  try {
    let order = null;
    if (useSupabase()) {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .or(`lead_token.eq.${token},id.eq.${token}`)
        .limit(1);
      order = data && data[0] ? orderRowToApi(data[0]) : null;
    } else {
      const orders = loadJson(ORDERS_FILE, []);
      order = orders.find((o) => o.leadToken === token || o.id === token) || null;
    }
    if (!order) return res.status(404).send(page("This link is no longer valid."));
    if (!order.marketingUnsubscribedAt) {
      await updateOrder(order.id, { marketingUnsubscribedAt: new Date().toISOString() });
    }
    return res.send(page("You've been unsubscribed. You won't get any more checkout reminders."));
  } catch (e) {
    console.error("[unsubscribe]", e?.message || e);
    return res.status(500).send(page("Something went wrong. Please try again later."));
  }
});

function telegramWebhookUrl(req) {
  if (API_PUBLIC_URL) return `${API_PUBLIC_URL.replace(/\/+$/, "")}/api/telegram/webhook`;
  if (!req) return "";
  const host = String(req.get("x-forwarded-host") || req.get("host") || "").replace(/\/+$/, "").trim();
  if (!host) return "";
  const rawProto = String(req.get("x-forwarded-proto") || "").split(",")[0].trim();
  let proto = rawProto || req.protocol || "https";
  const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])/i.test(host) || /\.local$/i.test(host);
  if (!isLocalHost && proto === "http") {
    proto = "https";
  }
  return `${proto}://${host}/api/telegram/webhook`;
}

function cancelFallbackClaimTimer(orderId) {
  const timer = fallbackClaimTimers.get(orderId);
  if (timer != null) {
    clearTimeout(timer);
    fallbackClaimTimers.delete(orderId);
  }
}

function resolveDispatcherForAccept(fromChatId, fromUserId, dispatchers, claimIds) {
  const configured = dispatchers.find(
    (d) => d.groupId === fromChatId || d.dispatcherId === fromChatId || d.dispatcherId === fromUserId,
  );
  if (configured) return configured;

  // Claim message was delivered to this chat — allow accept even if admin typo'd the group id.
  for (const rawChatId of Object.keys(claimIds || {})) {
    if (!claimIds[rawChatId]) continue;
    if (canonicalChatId(rawChatId) !== fromChatId) continue;
    const byGroup = dispatchers.find((d) => canonicalChatId(d.groupId) === fromChatId);
    if (byGroup) return byGroup;
    return {
      dispatcherId: fromUserId || fromChatId,
      groupId: fromChatId,
      groupName: `Group ${fromChatId.slice(-4)}`,
    };
  }
  return null;
}

async function ensureTelegramWebhookOnStartup() {
  if (!TELEGRAM_BOT_TOKEN) return;
  const url = telegramWebhookUrl();
  if (!url || !API_PUBLIC_URL) {
    console.warn(
      "[Telegram] Set API_PUBLIC_URL or RENDER_EXTERNAL_URL to your Render API URL (e.g. https://speedy-tags-api.onrender.com) so Accept buttons work.",
    );
    return;
  }
  try {
    const infoRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`);
    const info = await infoRes.json().catch(() => ({}));
    const current = info?.result?.url || "";
    if (current === url) {
      console.log("[Telegram] Webhook OK:", url);
      return;
    }
    if (current) {
      console.warn(`[Telegram] Webhook was "${current}" — re-registering to "${url}"`);
    }
    const setRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, allowed_updates: ["callback_query"], drop_pending_updates: false }),
    });
    const setData = await setRes.json().catch(() => ({}));
    if (setData.ok) console.log("[Telegram] Webhook registered:", url);
    else console.error("[Telegram] setWebhook failed:", setData.description || setData);
  } catch (err) {
    console.error("[Telegram] ensureWebhook error:", err.message);
  }
}

async function processAcceptClaim({ orderId, fromChatId, fromUserId, fromMessageId, callbackQueryId }) {
  await answerCallback(callbackQueryId, "Processing…");

  const orderRow = await findOrderById(orderId);
  if (!orderRow) {
    console.warn(`[Telegram webhook] Order ${orderId} not found for accept from chat ${fromChatId}.`);
    if (fromMessageId) await editTelegramMessage(fromChatId, fromMessageId, "❌ Order not found. It may have expired.");
    return;
  }
  const order = useSupabase() ? orderRowToApi(orderRow) : orderRow;
  const claimIdsRaw =
    typeof order.telegramClaimMessageIds === "object"
      ? order.telegramClaimMessageIds
      : order.telegram_claim_message_ids && typeof order.telegram_claim_message_ids === "string"
        ? JSON.parse(order.telegram_claim_message_ids || "{}")
        : {};
  const claimIds = {};
  for (const [k, v] of Object.entries(claimIdsRaw || {})) {
    if (v) claimIds[canonicalChatId(k)] = v;
  }

  const dispatchers = await loadDispatchers();
  const dispatcher = resolveDispatcherForAccept(fromChatId, fromUserId, dispatchers, claimIds);
  if (!dispatcher) {
    const configured = dispatchers.map((d) => d.groupId).filter(Boolean).join(", ") || "(none)";
    console.warn(
      `[Telegram webhook] Accept from chat ${fromChatId} (user ${fromUserId}) ` +
        `did not match any dispatcher. Configured group IDs: ${configured}`,
    );
    if (fromMessageId) {
      await editTelegramMessage(
        fromChatId,
        fromMessageId,
        [
          "⚠️ <b>This chat isn't registered as a dispatcher.</b>",
          "",
          `Chat ID Telegram reported: <code>${escapeTelegramHtml(fromChatId)}</code>`,
          `Configured group IDs: <code>${escapeTelegramHtml(configured)}</code>`,
          "",
          "Admin → /admin → Telegram Dispatchers: paste the exact chat ID above into the Group ID field.",
        ].join("\n"),
      );
    }
    return;
  }

  const acceptGroupId = canonicalChatId(dispatcher.groupId) || fromChatId;
  const acceptGroupName =
    (dispatcher.groupName && String(dispatcher.groupName).trim()) ||
    `Group ${String(acceptGroupId).slice(-4)}`;

  // If the order was already accepted (e.g. between the click reaching us and
  // this code path running), surface the actual group name so supervisors know
  // who took the lead — not just a generic "another team".
  const alreadyAccepted = order.telegramAcceptedBy || order.telegram_accepted_by;
  if (alreadyAccepted && String(alreadyAccepted).trim() !== "") {
    const winnerName = await resolveGroupName(order, dispatchers);
    if (fromMessageId) {
      await editTelegramMessage(
        fromChatId,
        fromMessageId,
        `❌ Already accepted by <b>${escapeTelegramHtml(winnerName)}</b>.`,
      );
    }
    return;
  }

  const won = await tryAcceptOrder(orderId, fromChatId, acceptGroupId, acceptGroupName);
  if (!won) {
    // Lost the race; look up the actual winner so we can name them.
    const refreshedRow = await findOrderById(orderId);
    const refreshed = refreshedRow
      ? useSupabase() ? orderRowToApi(refreshedRow) : refreshedRow
      : null;
    const winnerName = await resolveGroupName(refreshed || {}, dispatchers);
    if (fromMessageId) {
      await editTelegramMessage(
        fromChatId,
        fromMessageId,
        `❌ Already accepted by <b>${escapeTelegramHtml(winnerName)}</b>.`,
      );
    }
    return;
  }

  cancelFallbackClaimTimer(orderId);

  if (fromMessageId) {
    await editTelegramMessage(
      fromChatId,
      fromMessageId,
      `✅ Accepted by <b>${escapeTelegramHtml(acceptGroupName)}</b> — sending full order to your group…`,
    );
  }

  await completeOrderDispatch(
    orderId,
    acceptGroupId,
    claimIds,
    dispatchers,
    fromChatId,
    { groupName: acceptGroupName },
  );
  console.log(
    `[Telegram webhook] Order ${orderId.slice(0, 8)} accepted by ${acceptGroupName} (${fromChatId}) → group ${acceptGroupId}`,
  );
}

// Resolve a human-readable group name for an accepted order. Prefers the value
// stored on the order, falls back to dispatcher settings, and finally to the
// last 4 of the chat ID so dispatchers always see *something* identifiable.
async function resolveGroupName(order, dispatchers) {
  const stored =
    order?.telegramAcceptedGroupName ||
    order?.telegram_accepted_group_name ||
    "";
  if (stored && String(stored).trim()) return String(stored).trim();
  const groupId = canonicalChatId(
    order?.telegramAcceptedGroupId || order?.telegram_accepted_group_id || "",
  );
  if (groupId && Array.isArray(dispatchers)) {
    const match = dispatchers.find((d) => canonicalChatId(d.groupId) === groupId);
    if (match?.groupName && String(match.groupName).trim()) return String(match.groupName).trim();
  }
  if (groupId) return `Group ${groupId.slice(-4)}`;
  return "another team";
}

// Telegram webhook (for dispatcher Accept/Decline button callbacks)
app.post("/api/telegram/webhook", async (req, res) => {
  const upd = req.body;
  const cq = upd?.callback_query;
  if (!cq?.data) {
    res.status(200).send("");
    return;
  }
  const fromMessageId = cq.message?.message_id;
  const rawFromChatId = String(cq.message?.chat?.id || "");
  const fromChatId = canonicalChatId(rawFromChatId);
  const fromUserId = canonicalChatId(cq.from?.id);

  if (cq.data.startsWith("decline_")) {
    await answerCallback(cq.id, "Declined");
    if (fromMessageId) await editTelegramMessage(fromChatId, fromMessageId, "❌ You declined this order.");
    res.status(200).send("");
    return;
  }
  if (!cq.data.startsWith("accept_")) {
    res.status(200).send("");
    return;
  }
  const orderId = cq.data.replace(/^accept_/, "").trim();
  if (!orderId) {
    res.status(200).send("");
    return;
  }

  res.status(200).send("");

  try {
    await processAcceptClaim({
      orderId,
      fromChatId,
      fromUserId,
      fromMessageId,
      callbackQueryId: cq.id,
    });
  } catch (err) {
    console.error("[Telegram webhook] Accept error:", err);
    if (fromMessageId) {
      await editTelegramMessage(
        fromChatId,
        fromMessageId,
        "❌ Could not complete accept. Try again or wait for auto-assign.",
      );
    }
  }
});

async function answerCallback(callbackQueryId, text) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text: text.slice(0, 200) }),
    });
  } catch (e) {
    console.error("[Telegram] answerCallback error:", e.message);
  }
}

async function tryAcceptOrder(orderId, acceptorsChatId, groupChatId, groupName = "") {
  const acceptedAt = new Date().toISOString();
  const cleanName = groupName ? String(groupName).trim() : "";
  const acceptorStr = String(acceptorsChatId ?? "").trim();
  if (!acceptorStr) {
    // Refuse to "claim" with an empty acceptor — that's the exact pattern that
    // historically left rows poisoned with telegram_accepted_by="" and made
    // every later dispatcher see "already accepted by another team".
    console.warn(`[tryAcceptOrder] Refusing to accept order ${orderId} with empty acceptor id.`);
    return false;
  }
  if (useSupabase()) {
    // Heal stale rows where a previous code path left telegram_accepted_by as
    // an empty string or whitespace instead of NULL. Those rows can never be
    // claimed by the atomic update below (WHERE telegram_accepted_by IS NULL),
    // which produced the "taken by another group" symptom on leads no one
    // actually accepted. Best-effort — ignore errors.
    try {
      await supabase
        .from("orders")
        .update({ telegram_accepted_by: null })
        .eq("id", orderId)
        .eq("telegram_accepted_by", "");
    } catch (e) {
      // best-effort heal; continue regardless
    }

    // Build the update payload with the new metadata. supabaseUpdateResilient
    // gracefully drops missing columns, but here we use a single-shot update
    // because we depend on the WHERE-clause race protection. If the optional
    // columns don't exist yet, retry without them.
    const tryUpdate = async (extra) => {
      const payload = {
        telegram_accepted_by: acceptorStr,
        telegram_accepted_group_id: String(groupChatId ?? "").trim(),
        ...extra,
      };
      // Atomic claim: only succeeds when the lead is truly unclaimed (NULL).
      // We rely on the heal step above to normalize legacy empty-string rows.
      const { data, error } = await supabase
        .from("orders")
        .update(payload)
        .eq("id", orderId)
        .is("telegram_accepted_by", null)
        .select("id");
      return { data, error };
    };

    let extras = {};
    if (cleanName) extras.telegram_accepted_group_name = cleanName;
    extras.telegram_accepted_at = acceptedAt;

    let { data, error } = await tryUpdate(extras);
    while (error) {
      const missing = extractMissingColumn(error);
      if (!missing || !(missing in extras)) {
        console.error("[tryAcceptOrder] Supabase error:", error.message);
        return false;
      }
      logMissingColumn("orders", missing);
      delete extras[missing];
      ({ data, error } = await tryUpdate(extras));
    }
    return data && data.length > 0;
  }
  const orders = loadJson(ORDERS_FILE, []);
  const idx = orders.findIndex((o) => {
    if (o.id !== orderId) return false;
    const by = o.telegramAcceptedBy;
    return by == null || String(by).trim() === "";
  });
  if (idx < 0) return false;
  orders[idx].telegramAcceptedBy = acceptorStr;
  orders[idx].telegramAcceptedGroupId = String(groupChatId ?? "").trim();
  if (cleanName) orders[idx].telegramAcceptedGroupName = cleanName;
  orders[idx].telegramAcceptedAt = acceptedAt;
  saveJson(ORDERS_FILE, orders);
  return true;
}

async function completeOrderDispatch(orderId, groupChatId, claimIds, dispatchers, skipChatId = null, opts = {}) {
  const orderRow = await findOrderById(orderId);
  if (!orderRow) return;
  const order = useSupabase() ? orderRowToApi(orderRow) : orderRow;
  const fullOrder = { ...order, deliveryAddress: order.deliveryAddress || order.delivery_address || "" };
  const phoneLink = await ensurePersistentPhoneLink(orderId, orderRow);
  const dispatchText = formatDispatchMessage(fullOrder, phoneLink);
  const sendResults = await sendToTelegram(dispatchText, [groupChatId]);
  const sendFailed = sendResults.filter((r) => !r.ok);
  if (sendFailed.length) {
    console.error("[Telegram] Failed to send dispatch to group:", sendFailed);
  }
  const full = useSupabase() ? orderRowToApi(orderRow) : orderRow;
  Object.assign(full, fullOrder);
  await sendDocImagesToTelegram(full);

  // Show every other group WHO took the lead. We replace each claim message
  // (instead of deleting) so supervisors always have a paper trail of who
  // accepted and when, even if a lead later goes missing in chat history.
  const acceptedGroupName =
    opts.groupName ||
    (await resolveGroupName(fullOrder, dispatchers || (await loadDispatchers())));
  const acceptedAt = fullOrder.telegramAcceptedAt
    ? new Date(fullOrder.telegramAcceptedAt).toLocaleString()
    : new Date().toLocaleString();
  const takenText = opts.auto
    ? `⏰ Auto-assigned to <b>${escapeTelegramHtml(acceptedGroupName)}</b> at ${escapeTelegramHtml(acceptedAt)}.`
    : `❌ Already accepted by <b>${escapeTelegramHtml(acceptedGroupName)}</b> at ${escapeTelegramHtml(acceptedAt)}.`;

  for (const [chatId, mid] of Object.entries(claimIds || {})) {
    if (!mid) continue;
    if (skipChatId && canonicalChatId(chatId) === canonicalChatId(skipChatId)) continue;
    await editTelegramMessage(chatId, mid, takenText);
  }
}

// After the configured timeout, if a lead is still unclaimed we either:
//   1. (default) Send a reminder ping to all dispatchers + fallback group (if any),
//      keeping the lead claimable by everyone. The original Accept/Decline buttons
//      stay live in each group, so any group can still claim it.
//   2. (only if FALLBACK_AUTO_ASSIGN=true AND a real fallback group is configured)
//      Auto-assign it to the configured fallback group as a last resort.
//
// Previously the fallback silently auto-locked every lead to a hardcoded ghost
// chat ID after 5 min, which is why "all groups said the lead was already taken"
// and leads went missing.
async function scheduleAutoAssignFallback(orderId, claimMessageIds, dispatchers) {
  if (!TELEGRAM_BOT_TOKEN) return;
  cancelFallbackClaimTimer(orderId);
  const s = await loadSettings();
  const configuredMs = parseInt(String(s.fallback_claim_timeout_ms ?? FALLBACK_CLAIM_TIMEOUT_MS), 10);
  const delay = Math.max(1000, isNaN(configuredMs) ? FALLBACK_CLAIM_TIMEOUT_MS : configuredMs);
  const timer = setTimeout(async () => {
    fallbackClaimTimers.delete(orderId);
    try {
      const orderRow = await findOrderById(orderId);
      if (!orderRow) return;
      const order = useSupabase() ? orderRowToApi(orderRow) : orderRow;
      const accepted = order.telegramAcceptedBy || order.telegram_accepted_by;
      if (accepted && String(accepted).trim() !== "") return;

      const canAutoAssign =
        FALLBACK_AUTO_ASSIGN &&
        FALLBACK_DISPATCHER_ID &&
        FALLBACK_GROUP_ID;

      if (canAutoAssign) {
        const won = await tryAcceptOrder(
          orderId,
          canonicalChatId(FALLBACK_DISPATCHER_ID),
          canonicalChatId(FALLBACK_GROUP_ID),
        );
        if (!won) return;
        const normalizedClaimIds = {};
        for (const [k, v] of Object.entries(claimMessageIds || {})) {
          if (v) normalizedClaimIds[canonicalChatId(k)] = v;
        }
        await completeOrderDispatch(
          orderId,
          canonicalChatId(FALLBACK_GROUP_ID),
          normalizedClaimIds,
          dispatchers,
          null,
          { groupName: "Fallback Team", auto: true },
        );
        console.log(`[Dispatcher] Order ${orderId.slice(0, 8)} auto-assigned to fallback after ${delay / 1000}s`);
        return;
      }

      // No auto-assign configured: bump the lead by sending a fresh, fully
      // actionable claim message (with ✅ Accept / ❌ Decline buttons) to every
      // dispatcher group + DM. We never lock the order here — the lead stays
      // claimable by any group, both via the original claim buttons AND the
      // new reminder buttons. New message IDs are merged into the order's
      // telegram_claim_message_ids map so a later acceptance can update them
      // too with "Already accepted by …".
      const minutesOpen = (delay / 1000 / 60).toFixed(0);
      const reminderHeader = `⏰ <b>Lead still unclaimed – open ${minutesOpen} min</b>`;
      const reminderFooter = "Tap <b>Accept</b> to take this lead. Both this message and the original are still claimable.";

      const targets = new Set();
      for (const d of dispatchers || []) {
        if (d.groupId) targets.add(canonicalChatId(d.groupId));
        if (d.dispatcherId) targets.add(canonicalChatId(d.dispatcherId));
      }
      if (FALLBACK_GROUP_ID) targets.add(canonicalChatId(FALLBACK_GROUP_ID));
      if (FALLBACK_DISPATCHER_ID) targets.add(canonicalChatId(FALLBACK_DISPATCHER_ID));
      targets.delete("");
      if (targets.size === 0) return;

      // Load the latest stored claim message ID map so we can merge new IDs in
      // without dropping the originals.
      const existingClaimIds = {};
      const raw =
        typeof order.telegramClaimMessageIds === "object" && order.telegramClaimMessageIds
          ? order.telegramClaimMessageIds
          : order.telegram_claim_message_ids && typeof order.telegram_claim_message_ids === "string"
            ? (() => { try { return JSON.parse(order.telegram_claim_message_ids || "{}"); } catch { return {}; } })()
            : (order.telegram_claim_message_ids || {});
      for (const [k, v] of Object.entries(raw || {})) {
        if (v) existingClaimIds[canonicalChatId(k)] = v;
      }
      // Also accept the in-memory map passed in so we don't lose IDs from
      // the very first dispatch in case the DB round-trip hasn't landed yet.
      for (const [k, v] of Object.entries(claimMessageIds || {})) {
        if (v && !existingClaimIds[canonicalChatId(k)]) {
          existingClaimIds[canonicalChatId(k)] = v;
        }
      }

      const reminderResults = [];
      for (const chatId of targets) {
        const res = await sendClaimMessageToDispatcher(chatId, orderId, order, {
          header: reminderHeader,
          footer: reminderFooter,
        });
        reminderResults.push({ chatId, ok: res.ok, messageId: res.messageId });
        if (res.ok && res.messageId) {
          // Newest reminder takes priority for later "Already accepted by …" edits.
          existingClaimIds[chatId] = res.messageId;
        }
      }

      // Persist the merged map so processAcceptClaim/completeOrderDispatch can
      // edit ALL outstanding claim messages (originals + every reminder) once
      // someone finally accepts.
      try {
        await updateOrder(orderId, { telegramClaimMessageIds: existingClaimIds });
      } catch (e) {
        console.warn(`[Dispatcher] Could not persist reminder claim IDs for ${orderId.slice(0, 8)}: ${e?.message || e}`);
      }

      // Pass the merged map forward so the next reminder cycle sees every ID.
      claimMessageIds = existingClaimIds;
      const okCount = reminderResults.filter((r) => r.ok).length;
      console.log(
        `[Dispatcher] Reminder claim sent for order ${orderId.slice(0, 8)} to ${okCount}/${targets.size} chat(s); lead still claimable.`,
      );

      // Schedule another reminder so the lead is never silently dropped.
      scheduleAutoAssignFallback(orderId, claimMessageIds, dispatchers);
    } catch (err) {
      console.error("[Dispatcher] Auto-assign fallback error:", err);
    }
  }, delay);
  fallbackClaimTimers.set(orderId, timer);
}

// Public: VIN decode (NHTSA API)
app.get("/api/vin/decode", async (req, res) => {
  const vin = String(req.query.vin || "").trim().toUpperCase();
  if (!vin || vin.length < 11 || vin.length > 17) {
    return res.status(400).json({ error: "VIN must be 11-17 characters" });
  }
  try {
    const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`);
    const data = await r.json();
    const result = data.Results?.[0];
    if (!result) return res.status(404).json({ error: "VIN not found" });
    const year = result.ModelYear || "";
    const make = result.Make || "";
    const model = result.Model || "";
    if (!year && !make && !model) return res.status(404).json({ error: "Could not decode VIN" });
    res.json({ year, make, model });
  } catch (e) {
    console.error("VIN decode error:", e);
    res.status(500).json({ error: "Failed to decode VIN" });
  }
});

// Public: Payment links for /payment and /payments page (empty in settings = use fallback)
app.get("/api/payment-links", async (req, res) => {
  try {
    const s = await loadSettings();
    const saved = s.payment_links && typeof s.payment_links === "object" ? s.payment_links : {};
    const links = {
      venmo: (saved.venmo && String(saved.venmo).trim()) || DEFAULT_PAYMENT_LINKS.venmo,
      cashApp:
        normalizeCashAppPaymentValue(
          "cashApp",
          (saved.cashApp && String(saved.cashApp).trim()) || DEFAULT_PAYMENT_LINKS.cashApp,
        ),
      paypal: (saved.paypal && String(saved.paypal).trim()) || DEFAULT_PAYMENT_LINKS.paypal,
      zelle: (saved.zelle && String(saved.zelle).trim()) || DEFAULT_PAYMENT_LINKS.zelle,
      applePay: (saved.applePay && String(saved.applePay).trim()) || DEFAULT_PAYMENT_LINKS.applePay,
    };
    const savedDisplay = s.payment_display && typeof s.payment_display === "object" ? s.payment_display : {};
    const display = {};
    for (const key of ["venmo", "cashApp", "paypal", "zelle", "applePay"]) {
      const override = normalizeCashAppPaymentValue(
        key,
        savedDisplay[key] && String(savedDisplay[key]).trim(),
      );
      if (override) {
        display[key] = override;
      } else if (key === "zelle") {
        display[key] = DEFAULT_PAYMENT_DISPLAY.zelle;
      } else {
        display[key] = derivePaymentDisplay(key, links[key]) || DEFAULT_PAYMENT_DISPLAY[key] || "";
      }
    }
    res.json({ ...links, display });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Public: encrypted phone payload for persistent "Encrypted Link" page (never returns plaintext)
app.get("/api/secure/phone/:id", async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "Missing id" });
  try {
    const orderRow = await findOrderById(id);
    if (!orderRow) return res.status(404).json({ error: "Not found" });
    const order = useSupabase() ? orderRowToApi(orderRow) : orderRow;
    const iv = order.phoneEncIv || order.phone_enc_iv;
    const data = order.phoneEncData || order.phone_enc_data;
    if (!iv || !data) return res.status(404).json({ error: "Not found" });
    res.json({ iv, data });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed" });
  }
});

// Public: Services
app.get("/api/services", async (req, res) => {
  try {
    const data = await loadServices();
    res.json(useSupabase() ? data.map(serviceRowToApi) : data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Public: Checkout config (flat product prices + delivery fees from settings)
app.get("/api/checkout/config", async (req, res) => {
  try {
    const s = await loadSettings();
    res.json(checkoutConfigFromSettings(s));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Public: site-wide toggles (background music, etc.)
app.get("/api/site/config", async (req, res) => {
  try {
    const s = await loadSettings();
    res.json(siteConfigFromSettings(s));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stripe Checkout: create session and redirect to payment (or test URL if test mode)
// Capture / update an in-progress checkout lead BEFORE Stripe. This makes
// every customer who reaches the delivery step recoverable in admin even if
// they never finish payment, never load the tag-info page, or get a network
// blip mid-flow. The same endpoint is used for incremental updates as the
// shopper edits fields - the lead row is upserted by leadToken.
app.post("/api/checkout/lead", async (req, res) => {
  try {
    const body = req.body || {};
    const incomingToken = String(body.leadToken || "").trim();
    const safeToken = /^[a-zA-Z0-9_-]{8,80}$/.test(incomingToken)
      ? incomingToken
      : randomUUID();
    const userAgent = String(req.get("user-agent") || "").slice(0, 500) || null;
    const clientIp =
      String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      null;
    const nowIso = new Date().toISOString();

    const safeStr = (v, max) => (typeof v === "string" ? v.slice(0, max) : null);
    const refCode = slugifyAffiliate(body.referralCode) || null;
    const fieldUpdates = {
      deliveryMethod: safeStr(body.deliveryMethod, 20),
      deliveryEmail: safeStr(body.deliveryEmail, 200),
      deliveryAddress: safeStr(body.deliveryAddress, 500),
      deliveryPhone: safeStr(body.deliveryPhone, 50),
      // Mirror the checkout phone onto the client phone field so it shows on the
      // admin order (and flows into the dispatch lead) right away, pre-payment.
      phone: safeStr(body.deliveryPhone, 50),
      productChoice: safeStr(body.productChoice, 30),
      serviceId: safeStr(body.serviceId, 50),
      serviceTitle: safeStr(body.serviceTitle, 100),
      lastActivityAt: nowIso,
    };

    let existing = null;
    if (useSupabase()) {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("lead_token", safeToken)
        .order("created_at", { ascending: false })
        .limit(1);
      existing = data && data[0] ? data[0] : null;
    } else {
      const orders = loadJson(ORDERS_FILE, []);
      existing = orders.find((o) => o.leadToken === safeToken) || null;
    }

    if (existing) {
      const id = existing.id;
      // First-touch attribution: only set the referral if this lead has none yet.
      if (refCode && !(existing.referral_code || existing.referralCode)) fieldUpdates.referralCode = refCode;
      await updateOrder(id, fieldUpdates);
      const refreshed = await findOrderById(id);
      const apiShape = useSupabase() ? orderRowToApi(refreshed) : refreshed;
      // Fire the supervisor "order added" alert once the lead has real content
      // (covers leads created near-empty, then filled in on a later edit).
      void maybeNotifySupervisorsOfOrder(apiShape);
      void maybeNotifyAffiliateOfLead(apiShape);
      return res.json({
        leadToken: safeToken,
        orderId: id,
        order: apiShape,
      });
    }

    const newId = randomUUID();
    const newOrder = {
      id: newId,
      serviceId: safeStr(body.serviceId, 50) || "checkout",
      serviceTitle: safeStr(body.serviceTitle, 100) || productChoiceTitle(body.productChoice),
      firstName: "Pending",
      lastName: "",
      phone: body.deliveryPhone || "",
      address: body.deliveryAddress || "",
      deliveryAddress: body.deliveryAddress || "",
      vin: "",
      carMakeModel: "",
      color: "",
      price: 0,
      createdAt: nowIso,
      paymentStatus: "lead",
      deliveryMethod: body.deliveryMethod || null,
      deliveryEmail: body.deliveryEmail || null,
      deliveryPhone: body.deliveryPhone || null,
      productChoice: body.productChoice || null,
      checkoutStatus: "lead_started",
      leadStartedAt: nowIso,
      lastActivityAt: nowIso,
      leadToken: safeToken,
      referralCode: refCode,
      userAgent,
      clientIp,
      telegramSent: false,
      telegramRecipients: [],
      telegramErrors: [],
    };
    await saveOrder(newOrder);
    // Fire once, right at capture (pre-checkout): supervisors always, affiliate
    // when the lead came from their link. Both are one-shot + best-effort.
    void maybeNotifySupervisorsOfOrder(newOrder);
    void maybeNotifyAffiliateOfLead(newOrder);
    return res.json({ leadToken: safeToken, orderId: newId, order: newOrder });
  } catch (e) {
    console.error("[lead-capture]", e);
    res.status(500).json({ error: e.message || "Failed to save lead" });
  }
});

app.post("/api/checkout/create-session", async (req, res) => {
  const body = req.body;
  const dm = String(body.deliveryMethod || "email");
  if (dm === "email" && (!body.deliveryEmail || !String(body.deliveryEmail).includes("@"))) {
    return res.status(400).json({ error: "Delivery email is required for email delivery." });
  }
  if (
    (dm === "mail" || dm === "driver" || dm === "overnight_fedex") &&
    (!body.deliveryAddress || !String(body.deliveryAddress).trim())
  ) {
    return res.status(400).json({ error: "Delivery address is required for this delivery method." });
  }
  if (
    (dm === "mail" || dm === "driver" || dm === "overnight_fedex") &&
    (!body.deliveryPhone || !String(body.deliveryPhone).trim())
  ) {
    return res.status(400).json({ error: "Phone is required for this delivery method." });
  }
  const settings = await loadSettings();
  const pricing = await computeExpectedCheckoutAmount(body, settings);
  const amount = pricing.amount;
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }
  const checkoutLineItemName = pricing.lineItemName;
  const resolvedServiceTitle = pricing.serviceTitle || body.serviceTitle || null;
  const leadToken = String(body.leadToken || "").trim() || null;
  const refCode = slugifyAffiliate(body.referralCode) || null;
  let baseUrl = "";
  if (body.successOrigin && typeof body.successOrigin === "string") {
    const origin = body.successOrigin.trim().replace(/\/$/, "");
    if (APP_URLS.some((allowed) => origin === allowed || origin === allowed.replace(/\/$/, ""))) baseUrl = origin;
  }
  if (!baseUrl) baseUrl = req.get("origin") || "";
  if (!baseUrl) {
    try {
      const ref = req.get("referer");
      if (ref) baseUrl = new URL(ref).origin;
    } catch {}
  }
  baseUrl = (baseUrl || APP_URL).replace(/\/$/, "");

  const nowIso = new Date().toISOString();

  // Helper: find an existing lead row by token so we update it through the
  // funnel instead of producing duplicate orders for the same shopper.
  async function findOrderByLeadToken(token) {
    if (!token) return null;
    if (useSupabase()) {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("lead_token", token)
        .order("created_at", { ascending: false })
        .limit(1);
      return data && data[0] ? data[0] : null;
    }
    const orders = loadJson(ORDERS_FILE, []);
    return orders.find((o) => o.leadToken === token) || null;
  }

  if (settings.test_mode) {
    const fakeSessionId = "test_" + randomUUID();
    const url = `${baseUrl}/checkout/tag-info?session_id=${fakeSessionId}&test=1`;
    const existingLead = await findOrderByLeadToken(leadToken);
    if (existingLead) {
      await updateOrder(existingLead.id, {
        stripeSessionId: fakeSessionId,
        paymentStatus: "paid",
        price: amount,
        serviceTitle: resolvedServiceTitle || checkoutLineItemName,
        deliveryMethod: body.deliveryMethod,
        deliveryEmail: body.deliveryEmail || "",
        deliveryAddress: body.deliveryAddress || "",
        deliveryPhone: body.deliveryPhone || "",
        productChoice: body.productChoice,
        checkoutStatus: "paid",
        paymentPendingAt: nowIso,
        paidAt: nowIso,
        lastActivityAt: nowIso,
      });
      return res.json({ url });
    }
    const order = {
      id: randomUUID(),
      serviceId: body.serviceId || "checkout",
      serviceTitle: resolvedServiceTitle || checkoutLineItemName,
      firstName: "Pending",
      lastName: "",
      phone: body.deliveryPhone || "",
      address: body.deliveryAddress || "",
      deliveryAddress: body.deliveryAddress || "",
      vin: "",
      carMakeModel: "",
      color: "",
      price: amount,
      createdAt: nowIso,
      stripeSessionId: fakeSessionId,
      paymentStatus: "paid",
      deliveryMethod: body.deliveryMethod,
      deliveryEmail: body.deliveryEmail || "",
      deliverySlot: body.deliverySlot || "",
      deliveryScheduledAt: body.deliveryScheduledAt || "",
      deliveryPhone: body.deliveryPhone || "",
      productChoice: body.productChoice,
      checkoutStatus: "paid",
      leadStartedAt: nowIso,
      paymentPendingAt: nowIso,
      paidAt: nowIso,
      lastActivityAt: nowIso,
      leadToken,
      telegramSent: false,
      telegramRecipients: [],
      telegramErrors: [],
    };
    await saveOrder(order);
    return res.json({ url });
  }

  if (!stripe) return res.status(503).json({ error: "Stripe is not configured." });
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: Math.round(amount * 100),
          product_data: {
            name: checkoutLineItemName,
            description: `${deliveryMethodLabel(body.deliveryMethod)} — TriState Tags`,
          },
        },
        quantity: 1,
      }],
      success_url: `${baseUrl}/checkout/tag-info?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout/product`,
      metadata: {
        deliveryMethod: String(body.deliveryMethod || "email").slice(0, 20),
        deliveryEmail: String(body.deliveryEmail || "").slice(0, 100),
        deliverySlot: String(body.deliverySlot || "").slice(0, 20),
        deliveryScheduledAt: String(body.deliveryScheduledAt || "").slice(0, 50),
        deliveryAddress: String(body.deliveryAddress || "").slice(0, 200),
        deliveryPhone: String(body.deliveryPhone || "").slice(0, 50),
        productChoice: String(body.productChoice || "tag_only").slice(0, 30),
        serviceId: String(body.serviceId || "checkout").slice(0, 50),
        serviceTitle: String(resolvedServiceTitle || checkoutLineItemName).slice(0, 100),
        amount: String(amount),
        leadToken: leadToken || "",
        referralCode: refCode || "",
      },
    });
    // Mark the existing lead as "payment_pending" so we can reach customers who
    // start Stripe Checkout but never finish (Stripe abandonment is one of the
    // top sources of disputes). The leadToken is also saved on the lead so the
    // verify step can match it when /api/checkout/verify runs.
    const existingLead = await findOrderByLeadToken(leadToken);
    if (existingLead) {
      await updateOrder(existingLead.id, {
        checkoutStatus: "payment_pending",
        paymentStatus: "payment_pending",
        paymentPendingAt: nowIso,
        lastActivityAt: nowIso,
        price: amount,
        serviceTitle: resolvedServiceTitle || checkoutLineItemName,
        stripeSessionId: session.id,
        deliveryMethod: body.deliveryMethod || null,
        deliveryEmail: body.deliveryEmail || null,
        deliveryAddress: body.deliveryAddress || null,
        deliveryPhone: body.deliveryPhone || null,
        productChoice: body.productChoice || null,
        // First-touch attribution: keep an earlier referral if one is already set.
        ...(refCode && !(existingLead.referral_code || existingLead.referralCode) ? { referralCode: refCode } : {}),
      });
    }
    res.json({ url: session.url });
  } catch (e) {
    console.error("Stripe create-session error:", e);
    res.status(500).json({ error: e.message || "Failed to create checkout session" });
  }
});

// Verify Stripe payment and create order (server-side verification)
/**
 * Ping the affiliate whose link drove this sale (in addition to everyone's
 * normal notifications). Called once, at the moment an order first becomes paid.
 * Best-effort: never throws.
 */
const _affEsc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function affiliateVehicle(order) {
  return order.year && order.make && order.model
    ? `${order.year} ${order.make} ${order.model}${order.color ? `, ${order.color}` : ""}`
    : order.carMakeModel || order.car_make_model || order.vehicleInfo || "";
}

async function notifyAffiliateOfSale(order) {
  try {
    const code = order?.referralCode || order?.referral_code;
    if (!code) return;
    const aff = await findAffiliate(code);
    if (!aff || !aff.active || !aff.telegramId) return;
    const esc = _affEsc;
    const who = `${order.firstName || order.first_name || ""} ${order.lastName || order.last_name || ""}`.trim();
    const amt = normalizeOrderPrice(order.price);
    const phone = order.phone || order.deliveryPhone || order.delivery_phone;
    const email = order.deliveryEmail || order.delivery_email;
    const deliv = order.deliveryMethod || order.delivery_method;
    const car = affiliateVehicle(order);
    const text = [
      "💰 <b>Sale from your link!</b>",
      `Link: <b>tristatetags.com/${esc(aff.slug)}</b>`,
      `Order #${esc((order.id || "").slice(0, 8))}`,
      amt > 0 ? `Amount: <b>$${amt.toFixed(2)}</b>` : null,
      `Customer: ${who ? esc(who) : "Pending"}`,
      phone ? `Phone: ${esc(phone)}` : null,
      email ? `Email: ${esc(email)}` : null,
      deliv ? `Delivery: ${esc(deliveryMethodLabel(deliv))}` : null,
      car ? `Vehicle: ${esc(car)}` : null,
      (order.productChoice || order.product_choice) ? `Product: ${esc(order.productChoice || order.product_choice)}` : null,
      "",
      "<i>⏳ Full order details will follow once the customer finishes their tag info.</i>",
    ]
      .filter(Boolean)
      .join("\n");
    await sendToTelegram(text, [aff.telegramId]);
    console.log(`[affiliate] notified ${aff.slug} of a sale`);
  } catch (e) {
    console.warn("[affiliate] notify failed:", e?.message || e);
  }
}

/**
 * Ping the affiliate again once the customer FINISHES (tag info submitted) with
 * the full order breakdown. Fired once, on the first transition to completed.
 * Best-effort: never throws.
 */
async function notifyAffiliateOfCompletedOrder(order) {
  try {
    const code = order?.referralCode || order?.referral_code;
    if (!code) return;
    const aff = await findAffiliate(code);
    if (!aff || !aff.active || !aff.telegramId) return;
    const esc = _affEsc;
    const who = `${order.firstName || order.first_name || ""} ${order.lastName || order.last_name || ""}`.trim();
    const amt = normalizeOrderPrice(order.price);
    const phone = order.phone || order.deliveryPhone || order.delivery_phone;
    const email = order.deliveryEmail || order.delivery_email;
    const car = affiliateVehicle(order);
    const regAddr = order.address;
    const delivAddr = order.deliveryAddress || order.delivery_address;
    const text = [
      "✅ <b>Completed order from your link!</b>",
      `Link: <b>tristatetags.com/${esc(aff.slug)}</b>`,
      `Order #${esc((order.id || "").slice(0, 8))}`,
      "",
      `Customer: ${who ? esc(who) : "—"}`,
      phone ? `Phone: ${esc(phone)}` : null,
      email ? `Email: ${esc(email)}` : null,
      order.deliveryMethod ? `Delivery: ${esc(deliveryMethodLabel(order.deliveryMethod))}` : null,
      regAddr ? `Registration address: ${esc(regAddr)}` : null,
      delivAddr ? `Delivery address: ${esc(delivAddr)}` : null,
      order.vin ? `VIN: ${esc(order.vin)}` : null,
      car ? `Vehicle: ${esc(car)}` : null,
      order.insuranceCompany ? `Insurance: ${esc(order.insuranceCompany)}` : null,
      order.policyNumber ? `Policy #: ${esc(order.policyNumber)}` : null,
      amt > 0 ? `Amount: <b>$${amt.toFixed(2)}</b>` : null,
      order.krableadsReferenceId ? `Reference: <code>${esc(order.krableadsReferenceId)}</code>` : null,
    ]
      .filter(Boolean)
      .join("\n");
    await sendToTelegram(text, [aff.telegramId]);
    console.log(`[affiliate] notified ${aff.slug} of a completed order`);
  } catch (e) {
    console.warn("[affiliate] completed notify failed:", e?.message || e);
  }
}

/**
 * Finalize a paid Stripe Checkout session into an admin order row. Shared by
 * the customer-side /api/checkout/verify (when the browser comes back) and
 * the server-side /api/stripe/webhook (when it does not). Idempotent: if the
 * order is already saved, we just patch missing payment fields.
 */
async function persistPaidStripeSession(session, { source = "verify" } = {}) {
  if (!session) return null;
  const sessionId = session.id;
  const nowIso = new Date().toISOString();
  const meta = session.metadata || {};

  const existing = await findOrderByStripeSessionId(sessionId);
  if (existing) {
    let apiShape = useSupabase() ? orderRowToApi(existing) : existing;
    const resolvedPrice = await resolveOrderPrice(apiShape, sessionId);
    const patch = { lastActivityAt: nowIso };
    if (resolvedPrice > 0 && normalizeOrderPrice(apiShape.price) <= 0) {
      patch.price = resolvedPrice;
      apiShape = { ...apiShape, price: resolvedPrice };
    }
    const becamePaid = !apiShape.paidAt;
    if (becamePaid) {
      patch.paidAt = nowIso;
      patch.checkoutStatus =
        apiShape.checkoutStatus === "tag_info_submitted" ||
        apiShape.checkoutStatus === "complete"
          ? apiShape.checkoutStatus
          : "paid";
      patch.paymentStatus = "paid";
    }
    if (Object.keys(patch).length > 1) {
      await updateOrder(apiShape.id, patch);
    }
    if (becamePaid) await notifyAffiliateOfSale(apiShape);
    return apiShape;
  }

  const leadToken = String(meta.leadToken || "").trim();
  let leadRow = null;
  if (leadToken) {
    if (useSupabase()) {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("lead_token", leadToken)
        .order("created_at", { ascending: false })
        .limit(1);
      leadRow = data && data[0] ? data[0] : null;
    } else {
      const orders = loadJson(ORDERS_FILE, []);
      leadRow = orders.find((o) => o.leadToken === leadToken) || null;
    }
  }

  const serviceTitle = meta.serviceTitle || productChoiceTitle(meta.productChoice);
  const finalPrice = (session.amount_total || 0) / 100;

  if (leadRow) {
    const orderId = leadRow.id;
    await updateOrder(orderId, {
      stripeSessionId: sessionId,
      paymentStatus: "paid",
      checkoutStatus: "paid",
      paidAt: nowIso,
      lastActivityAt: nowIso,
      price: finalPrice,
      serviceTitle,
      deliveryMethod: meta.deliveryMethod || null,
      deliveryEmail: meta.deliveryEmail || null,
      deliveryPhone: meta.deliveryPhone || null,
      productChoice: meta.productChoice || null,
    });
    await appendActivity("dataIn", {
      type: "order",
      orderId,
      serviceTitle,
      price: finalPrice,
      stripeSessionId: sessionId,
      source,
    });
    await appendActivity("payments", {
      type: "order",
      orderId,
      amount: finalPrice,
      status: "paid",
      stripeSessionId: sessionId,
      source,
    });
    const refreshed = await findOrderById(orderId);
    const finalOrder = useSupabase() ? orderRowToApi(refreshed) : refreshed;
    await notifyAffiliateOfSale(finalOrder);
    return finalOrder;
  }

  const order = {
    id: randomUUID(),
    serviceId: meta.serviceId || "checkout",
    serviceTitle,
    firstName: "Pending",
    lastName: "",
    phone: meta.deliveryPhone || "",
    address: meta.deliveryAddress || "",
    deliveryAddress: meta.deliveryAddress || "",
    vin: "",
    carMakeModel: "",
    color: "",
    price: finalPrice,
    createdAt: nowIso,
    stripeSessionId: sessionId,
    paymentStatus: "paid",
    deliveryMethod: meta.deliveryMethod,
    deliveryEmail: meta.deliveryEmail,
    deliverySlot: meta.deliverySlot,
    deliveryScheduledAt: meta.deliveryScheduledAt,
    deliveryPhone: meta.deliveryPhone,
    productChoice: meta.productChoice,
    checkoutStatus: "paid",
    leadStartedAt: nowIso,
    paymentPendingAt: nowIso,
    paidAt: nowIso,
    lastActivityAt: nowIso,
    leadToken: leadToken || null,
    referralCode: slugifyAffiliate(meta.referralCode) || null,
    telegramSent: false,
    telegramRecipients: [],
    telegramErrors: [],
  };
  await appendActivity("dataIn", {
    type: "order",
    orderId: order.id,
    serviceTitle: order.serviceTitle,
    price: order.price,
    stripeSessionId: sessionId,
    source,
  });
  await appendActivity("payments", {
    type: "order",
    orderId: order.id,
    amount: order.price,
    status: "paid",
    stripeSessionId: sessionId,
    source,
  });
  await saveOrder(order);
  await notifyAffiliateOfSale(order);
  return order;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Stripe may still be settling when the browser hits verify — poll briefly. */
async function retrievePaidStripeSession(sessionId, { maxAttempts = 10, delayMs = 1500 } = {}) {
  if (!stripe) throw new Error("Stripe is not configured.");
  let lastSession = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    lastSession = session;
    if (session.payment_status === "paid") return session;
    if (session.status === "expired") break;
    if (attempt < maxAttempts - 1) await sleep(delayMs);
  }
  return lastSession;
}

/** Orders stuck at payment_pending that still carry a real Stripe session id. */
async function listPendingStripeOrders(limit = 200) {
  if (useSupabase()) {
    const { data, error } = await supabase
      .from("orders")
      .select("stripe_session_id, created_at")
      .eq("payment_status", "payment_pending")
      .is("paid_at", null)
      .not("stripe_session_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("[reconcile] list error:", error.message);
      return [];
    }
    return (data || []).map((r) => ({ sessionId: r.stripe_session_id, createdAt: r.created_at }));
  }
  const orders = loadJson(ORDERS_FILE, []);
  return orders
    .filter((o) => o.paymentStatus === "payment_pending" && !o.paidAt && o.stripeSessionId)
    .map((o) => ({ sessionId: o.stripeSessionId, createdAt: o.createdAt }));
}

/**
 * Safety net for the webhook: poll Stripe for orders left at payment_pending and
 * finalize any that actually paid. This is what "stops the bleeding" when the
 * customer never returns to the success page AND the webhook is down/misconfigured.
 * Idempotent (persistPaidStripeSession patches, never duplicates).
 */
let reconcileRunning = false;
async function reconcilePendingStripeOrders() {
  if (!stripe || reconcileRunning) return 0;
  reconcileRunning = true;
  let recovered = 0;
  try {
    const pending = await listPendingStripeOrders();
    // Stripe Checkout sessions expire ~24h after creation; look back 3 days so
    // we skip long-dead sessions instead of retrieving them every sweep.
    const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
    for (const { sessionId, createdAt } of pending) {
      if (!sessionId || sessionId.startsWith("test_")) continue;
      if (createdAt && new Date(createdAt).getTime() < cutoff) continue;
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session && session.payment_status === "paid") {
          await persistPaidStripeSession(session, { source: "reconcile" });
          recovered++;
        }
      } catch {
        /* expired/deleted session — ignore */
      }
    }
    if (recovered) console.log(`[reconcile] finalized ${recovered} paid-but-pending order(s)`);
  } catch (e) {
    console.warn("[reconcile] sweep failed:", e?.message || e);
  } finally {
    reconcileRunning = false;
  }
  return recovered;
}

/**
 * Stripe webhook — fires when a Checkout Session is paid, regardless of
 * whether the customer's browser made it back to the verify page. Without
 * this, lost redirects (mobile Apple Pay, network drops, closed tabs) cause
 * Stripe to receive money while the admin dashboard stays empty.
 */
async function handleStripeWebhook(req, res) {
  if (!stripe) return res.status(503).send("Stripe not configured");
  const signature = req.headers["stripe-signature"];
  if (!STRIPE_WEBHOOK_SECRET) {
    console.warn("[stripe-webhook] STRIPE_WEBHOOK_SECRET not set — refusing to process events");
    return res.status(503).send("Webhook secret not configured");
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      let session = event.data?.object || null;
      if (session && session.payment_status !== "paid") {
        try {
          session = await stripe.checkout.sessions.retrieve(session.id);
        } catch {
          /* ignore — use the event payload as-is */
        }
      }
      if (session && session.payment_status === "paid") {
        await persistPaidStripeSession(session, { source: "webhook" });
      }
    }
    res.json({ received: true });
  } catch (e) {
    console.error("[stripe-webhook] handler error:", e);
    res.status(500).send("Webhook handler failed");
  }
}

app.get("/api/checkout/verify", async (req, res) => {
  const sessionId = req.query.session_id;
  const isTest = req.query.test === "1";
  if (!sessionId || typeof sessionId !== "string") return res.status(400).json({ error: "Missing session_id" });

  if (isTest && sessionId.startsWith("test_")) {
    const existing = await findOrderByStripeSessionId(sessionId);
    if (existing) return res.json(useSupabase() ? orderRowToApi(existing) : existing);
    return res.status(404).json({ error: "Test order not found" });
  }

  if (!stripe) return res.status(503).json({ error: "Stripe is not configured." });
  try {
    const session = await retrievePaidStripeSession(sessionId);
    if (!session || session.payment_status !== "paid") {
      return res.status(400).json({
        error: "Payment not completed",
        paymentStatus: session?.payment_status || "unknown",
      });
    }
    const order = await persistPaidStripeSession(session, { source: "verify" });
    if (!order) return res.status(500).json({ error: "Failed to record order" });
    res.json(order);
  } catch (e) {
    console.error("Stripe verify error:", e);
    res.status(500).json({ error: e.message || "Failed to verify payment" });
  }
});

// AI assist on the Tag Information page: extract fields from arbitrary
// pasted text (registration, sale receipt, email, etc.). Public because
// the customer hasn't logged in — rate-limited only by OpenAI cost.
app.post("/api/checkout/parse-text", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) return res.status(400).json({ error: "Provide 'text' in the request body" });
  if (text.length > 20000) {
    return res.status(413).json({ error: "Pasted text is too long (max 20000 characters)" });
  }
  try {
    const fields = await callOpenAIForTagInfo([
      { role: "system", content: TAG_INFO_SYSTEM_PROMPT },
      { role: "user", content: `Extract fields from this text:\n\n${text}` },
    ]);
    res.json({ fields });
  } catch (e) {
    const status = e?.status && Number(e.status) >= 400 ? Number(e.status) : 500;
    res.status(status).json({ error: e.message || "Parse failed" });
  }
});

// Same as parse-text, but for an uploaded image or PDF (driver's license,
// insurance card, registration photo/PDF). Uses OpenAI vision for images
// and OpenAI file input for PDFs (base64 data URL).
// When an orderId is provided, the file is also persisted and attached to
// the order so it travels with the lead to whoever accepts it.
app.post("/api/checkout/parse-document", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "Upload a file under the 'file' field" });
  const mime = (file.mimetype || "").toLowerCase();
  const originalName = file.originalname || "document";
  const lowerName = originalName.toLowerCase();
  const isPdf = mime === "application/pdf" || lowerName.endsWith(".pdf");
  const isImage = mime.startsWith("image/");
  if (!isPdf && !isImage) {
    return res.status(415).json({ error: "Only image (JPEG/PNG/WEBP/GIF) or PDF uploads are supported." });
  }
  const orderId = typeof req.body?.orderId === "string" ? req.body.orderId.trim() : "";
  try {
    const base64 = file.buffer.toString("base64");
    const userContent = isPdf
      ? [
          {
            type: "text",
            text: "Extract the tag-information fields from this document. Return null for any field not clearly visible.",
          },
          {
            type: "file",
            file: {
              filename: originalName.endsWith(".pdf") ? originalName : `${originalName}.pdf`,
              file_data: `data:application/pdf;base64,${base64}`,
            },
          },
        ]
      : [
          {
            type: "text",
            text: "Extract the tag-information fields from this document. Return null for any field not clearly visible.",
          },
          { type: "image_url", image_url: { url: `data:${mime || "image/jpeg"};base64,${base64}` } },
        ];

    const fields = await callOpenAIForTagInfo([
      { role: "system", content: TAG_INFO_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ]);

    // Best-effort: persist the uploaded file alongside the order so it gets
    // forwarded to whichever dispatcher group accepts the lead. Failure here
    // must not block the parse response — the form still gets auto-filled.
    if (orderId) {
      try {
        await persistAiSourceFile(orderId, file, { isPdf, mime });
      } catch (err) {
        console.warn("[parse-document] Could not persist AI source for order", orderId, "-", err.message);
      }
    }

    res.json({ fields });
  } catch (e) {
    const status = e?.status && Number(e.status) >= 400 ? Number(e.status) : 500;
    res.status(status).json({ error: e.message || "Parse failed" });
  }
});

// Pick a sane file extension for an AI source upload so dispatchers see the
// right file type when it lands in Telegram.
function aiSourceExtension(file, { isPdf, mime }) {
  if (isPdf) return ".pdf";
  const original = (file.originalname || "").toLowerCase();
  const m = original.match(/\.(jpe?g|png|webp|gif|heic|heif)$/);
  if (m) return `.${m[1]}`;
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  if (mime.includes("heic")) return ".heic";
  return ".jpg";
}

// Read the doc_parsed_source column (which historically held a single URL
// string but now may hold a JSON array of URLs) into a consistent shape:
// returns a string[] when there are multiple sources, otherwise the single
// string (for backward compatibility), or null.
function parseDocParsedSourceColumn(value) {
  const list = normalizeAiSourceList(value);
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  return list;
}

function normalizeAiSourceList(value) {
  const out = [];
  const seen = new Set();
  const push = (u) => {
    const t = typeof u === "string" ? u.trim() : "";
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  if (!value) return [];
  if (Array.isArray(value)) {
    value.forEach((v) => push(v));
    return out;
  }
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        parsed.forEach((v) => push(v));
        return out;
      }
    } catch {}
  }
  push(trimmed);
  return out;
}

async function persistAiSourceFile(orderId, file, { isPdf, mime }) {
  await runAiSourcePersistSerialized(orderId, async () => {
    const order = await findOrderById(orderId);
    if (!order) throw new Error("Order not found");
    const ext = aiSourceExtension(file, { isPdf, mime });
    const uniq = `${Date.now()}-${randomBytes(4).toString("hex")}`;
    const url = await uploadDocToStorage(orderId, `ai-source-${uniq}`, file.buffer, ext);
    if (!url) return;
    const apiOrder = useSupabase() ? orderRowToApi(order) : order;
    const existing = normalizeAiSourceList(apiOrder.docParsedSource);
    if (existing.includes(url)) return;
    const next = [...existing, url];
    await updateOrder(orderId, { docParsedSource: next });
    console.log(`[parse-document] Appended AI source (${next.length} total) for order ${orderId.slice(0, 8)}`);
  });
}

// Submit tag info after payment
app.patch("/api/orders/:id/tag-info", async (req, res) => {
  const { id } = req.params;
  const body = req.body;
  try {
    const order = await findOrderById(id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    let o = useSupabase() ? orderRowToApi(order) : order;
    if (o.paymentStatus !== "paid") return res.status(400).json({ error: "Order not paid" });

    const resolvedPrice = await resolveOrderPrice(o);
    if (resolvedPrice > 0 && normalizeOrderPrice(o.price) <= 0) {
      await persistOrderPriceIfNeeded(id, resolvedPrice);
      o = { ...o, price: resolvedPrice };
    }

    const vehicleInfo = body.vehicleInfo || (body.year && body.make && body.model && body.color
      ? `${body.year} ${body.make} ${body.model}, ${body.color}` : body.vehicleInfo);
    const carMakeModel = body.year && body.make && body.model
      ? `${body.year} ${body.make} ${body.model}` : (body.vehicleInfo?.split(",")[0] || "");

    const deliverySameAsRegistration =
      body.deliverySameAsRegistration === true || body.deliverySameAsRegistration === "true";
    const bodyDelivRaw = typeof body.deliveryAddress === "string" ? body.deliveryAddress.trim() : "";
    const deliveryCombined =
      bodyDelivRaw !== ""
        ? bodyDelivRaw
        : (o.deliveryAddress || o.delivery_address || "");

    const tagInfoNow = new Date().toISOString();
    await updateOrder(id, {
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      address: body.address,
      deliveryAddress: deliveryCombined,
      deliverySameAsRegistration,
      vin: body.vin,
      year: body.year,
      make: body.make,
      model: body.model,
      color: body.color,
      vehicleInfo,
      carMakeModel,
      insuranceCompany: body.insuranceCompany,
      policyNumber: body.policyNumber,
      notes: body.notes,
      checkoutStatus: "tag_info_submitted",
      tagInfoSubmittedAt: tagInfoNow,
      lastActivityAt: tagInfoNow,
    });

    const updated = await findOrderById(id);
    const full = useSupabase() ? { ...orderRowToApi(updated), ...body, vehicleInfo, carMakeModel } : { ...updated, ...body, vehicleInfo, carMakeModel };
    full.deliveryAddress = deliveryCombined || full.deliveryAddress || full.delivery_address || "";
    full.deliverySameAsRegistration = deliverySameAsRegistration;

    let telegramSent = false;
    let telegramRecipients = [];
    let telegramErrors = [];
    let claimMessageIds = {};

    if (isKrableadsIngestEnabled()) {
      const ingest = await submitLeadToKrableads(full);
      if (ingest.ok) {
        if (!ingest.cached) {
          await updateOrder(id, {
            krableadsReferenceId: ingest.reference_id,
            krableadsLeadId: ingest.lead_id || null,
            krableadsIngestedAt: new Date().toISOString(),
            krableadsIngestError: null,
          });
        }
        full.krableadsReferenceId = ingest.reference_id;
        if (ingest.lead_id) full.krableadsLeadId = ingest.lead_id;
        telegramSent = true;
        console.log(`[KrableadsIngest] Order ${id.slice(0, 8)} → ref ${ingest.reference_id}`);
      } else {
        await updateOrder(id, { krableadsIngestError: ingest.error });
        telegramErrors.push({ error: ingest.error, status: ingest.status });
        console.error("[KrableadsIngest]", id.slice(0, 8), ingest.error);
      }
    } else {
      const dispatchers = await loadDispatchers();
      if (dispatchers.length > 0 && TELEGRAM_BOT_TOKEN) {
        for (const d of dispatchers) {
          // Always send claim to the dispatcher GROUP (bots can reliably post in groups),
          // and best-effort to the personal chat if provided.
          const groupChatId = canonicalChatId(d.groupId);
          const groupRes = await sendClaimMessageToDispatcher(groupChatId, id, full);
          if (groupRes.ok && groupRes.messageId) claimMessageIds[groupChatId] = groupRes.messageId;
          if (groupRes.ok) telegramRecipients.push(groupChatId);
          else telegramErrors.push({ chatId: groupChatId, error: "Failed to send claim" });

          const dmChatId = canonicalChatId(d.dispatcherId);
          if (dmChatId && dmChatId !== groupChatId) {
            const dmRes = await sendClaimMessageToDispatcher(dmChatId, id, full);
            if (dmRes.ok && dmRes.messageId) claimMessageIds[dmChatId] = dmRes.messageId;
            if (dmRes.ok) telegramRecipients.push(dmChatId);
            else telegramErrors.push({ chatId: dmChatId, error: "Failed to send claim" });
          }
        }
        // Consider it "sent" if at least one dispatcher received the claim.
        telegramSent = telegramRecipients.length > 0;
        await updateOrder(id, { telegramClaimMessageIds: claimMessageIds });
        if (telegramRecipients.length > 0) {
          scheduleAutoAssignFallback(id, claimMessageIds, dispatchers);
        }
      } else if (TELEGRAM_CHAT_IDS.length > 0 && TELEGRAM_BOT_TOKEN) {
        const telegramResults = await sendToTelegram(formatOrderMessage(full));
        telegramSent = telegramResults.every((r) => r.ok);
        telegramRecipients = telegramResults.filter((r) => r.ok).map((r) => r.chatId);
        telegramErrors = telegramResults.filter((r) => !r.ok).map((r) => ({ chatId: r.chatId, error: r.error }));
      }
    }

    // Internal lead notifications (email + personal Telegram DMs). Fire once
    // per lead (guarded by newLeadEmailSent) so re-PATCHing tag info from the
    // customer flow doesn't spam the recipients. Errors are non-fatal — the
    // dispatcher claim messages are the primary channel; both fan-outs here
    // are best-effort. We set the flag if EITHER side succeeded so we don't
    // re-spam everyone if just one channel had a transient failure.
    try {
      const alreadyNotified =
        (useSupabase() ? updated?.new_lead_email_sent : updated?.newLeadEmailSent) === true;
      if (!alreadyNotified) {
        const [emailSent, tgSent] = await Promise.all([
          sendNewLeadEmail(full).catch((e) => {
            console.error("[LeadEmail] Non-fatal error while sending new-lead email:", e);
            return false;
          }),
          sendNewLeadTelegramNotifications(full).catch((e) => {
            console.error("[LeadTelegram] Non-fatal error while sending new-lead DMs:", e);
            return false;
          }),
        ]);
        if (emailSent || tgSent) {
          await updateOrder(id, { newLeadEmailSent: true });
        }
      }
    } catch (notifyErr) {
      console.error("[LeadNotify] Unexpected error in lead-notify block:", notifyErr);
    }

    // Affiliate full-order ping — fire once, on the first transition to completed
    // (o holds the pre-update status). full carries referralCode + krableads ref.
    if (o.checkoutStatus !== "tag_info_submitted" && o.checkoutStatus !== "complete") {
      await notifyAffiliateOfCompletedOrder(full);
    }

    if (useSupabase()) {
      await supabase.from("orders").update({
        telegram_sent: telegramSent,
        telegram_recipients: JSON.stringify(telegramRecipients),
        telegram_errors: JSON.stringify(telegramErrors),
      }).eq("id", id);
    } else {
      const orders = loadJson(ORDERS_FILE, []);
      const idx = orders.findIndex((o) => o.id === id);
      if (idx >= 0) {
        orders[idx].telegramSent = telegramSent;
        orders[idx].telegramRecipients = telegramRecipients;
        orders[idx].telegramErrors = telegramErrors;
        orders[idx].telegramClaimMessageIds = claimMessageIds;
        Object.assign(orders[idx], {
          firstName: body.firstName,
          lastName: body.lastName,
          phone: body.phone,
          address: body.address,
          deliveryAddress: deliveryCombined,
          deliverySameAsRegistration,
          vin: body.vin,
          year: body.year,
          make: body.make,
          model: body.model,
          color: body.color,
          vehicleInfo,
          carMakeModel,
          insuranceCompany: body.insuranceCompany,
          policyNumber: body.policyNumber,
          notes: body.notes,
        });
        saveJson(ORDERS_FILE, orders);
      }
    }
    const final = await findOrderById(id);
    res.json(useSupabase() ? orderRowToApi(final) : final);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const ORDER_DOCUMENTS_BUCKET = "order-documents";

async function ensureOrderDocumentsBucket() {
  if (!useSupabase() || !supabase) return;
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = (buckets || []).some((b) => b.name === ORDER_DOCUMENTS_BUCKET);
    if (!exists) {
      const { error } = await supabase.storage.createBucket(ORDER_DOCUMENTS_BUCKET, {
        public: true,
        allowedMimeTypes: ["image/*", "application/pdf"],
      });
      if (error && !String(error.message || "").toLowerCase().includes("already exists")) throw error;
    } else {
      // Ensure PDFs and images are allowed even if bucket already existed.
      const { error: updateError } = await supabase.storage.updateBucket(ORDER_DOCUMENTS_BUCKET, {
        public: true,
        allowedMimeTypes: ["image/*", "application/pdf"],
      });
      if (updateError && !String(updateError.message || "").toLowerCase().includes("not implemented")) {
        console.warn("[Supabase] updateBucket warning:", updateError.message);
      }
    }
  } catch (err) {
    console.warn("[Supabase] ensureOrderDocumentsBucket:", err.message);
  }
}

// Upload order documents (after tag info)
function contentTypeForExt(ext) {
  switch ((ext || "").toLowerCase()) {
    case ".pdf": return "application/pdf";
    case ".png": return "image/png";
    case ".webp": return "image/webp";
    case ".gif": return "image/gif";
    case ".heic": return "image/heic";
    case ".heif": return "image/heif";
    default: return "image/jpeg";
  }
}

async function uploadDocToStorage(orderId, type, buffer, ext) {
  if (useSupabase() && supabase) {
    await ensureOrderDocumentsBucket();
    const path = `${orderId}/${type}${ext}`;
    const { data, error } = await supabase.storage.from(ORDER_DOCUMENTS_BUCKET).upload(path, buffer, {
      contentType: contentTypeForExt(ext),
      upsert: true,
    });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from(ORDER_DOCUMENTS_BUCKET).getPublicUrl(path);
    return urlData?.publicUrl || null;
  }
  const fname = `${orderId}_${type}${ext}`;
  const filePath = join(DOCS_DIR, fname);
  writeFileSync(filePath, buffer);
  return `${APP_URL.replace(/\/$/, "")}/api/orders/${orderId}/documents/${type}`;
}

app.post("/api/orders/:id/documents", upload.fields([
  { name: "driversLicense", maxCount: 1 },
  { name: "insuranceCard", maxCount: 1 },
  { name: "vinPhoto", maxCount: 1 },
]), async (req, res) => {
  const { id } = req.params;
  const files = req.files || {};
  try {
    const order = await findOrderById(id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const o = useSupabase() ? orderRowToApi(order) : order;
    if (o.paymentStatus !== "paid") return res.status(400).json({ error: "Order not paid" });

    const updates = {};
    if (files.driversLicense?.[0]) {
      const buf = files.driversLicense[0].buffer;
      const ext = (files.driversLicense[0].originalname || "").toLowerCase().endsWith(".pdf") ? ".pdf" : ".jpg";
      updates.docDriversLicense = await uploadDocToStorage(id, "drivers-license", buf, ext);
    }
    if (files.insuranceCard?.[0]) {
      const buf = files.insuranceCard[0].buffer;
      const ext = (files.insuranceCard[0].originalname || "").toLowerCase().endsWith(".pdf") ? ".pdf" : ".jpg";
      updates.docInsuranceCard = await uploadDocToStorage(id, "insurance-card", buf, ext);
    }
    if (files.vinPhoto?.[0]) {
      const buf = files.vinPhoto[0].buffer;
      const ext = (files.vinPhoto[0].originalname || "").toLowerCase().endsWith(".pdf") ? ".pdf" : ".jpg";
      updates.docVinPhoto = await uploadDocToStorage(id, "vin-photo", buf, ext);
    }
    if (Object.keys(updates).length > 0) {
      const docsNow = new Date().toISOString();
      updates.documentsUploadedAt = docsNow;
      updates.lastActivityAt = docsNow;
      updates.checkoutStatus = "complete";
      await updateOrder(id, updates);
      const updated = await findOrderById(id);
      const full = useSupabase() ? orderRowToApi(updated) : updated;
      Object.assign(full, updates);
      await sendDocImagesToTelegram(full);
    }
    const final = await findOrderById(id);
    res.json(useSupabase() ? orderRowToApi(final) : final);
  } catch (e) {
    console.error("Documents upload error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/orders/:id/documents/:type", (req, res) => {
  const { id, type } = req.params;
  const allowedFixed = new Set(["drivers-license", "insurance-card", "vin-photo"]);
  // ai-source-<timestamp> files are the customer-uploaded originals from the
  // AI auto-fill step — there can be multiple per order.
  const isAiSource = /^ai-source-[a-z0-9-]+$/i.test(type);
  if (!allowedFixed.has(type) && !isAiSource) return res.status(404).end();
  const base = `${id}_${type}`;
  for (const ext of [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".pdf"]) {
    const p = join(DOCS_DIR, base + ext);
    if (existsSync(p)) return res.sendFile(p);
  }
  res.status(404).end();
});

// Send success email when order completes - works in test and live mode whenever we have an email
app.post("/api/orders/:id/send-success-email", async (req, res) => {
  const { id } = req.params;
  try {
    const order = await findOrderById(id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const o = useSupabase() ? orderRowToApi(order) : order;
    const alreadySent = useSupabase() ? order.success_email_sent : order.successEmailSent;
    if (alreadySent) return res.json({ sent: true });
    if (!o.deliveryEmail || !o.deliveryEmail.includes("@")) {
      console.warn("[Email] Order", id, "has no deliveryEmail:", o.deliveryEmail);
      return res.json({ sent: false });
    }
    const ok = await sendSuccessEmail(o);
    if (ok) await updateOrder(id, { successEmailSent: true });
    res.json({ sent: ok });
  } catch (e) {
    console.error("Send success email error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/auth/login", (req, res) => {
  const { password } = req.body || {};
  if (!ADMIN_PASSWORD) return res.status(500).json({ error: "Admin password not configured (ADMIN_PASSWORD in .env)" });
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Invalid password" });
  const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token });
});

app.get("/api/admin/orders", authMiddleware, async (req, res) => {
  try {
    const data = await loadOrders();
    const rows = useSupabase() ? data.map(orderRowToApi) : data;
    let backfilled = 0;
    for (const o of rows) {
      if (backfilled >= 25) break;
      if (normalizeOrderPrice(o.price) > 0 || !o.stripeSessionId) continue;
      const resolved = await resolveOrderPrice(o);
      if (resolved > 0) {
        await persistOrderPriceIfNeeded(o.id, resolved);
        o.price = resolved;
        backfilled += 1;
      }
    }
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Force the Stripe reconciliation sweep now (recover paid-but-pending orders).
app.post("/api/admin/reconcile-pending", authMiddleware, async (req, res) => {
  try {
    const recovered = await reconcilePendingStripeOrders();
    res.json({ ok: true, recovered });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Run the abandoned-cart follow-up email sweep now (1h + weekly nudges),
// instead of waiting for the 15-min timer. Returns how many emails were sent.
app.post("/api/admin/abandoned/run", authMiddleware, async (req, res) => {
  try {
    if (!resend) return res.json({ ok: false, error: "RESEND_API_KEY not configured", sent: 0 });
    const sent = await sweepAbandonedCarts();
    res.json({ ok: true, sent: sent || 0 });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Send a follow-up reminder to one specific order now (admin "Send follow-up").
app.post("/api/admin/orders/:id/send-followup", authMiddleware, async (req, res) => {
  try {
    const order = orderRowToApi(await findOrderById(req.params.id));
    if (!order || !order.id) return res.status(404).json({ ok: false, reason: "not_found" });
    const result = await sendFollowupForOrder(order, { force: true });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Affiliate referral links (admin-managed) ────────────────────────────────
// Public: does this slug map to a real affiliate? (lets the landing show a badge)
app.get("/api/affiliate/:slug", async (req, res) => {
  const aff = await findAffiliate(req.params.slug);
  res.json({ slug: slugifyAffiliate(req.params.slug), exists: !!(aff && aff.active), label: aff?.label || null });
});
// Admin: list / upsert / delete affiliates.
app.get("/api/admin/affiliates", authMiddleware, async (_req, res) => {
  res.json(await loadAffiliates());
});
app.post("/api/admin/affiliates", authMiddleware, async (req, res) => {
  const slug = slugifyAffiliate(req.body?.slug ?? req.body?.name);
  if (!slug) return res.status(400).json({ error: "A link name is required (letters, numbers, dashes)." });
  const list = await loadAffiliates();
  const idx = list.findIndex((a) => a.slug === slug);
  const prev = idx >= 0 ? list[idx] : null;
  const entry = {
    slug,
    label: String(req.body?.label ?? req.body?.name ?? slug).trim() || slug,
    telegramId: canonicalChatId(req.body?.telegramId ?? req.body?.telegram_id ?? ""),
    active: req.body?.active !== false,
    createdAt: idx >= 0 ? list[idx].createdAt : new Date().toISOString(),
    welcomedAt: prev?.welcomedAt || null,
  };
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  // Welcome the affiliate once — on first setup with a Telegram id, or if the id changed.
  const shouldWelcome =
    entry.active && entry.telegramId && (!entry.welcomedAt || prev?.telegramId !== entry.telegramId);
  if (shouldWelcome && (await sendAffiliateWelcome(entry))) {
    entry.welcomedAt = new Date().toISOString();
  }
  try {
    const saved = await saveAffiliates(list);
    res.json({ ok: true, affiliates: saved });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.delete("/api/admin/affiliates/:slug", authMiddleware, async (req, res) => {
  const slug = slugifyAffiliate(req.params.slug);
  const list = (await loadAffiliates()).filter((a) => a.slug !== slug);
  try {
    const saved = await saveAffiliates(list);
    res.json({ ok: true, affiliates: saved });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/admin/services", authMiddleware, async (req, res) => {
  try {
    const data = await loadServices();
    res.json(useSupabase() ? data.map(serviceRowToApi) : data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/services", authMiddleware, async (req, res) => {
  const body = req.body;
  if (!body.title || !body.description || body.price == null) return res.status(400).json({ error: "Missing title, description, or price" });
  const newService = {
    id: Date.now().toString(),
    title: body.title,
    description: body.description,
    price: parseFloat(body.price),
    image: body.image || "",
  };
  try {
    await addService(newService);
    await appendActivity("dataOut", { type: "service_add", serviceId: newService.id });
    res.json(newService);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/admin/services/:id", authMiddleware, async (req, res) => {
  try {
    await deleteServiceById(req.params.id);
    await appendActivity("dataOut", { type: "service_delete", serviceId: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/admin/settings", authMiddleware, async (req, res) => {
  try {
    const s = await loadSettings();
    const pricing = checkoutConfigFromSettings(s);
    const telegramDispatchers = Array.isArray(s.telegram_dispatchers) ? s.telegram_dispatchers : [];
    const fallbackMs = s.fallback_claim_timeout_ms ?? FALLBACK_CLAIM_TIMEOUT_MS;
    const paymentLinksRaw = s.payment_links && typeof s.payment_links === "object" ? s.payment_links : {};
    const paymentDisplayRaw = s.payment_display && typeof s.payment_display === "object" ? s.payment_display : {};
    res.json({
      ...pricing,
      testMode: s.test_mode,
      backgroundMusicEnabled: s.background_music_enabled !== false,
      telegramDispatchers,
      fallbackClaimTimeoutMs: fallbackMs,
      paymentLinks: {
        venmo: paymentLinksRaw.venmo ?? "",
        cashApp: normalizeCashAppPaymentValue("cashApp", paymentLinksRaw.cashApp ?? ""),
        paypal: paymentLinksRaw.paypal ?? "",
        zelle: paymentLinksRaw.zelle ?? "",
        applePay: paymentLinksRaw.applePay ?? "",
      },
      paymentDisplay: {
        venmo: paymentDisplayRaw.venmo ?? "",
        cashApp: normalizeCashAppPaymentValue("cashApp", paymentDisplayRaw.cashApp ?? ""),
        paypal: paymentDisplayRaw.paypal ?? "",
        zelle: paymentDisplayRaw.zelle ?? "",
        applePay: paymentDisplayRaw.applePay ?? "",
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch("/api/admin/settings", authMiddleware, async (req, res) => {
  const body = req.body;
  try {
    const updates = {};
    if (body.plateOnlyPrice != null) updates.plate_only_price = parseFloat(body.plateOnlyPrice);
    if (body.insuranceOnlyPrice != null) updates.insurance_only_price = parseFloat(body.insuranceOnlyPrice);
    if (body.plateAndInsurancePrice != null) updates.plate_and_insurance_price = parseFloat(body.plateAndInsurancePrice);
    if (body.insuranceMonthlyPrice != null) updates.insurance_monthly_price = parseFloat(body.insuranceMonthlyPrice);
    if (body.insuranceYearlyPrice != null) updates.insurance_yearly_price = parseFloat(body.insuranceYearlyPrice);
    if (body.overnightFedexFee != null) updates.overnight_fedex_fee = parseFloat(body.overnightFedexFee);
    if (body.driverExtendedFee != null) updates.driver_extended_fee = parseFloat(body.driverExtendedFee);
    if (body.driverLocalStates != null) {
      updates.driver_local_states = parseDriverLocalStatesSetting(body.driverLocalStates);
    }
    if (body.fallbackClaimTimeoutMs != null) {
      const v = parseInt(String(body.fallbackClaimTimeoutMs), 10);
      if (!isNaN(v) && v > 0) updates.fallback_claim_timeout_ms = v;
    }
    if (body.testMode != null) updates.test_mode = !!body.testMode;
    if (body.backgroundMusicEnabled != null) {
      updates.background_music_enabled = !!body.backgroundMusicEnabled;
    }
    if (body.paymentLinks != null && typeof body.paymentLinks === "object") {
      updates.payment_links = {
        venmo: String(body.paymentLinks.venmo ?? "").trim(),
        cashApp: normalizeCashAppPaymentValue(
          "cashApp",
          String(body.paymentLinks.cashApp ?? "").trim(),
        ),
        paypal: String(body.paymentLinks.paypal ?? "").trim(),
        zelle: String(body.paymentLinks.zelle ?? "").trim(),
        applePay: String(body.paymentLinks.applePay ?? "").trim(),
      };
    }
    if (body.paymentDisplay != null && typeof body.paymentDisplay === "object") {
      updates.payment_display = {
        venmo: String(body.paymentDisplay.venmo ?? "").trim(),
        cashApp: normalizeCashAppPaymentValue(
          "cashApp",
          String(body.paymentDisplay.cashApp ?? "").trim(),
        ),
        paypal: String(body.paymentDisplay.paypal ?? "").trim(),
        zelle: String(body.paymentDisplay.zelle ?? "").trim(),
        applePay: String(body.paymentDisplay.applePay ?? "").trim(),
      };
    }
    if (Array.isArray(body.telegramDispatchers)) {
      updates.telegram_dispatchers = body.telegramDispatchers.map((d) => {
        const groupId = canonicalChatId(d.groupId);
        return {
          dispatcherId: canonicalChatId(d.dispatcherId),
          groupId,
          groupName: String(d.groupName || "").trim() || (groupId ? `Group ${groupId.slice(-4)}` : ""),
        };
      });
    }
    await saveSettings(updates);
    const s = await loadSettings();
    const pricing = checkoutConfigFromSettings(s);
    const telegramDispatchers = Array.isArray(s.telegram_dispatchers) ? s.telegram_dispatchers : [];
    const fallbackMs = s.fallback_claim_timeout_ms ?? FALLBACK_CLAIM_TIMEOUT_MS;
    const paymentLinks = s.payment_links && typeof s.payment_links === "object" ? s.payment_links : {};
    const paymentDisplay = s.payment_display && typeof s.payment_display === "object" ? s.payment_display : {};
    res.json({
      ...pricing,
      testMode: s.test_mode,
      backgroundMusicEnabled: s.background_music_enabled !== false,
      telegramDispatchers,
      fallbackClaimTimeoutMs: fallbackMs,
      paymentLinks: {
        venmo: paymentLinks.venmo ?? "",
        cashApp: paymentLinks.cashApp ?? "",
        paypal: paymentLinks.paypal ?? "",
        zelle: paymentLinks.zelle ?? "",
        applePay: paymentLinks.applePay ?? "",
      },
      paymentDisplay: {
        venmo: paymentDisplay.venmo ?? "",
        cashApp: paymentDisplay.cashApp ?? "",
        paypal: paymentDisplay.paypal ?? "",
        zelle: paymentDisplay.zelle ?? "",
        applePay: paymentDisplay.applePay ?? "",
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Inspect the current Telegram webhook (URL, pending updates, last error).
// Lets the admin verify the bot is correctly wired up without using curl.
app.get("/api/admin/telegram/webhook", authMiddleware, async (req, res) => {
  if (!TELEGRAM_BOT_TOKEN) return res.status(400).json({ error: "TELEGRAM_BOT_TOKEN not set on server" });
  try {
    const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) {
      return res.status(502).json({ error: data?.description || "Telegram getWebhookInfo failed" });
    }
    const expectedUrl = telegramWebhookUrl(req);
    res.json({
      info: data.result,
      expectedUrl,
      apiPublicUrl: API_PUBLIC_URL || null,
      webhookMatches: (data.result?.url || "") === expectedUrl,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Register the Telegram webhook to a specific URL, or default to the current
// request's host. Use this immediately after a domain or hosting change so
// dispatcher Accept buttons start delivering callbacks again.
app.post("/api/admin/telegram/webhook", authMiddleware, async (req, res) => {
  if (!TELEGRAM_BOT_TOKEN) return res.status(400).json({ error: "TELEGRAM_BOT_TOKEN not set on server" });
  const inputUrl = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  const url = inputUrl || telegramWebhookUrl(req);
  try {
    const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, allowed_updates: ["callback_query"], drop_pending_updates: false }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) {
      const msg = data?.description || "Telegram setWebhook failed";
      console.error("[Telegram] setWebhook HTTP", r.status, "url=", url, "telegram=", JSON.stringify(data));
      return res.status(502).json({ error: msg, url });
    }
    res.json({ ok: true, url, description: data.description || "Webhook set." });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/admin/stats", authMiddleware, async (req, res) => {
  try {
    const orders = await loadOrders();
    const ordersApi = useSupabase() ? orders.map(orderRowToApi) : orders;
    const activity = await loadActivity();
    const totalPayments = ordersApi.reduce((s, o) => s + normalizeOrderPrice(o.price), 0);
    res.json({
      ordersCount: ordersApi.length,
      totalPayments,
      dataStored: ordersApi.length,
      dataIn: activity.dataIn || [],
      dataOut: activity.dataOut || [],
      payments: activity.payments || [],
      telegramConfigured: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_IDS.length > 0),
      telegramRecipients: TELEGRAM_CHAT_IDS,
      ordersWithTelegramStatus: ordersApi.map((o) => ({
        id: o.id,
        serviceTitle: o.serviceTitle,
        price: o.price,
        createdAt: o.createdAt,
        telegramSent: o.telegramSent,
        telegramRecipients: o.telegramRecipients || [],
        telegramErrors: o.telegramErrors || [],
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Serve static frontend + SPA fallback (for Render single-service deploy)
const distPath = existsSync(join(process.cwd(), "dist"))
  ? join(process.cwd(), "dist")
  : join(__dirname, "..", "dist");
if (existsSync(distPath)) {
  app.use(express.static(distPath, { fallthrough: true }));
  app.get(/^\/(?!api\/)/, (req, res, next) => {
    res.sendFile(join(distPath, "index.html"), (err) => {
      if (err) next(err);
    });
  });
}

const PORT = parseInt(process.env.PORT || "3001", 10);
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${server.address().port}`);
  if (!ADMIN_PASSWORD) console.warn("WARNING: ADMIN_PASSWORD not set");
  if (!STRIPE_SECRET_KEY) console.warn("WARNING: STRIPE_SECRET_KEY not set - checkout will fail");
  if (!STRIPE_WEBHOOK_SECRET) {
    console.warn(
      "WARNING: STRIPE_WEBHOOK_SECRET not set — paid orders WILL be lost if the customer never returns to the success page",
    );
  } else {
    console.log("Stripe webhook listening at /api/stripe/webhook");
  }
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_IDS.length) console.warn("WARNING: Telegram not configured");
  if (!resend) console.warn("WARNING: RESEND_API_KEY not set — order completion emails will not send");
  else {
    console.log("Resend configured (customer):", FROM_EMAIL);
    console.log("Resend configured (lead notifications):", RESEND_FROM_EMAIL);
    if (LEAD_NOTIFICATION_EMAILS.length > 0) {
      console.log(
        `Lead email notifications go to ${LEAD_NOTIFICATION_EMAILS.length} recipient(s):`,
        LEAD_NOTIFICATION_EMAILS.join(", "),
      );
    } else {
      console.warn("WARNING: LEAD_NOTIFICATION_EMAILS empty — new leads won't be emailed");
    }
  }
  if (LEAD_NOTIFICATION_TELEGRAM_IDS.length > 0) {
    console.log(
      `Lead Telegram notifications go to ${LEAD_NOTIFICATION_TELEGRAM_IDS.length} chat(s):`,
      LEAD_NOTIFICATION_TELEGRAM_IDS.join(", "),
    );
  } else {
    console.warn("WARNING: LEAD_NOTIFICATION_TELEGRAM_IDS empty — new leads won't be DMed");
  }
  if (useSupabase()) console.log("Using Supabase"); else console.log("Using file storage");
  void ensureTelegramWebhookOnStartup();
  // Safety net: reconcile paid-but-pending Stripe orders even if the webhook is
  // down/misconfigured or the customer never returns to the success page.
  if (stripe) {
    setTimeout(() => void reconcilePendingStripeOrders(), 20000);
    setInterval(() => void reconcilePendingStripeOrders(), 3 * 60 * 1000);
    console.log("[reconcile] Stripe pending-order sweep active (every 3 min)");
  }
  // Abandoned-cart reminder sweep (1h + weekly nudges). Independent of Stripe.
  if (ABANDONED_CART_EMAILS_ENABLED && resend) {
    setTimeout(() => void sweepAbandonedCarts(), 45000);
    setInterval(() => void sweepAbandonedCarts(), 15 * 60 * 1000);
    console.log("[AbandonedCart] follow-up sweep active (every 15 min)");
  } else {
    console.log("[AbandonedCart] disabled (set RESEND_API_KEY + ABANDONED_CART_EMAILS != 0 to enable)");
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") console.error(`Port ${PORT} in use`);
  process.exit(1);
});
