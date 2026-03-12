import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import jwt from "jsonwebtoken";
import Stripe from "stripe";
import { Resend } from "resend";
import { supabase, useSupabase } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
const DOCS_DIR = join(DATA_DIR, "order-docs");
const SERVICES_FILE = join(DATA_DIR, "services.json");
const ORDERS_FILE = join(DATA_DIR, "orders.json");
const ACTIVITY_FILE = join(DATA_DIR, "activity.json");
const SETTINGS_FILE = join(DATA_DIR, "settings.json");

const defaultSettings = {
  insurance_monthly_price: 100,
  insurance_yearly_price: 900,
  test_mode: false,
  overnight_fedex_fee: 50,
};

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET || "tristatetags-secret-change-in-production";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const APP_URLS = (process.env.APP_URL || process.env.VITE_APP_URL || "http://localhost:8080")
  .split(",")
  .map((u) => u.trim().replace(/\/$/, ""))
  .filter(Boolean);
const APP_URL = APP_URLS[0] || "http://localhost:8080";
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
const ONETIMESECRET_REGION = process.env.ONETIMESECRET_REGION || "us";
const OTS_DISPATCH_PASSPHRASE = "DispatchPassword";
// Fallback assignment: if nobody accepts in time, auto-assign to this chat/group
// Defaults match requested values; can be overridden in Render env vars.
const FALLBACK_DISPATCHER_ID = process.env.FALLBACK_DISPATCHER_ID || "-1003741637507";
const FALLBACK_GROUP_ID = process.env.FALLBACK_GROUP_ID || "-1003741637507";
const FALLBACK_GROUP_NAME = process.env.FALLBACK_GROUP_NAME || "Tatiana's Team";
const FALLBACK_CLAIM_TIMEOUT_MS = parseInt(process.env.FALLBACK_CLAIM_TIMEOUT_MS || "45000", 10);

function parseTelegramDispatchers(str) {
  if (!str || typeof str !== "string") return [];
  return str.split(",").map((pair) => {
    const parts = pair.trim().split(":").map((s) => s.trim());
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
        dispatcherId: String(d?.dispatcherId || "").trim(),
        groupId: String(d?.groupId || "").trim(),
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
      dispatcherId: chatId,
      groupId: chatId,
      groupName: `Chat ${String(chatId).slice(-6)}`,
    }));
  }
  return [];
}
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || "TriState Tags <onboarding@resend.dev>"; // Use verified domain (see DEPLOY.md)

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
if (!existsSync(DOCS_DIR)) mkdirSync(DOCS_DIR, { recursive: true });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
    const { error } = await supabase.from("orders").insert(row);
    if (error) throw error;
    return;
  }
  const orders = loadJson(ORDERS_FILE, []);
  orders.push(order);
  saveJson(ORDERS_FILE, orders);
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
  if (Array.isArray(val)) return val.map((d) => ({
    dispatcherId: String(d.dispatcherId ?? d.dispatcher_id ?? "").trim(),
    groupId: String(d.groupId ?? d.group_id ?? "").trim(),
    groupName: String(d.groupName ?? d.group_name ?? "").trim() || (d.groupId || d.group_id ? `Group ${String(d.groupId || d.group_id).slice(-4)}` : ""),
  }));
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
      else if (["insurance_monthly_price", "insurance_yearly_price", "overnight_fedex_fee"].includes(r.key))
        out[r.key] = typeof r.value === "number" ? r.value : parseFloat(r.value) || out[r.key];
      else if (r.key === "telegram_dispatchers") out.telegram_dispatchers = normalizeDispatchers(r.value);
    });
    return out;
  }
  const s = loadJson(SETTINGS_FILE, defaultSettings);
  const out = { ...defaultSettings, ...s };
  out.telegram_dispatchers = normalizeDispatchers(out.telegram_dispatchers);
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
    if (updates.docDriversLicense != null) row.doc_drivers_license = updates.docDriversLicense;
    if (updates.docInsuranceCard != null) row.doc_insurance_card = updates.docInsuranceCard;
    if (updates.docVinPhoto != null) row.doc_vin_photo = updates.docVinPhoto;
    if (updates.successEmailSent != null) row.success_email_sent = updates.successEmailSent;
    if (updates.telegramAcceptedBy != null) row.telegram_accepted_by = updates.telegramAcceptedBy;
    if (updates.telegramAcceptedGroupId != null) row.telegram_accepted_group_id = updates.telegramAcceptedGroupId;
    if (updates.telegramClaimMessageIds != null) row.telegram_claim_message_ids = typeof updates.telegramClaimMessageIds === "string" ? updates.telegramClaimMessageIds : JSON.stringify(updates.telegramClaimMessageIds || {});
    if (Object.keys(row).length === 0) return;
    const { error } = await supabase.from("orders").update(row).eq("id", id);
    if (error) throw error;
    return;
  }
  const orders = loadJson(ORDERS_FILE, []);
  const idx = orders.findIndex((o) => o.id === id);
  if (idx < 0) throw new Error("Order not found");
  Object.assign(orders[idx], {
    firstName: updates.firstName ?? orders[idx].firstName,
    lastName: updates.lastName ?? orders[idx].lastName,
    phone: updates.phone ?? orders[idx].phone,
    address: updates.address ?? orders[idx].address,
    vin: updates.vin ?? orders[idx].vin,
    vehicleInfo: updates.vehicleInfo ?? orders[idx].vehicleInfo,
    year: updates.year ?? orders[idx].year,
    make: updates.make ?? orders[idx].make,
    model: updates.model ?? orders[idx].model,
    carMakeModel: updates.carMakeModel ?? orders[idx].carMakeModel,
    color: updates.color ?? orders[idx].color,
    insuranceCompany: updates.insuranceCompany ?? orders[idx].insuranceCompany,
    policyNumber: updates.policyNumber ?? orders[idx].policyNumber,
    notes: updates.notes ?? orders[idx].notes,
    docDriversLicense: updates.docDriversLicense ?? orders[idx].docDriversLicense,
    docInsuranceCard: updates.docInsuranceCard ?? orders[idx].docInsuranceCard,
    docVinPhoto: updates.docVinPhoto ?? orders[idx].docVinPhoto,
    successEmailSent: updates.successEmailSent ?? orders[idx].successEmailSent,
    telegramAcceptedBy: updates.telegramAcceptedBy ?? orders[idx].telegramAcceptedBy,
    telegramAcceptedGroupId: updates.telegramAcceptedGroupId ?? orders[idx].telegramAcceptedGroupId,
    telegramClaimMessageIds: updates.telegramClaimMessageIds ?? orders[idx].telegramClaimMessageIds,
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

// Map Supabase rows to API shape
function orderRowToApi(row) {
  if (!row) return row;
  if (row.serviceId) return row;
  return {
    id: row.id,
    serviceId: row.service_id,
    serviceTitle: row.service_title,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    address: row.address,
    deliveryAddress: row.delivery_address,
    vin: row.vin,
    carMakeModel: row.car_make_model,
    color: row.color,
    year: row.year,
    make: row.make,
    model: row.model,
    price: parseFloat(row.price),
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
    vehicleInfo: row.vehicle_info,
    insuranceCompany: row.insurance_company,
    policyNumber: row.policy_number,
    notes: row.notes,
    docDriversLicense: row.doc_drivers_license,
    docInsuranceCard: row.doc_insurance_card,
    docVinPhoto: row.doc_vin_photo,
    telegramAcceptedBy: row.telegram_accepted_by,
    telegramAcceptedGroupId: row.telegram_accepted_group_id,
    telegramClaimMessageIds: typeof row.telegram_claim_message_ids === "string" ? JSON.parse(row.telegram_claim_message_ids || "{}") : (row.telegram_claim_message_ids || {}),
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

async function createOneTimeSecretLink(secret) {
  if (!ONETIMESECRET_USERNAME || !ONETIMESECRET_API_KEY || !secret) return null;
  const region = ONETIMESECRET_REGION || "us";
  const auth = Buffer.from(`${ONETIMESECRET_USERNAME}:${ONETIMESECRET_API_KEY}`).toString("base64");
  try {
    const body = new URLSearchParams({
      secret: String(secret).trim(),
      ttl: "86400",
      passphrase: OTS_DISPATCH_PASSPHRASE,
    });
    const r = await fetch(`https://${region}.onetimesecret.com/api/v1/share`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const data = await r.json();
    if (data.secret_key) return `https://${region}.onetimesecret.com/secret/${data.secret_key}`;
    console.warn("[OTS] Create failed:", data);
    return null;
  } catch (err) {
    console.error("[OTS] Error:", err.message);
    return null;
  }
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
  const deliveryMethodLabel = o.deliveryMethod === "overnight_fedex"
    ? "FedEx Delivery"
    : o.deliveryMethod === "driver"
      ? "Driver Delivery"
      : "Email Delivery";
  const lines = [
    "<b>Delivery method:</b> " + deliveryMethodLabel,
    o.deliveryEmail ? "<b>Delivery email:</b> " + escapeTelegramHtml(o.deliveryEmail) : null,
    "",
    "<b>Name:</b> " + name,
    "<b>Registration address:</b> " + (addressStreet || "—"),
    "<b>Registration city, state, ZIP:</b> " + (addressCityStateZip || "—"),
    "<b>Delivery address:</b> " + (deliveryStreet || "—"),
    "<b>Delivery city, state, ZIP:</b> " + (deliveryCityStateZip || "—"),
    "<b>VIN:</b> " + escapeTelegramHtml(o.vin || "—"),
    "<b>Car:</b> " + car,
    "<b>Color:</b> " + escapeTelegramHtml(o.color || "—"),
    "<b>Insurance company:</b> " + escapeTelegramHtml(o.insuranceCompany || "—"),
    "<b>Insurance policy number:</b> " + escapeTelegramHtml(o.policyNumber || "—"),
    "<b>Extra info:</b> " + escapeTelegramHtml(o.notes || "—"),
  ];
  if (phoneLink) lines.push("", "<b>📞 Phone (one-time link):</b> " + escapeTelegramHtml(phoneLink));
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

async function editTelegramMessage(chatId, messageId, text) {
  if (!TELEGRAM_BOT_TOKEN) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" }),
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

async function sendClaimMessageToDispatcher(dispatcherChatId, orderId, order) {
  if (!TELEGRAM_BOT_TOKEN) return { ok: false, messageId: null };
  const deliveryEmail = (order?.deliveryEmail || order?.delivery_email || "").trim();
  const summary = [
    "🆕 <b>New Order – Accept to Claim</b>",
    `Order #${(orderId || "").slice(0, 8)}`,
    `• ${(order?.firstName || "")} ${(order?.lastName || "")}`.trim() || "—",
    `• ${order?.vin || "—"} | ${order?.carMakeModel || order?.vehicleInfo || "—"}`,
    deliveryEmail ? `• Email: ${deliveryEmail}` : null,
    "",
    "Tap <b>Accept</b> to receive full details in your group.",
  ].join("\n");
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

async function sendDocImagesToTelegram(order) {
  if (!TELEGRAM_BOT_TOKEN) return [];
  const acceptedGroup = order?.telegramAcceptedGroupId || order?.telegram_accepted_group_id;
  const targetIds = acceptedGroup
    ? [acceptedGroup]
    : TELEGRAM_CHAT_IDS;
  if (targetIds.length === 0) return [];
  const urls = [];
  if (order.docDriversLicense) urls.push({ url: order.docDriversLicense, caption: "Drivers License" });
  if (order.docInsuranceCard) urls.push({ url: order.docInsuranceCard, caption: "Insurance Card" });
  if (order.docVinPhoto) urls.push({ url: order.docVinPhoto, caption: "VIN Photo" });
  for (const { url, caption } of urls) {
    const isPdf = String(url || "").toLowerCase().includes(".pdf");
    for (const chatId of targetIds) {
      try {
        if (isPdf) {
          await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, document: url, caption }),
          });
        } else {
          await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, photo: url, caption }),
          });
        }
      } catch (err) {
        console.error("Telegram send media error:", err);
      }
    }
  }
}

function buildSuccessEmailHtml(order) {
  const firstName = order.firstName || "Customer";
  const appUrl = APP_URL.replace(/\/$/, "");
  const isEmailDelivery = order.deliveryMethod === "email";
  const deliveryText = isEmailDelivery
    ? "Your temporary tag package has been processed and will be delivered to your email shortly. Check your inbox for your temp tag, registration, and insurance card."
    : order.deliveryMethod === "overnight_fedex"
      ? "Your order is confirmed. We'll ship your temp tag via FedEx delivery next business day."
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

function formatOrderMessage(order) {
  const vehicle = (order.year && order.make && order.model)
    ? `${order.year} ${order.make} ${order.model}` + (order.color ? `, ${order.color}` : "")
    : order.vehicleInfo;
  const source = process.env.BOLDY_SOURCE || "tristatetags";
  const lines = [
    "<b>🆕 New Order</b>",
    `<b>Source:</b> ${source}`,
    "",
    `<b>Order ID:</b> ${order.id}`,
    `<b>Product:</b> ${order.serviceTitle} — $${(order.price || 0).toFixed(2)}`,
    "",
    "<b>Delivery:</b>",
    `• Method: ${order.deliveryMethod === "overnight_fedex" ? "FedEx Delivery" : order.deliveryMethod === "driver" ? "Driver" : (order.deliveryMethod || "Email")}`,
    order.deliveryEmail ? `• Email: ${order.deliveryEmail}` : null,
    order.deliveryAddress ? `• Address: ${order.deliveryAddress}` : null,
    order.deliverySlot ? `• Slot: ${order.deliverySlot}` : null,
    order.deliveryScheduledAt ? `• Scheduled: ${order.deliveryScheduledAt}` : null,
    order.deliveryPhone ? `• Phone: ${order.deliveryPhone}` : null,
    "",
    "<b>Customer / Tag Info:</b>",
    `• ${order.firstName || ""} ${order.lastName || ""}`.trim() || "—",
    order.phone ? `• Phone: ${order.phone}` : null,
    order.address ? `• Address: ${order.address}` : null,
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

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// Health check (no DB/Telegram - always 200)
app.get("/api/health", (req, res) => res.json({ ok: true }));

// Telegram webhook (for dispatcher Accept/Decline button callbacks)
app.post("/api/telegram/webhook", async (req, res) => {
  res.status(200).send("");
  const upd = req.body;
  const cq = upd?.callback_query;
  if (!cq?.data) return;
  const fromMessageId = cq.message?.message_id;
  const fromChatId = String(cq.message?.chat?.id || "");

  if (cq.data.startsWith("decline_")) {
    if (fromMessageId) await editTelegramMessage(fromChatId, fromMessageId, "❌ You declined this order.");
    answerCallback(cq.id, "Declined");
    return;
  }
  if (!cq.data.startsWith("accept_")) return;
  const orderId = cq.data.replace(/^accept_/, "").trim();
  if (!orderId) return;

  try {
    const orderRow = await findOrderById(orderId);
    if (!orderRow) return answerCallback(cq.id, "Order not found");
    const order = useSupabase() ? orderRowToApi(orderRow) : orderRow;
    const claimIds = typeof order.telegramClaimMessageIds === "object" ? order.telegramClaimMessageIds : (order.telegram_claim_message_ids && typeof order.telegram_claim_message_ids === "string" ? JSON.parse(order.telegram_claim_message_ids || "{}") : {});

    const dispatchers = await loadDispatchers();
    const dispatcher = dispatchers.find((d) => d.dispatcherId === fromChatId || d.groupId === fromChatId);
    if (!dispatcher) return answerCallback(cq.id, "Unknown dispatcher");
    const acceptGroupId = dispatcher.groupId || fromChatId;

    const alreadyAccepted = order.telegramAcceptedBy || order.telegram_accepted_by;
    if (alreadyAccepted) {
      if (fromMessageId) await editTelegramMessage(fromChatId, fromMessageId, "❌ This tag was taken by another team.");
      return answerCallback(cq.id, "Already claimed");
    }

    const won = await tryAcceptOrder(orderId, fromChatId, acceptGroupId);
    if (!won) {
      if (fromMessageId) await editTelegramMessage(fromChatId, fromMessageId, "❌ This tag was taken by another team.");
      return answerCallback(cq.id, "Already claimed");
    }

    const phoneLink = await createOneTimeSecretLink(order.phone || "");
    const fullOrder = { ...order, deliveryAddress: order.deliveryAddress || order.delivery_address || "" };
    const dispatchText = formatDispatchMessage(fullOrder, phoneLink);
    await sendToTelegram(dispatchText, [acceptGroupId]);

    const updatedOrder = await findOrderById(orderId);
    const full = useSupabase() ? orderRowToApi(updatedOrder) : updatedOrder;
    Object.assign(full, fullOrder);
    await sendDocImagesToTelegram(full);

    for (const [chatId, mid] of Object.entries(claimIds || {})) {
      if (!mid) continue;
      if (String(chatId) === String(fromChatId)) continue;
      await editTelegramMessage(chatId, mid, "❌ This tag was taken by another team.");
    }

    answerCallback(cq.id, "✅ Order claimed! Details sent to your group.");
  } catch (err) {
    console.error("[Telegram webhook] Error:", err);
    answerCallback(cq.id, "Error processing accept");
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

async function tryAcceptOrder(orderId, acceptorsChatId, groupChatId) {
  if (useSupabase()) {
    const { data, error } = await supabase.from("orders").update({
      telegram_accepted_by: acceptorsChatId,
      telegram_accepted_group_id: groupChatId,
    }).eq("id", orderId).is("telegram_accepted_by", null).select("id");
    return !error && data && data.length > 0;
  }
  const orders = loadJson(ORDERS_FILE, []);
  const idx = orders.findIndex((o) => o.id === orderId && !o.telegramAcceptedBy);
  if (idx < 0) return false;
  orders[idx].telegramAcceptedBy = acceptorsChatId;
  orders[idx].telegramAcceptedGroupId = groupChatId;
  saveJson(ORDERS_FILE, orders);
  return true;
}

async function completeOrderDispatch(orderId, groupChatId, claimIds, dispatchers, skipChatId = null) {
  const orderRow = await findOrderById(orderId);
  if (!orderRow) return;
  const order = useSupabase() ? orderRowToApi(orderRow) : orderRow;
  const fullOrder = { ...order, deliveryAddress: order.deliveryAddress || order.delivery_address || "" };
  const phoneLink = await createOneTimeSecretLink(order.phone || "");
  const dispatchText = formatDispatchMessage(fullOrder, phoneLink);
  await sendToTelegram(dispatchText, [groupChatId]);
  const full = useSupabase() ? orderRowToApi(orderRow) : orderRow;
  Object.assign(full, fullOrder);
  await sendDocImagesToTelegram(full);
  for (const [chatId, mid] of Object.entries(claimIds || {})) {
    if (!mid) continue;
    if (skipChatId && String(chatId) === String(skipChatId)) continue;
    await editTelegramMessage(chatId, mid, "❌ This tag was taken by another team.");
  }
}

function scheduleAutoAssignFallback(orderId, claimMessageIds, dispatchers) {
  if (!FALLBACK_DISPATCHER_ID || !FALLBACK_GROUP_ID || !TELEGRAM_BOT_TOKEN) return;
  const delay = Math.max(1000, FALLBACK_CLAIM_TIMEOUT_MS);
  setTimeout(async () => {
    try {
      const orderRow = await findOrderById(orderId);
      if (!orderRow) return;
      const order = useSupabase() ? orderRowToApi(orderRow) : orderRow;
      if (order.telegramAcceptedBy || order.telegram_accepted_by) return;
      const won = await tryAcceptOrder(orderId, FALLBACK_DISPATCHER_ID, FALLBACK_GROUP_ID);
      if (!won) return;
      await completeOrderDispatch(orderId, FALLBACK_GROUP_ID, claimMessageIds, dispatchers, null);
      // Remove claim messages from everyone else to prevent “stealing”
      for (const [chatId, mid] of Object.entries(claimMessageIds || {})) {
        if (!mid) continue;
        const ok = await deleteTelegramMessage(chatId, mid);
        if (!ok) await editTelegramMessage(chatId, mid, "❌ This tag was taken by another team.");
      }
      console.log(`[Dispatcher] Order ${orderId.slice(0, 8)} auto-assigned to fallback after ${delay / 1000}s`);
    } catch (err) {
      console.error("[Dispatcher] Auto-assign fallback error:", err);
    }
  }, delay);
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

// Public: Services
app.get("/api/services", async (req, res) => {
  try {
    const data = await loadServices();
    res.json(useSupabase() ? data.map(serviceRowToApi) : data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Public: Checkout config (tag price from first service, insurance from settings, test mode)
app.get("/api/checkout/config", async (req, res) => {
  try {
    const [s, services] = await Promise.all([loadSettings(), loadServices()]);
    const firstService = services[0];
    const tagPrice = firstService ? (parseFloat(firstService.price) || 150) : 150;
    res.json({
      tagPrice,
      insuranceMonthlyPrice: s.insurance_monthly_price,
      insuranceYearlyPrice: s.insurance_yearly_price,
      overnightFedexFee: s.overnight_fedex_fee ?? 50,
      testMode: s.test_mode,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stripe Checkout: create session and redirect to payment (or test URL if test mode)
app.post("/api/checkout/create-session", async (req, res) => {
  const body = req.body;
  if ((body.deliveryMethod === "email" || !body.deliveryMethod) && (!body.deliveryEmail || !String(body.deliveryEmail).includes("@"))) {
    return res.status(400).json({ error: "Delivery email is required for email delivery." });
  }
  const amount = parseFloat(body.amount);
  if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: "Invalid amount" });
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

  const settings = await loadSettings();
  if (settings.test_mode) {
    const fakeSessionId = "test_" + randomUUID();
    const url = `${baseUrl}/checkout/tag-info?session_id=${fakeSessionId}&test=1`;
    const meta = {
      deliveryMethod: body.deliveryMethod,
      deliveryEmail: body.deliveryEmail || "",
      deliverySlot: body.deliverySlot || "",
      deliveryScheduledAt: body.deliveryScheduledAt || "",
      deliveryAddress: body.deliveryAddress || "",
      deliveryPhone: body.deliveryPhone || "",
      productChoice: body.productChoice,
      serviceId: body.serviceId || "checkout",
      serviceTitle: body.serviceTitle || (body.productChoice === "tag_only" ? "Temporary Tag" : "Tag + Insurance"),
      amount: String(amount),
    };
    const order = {
      id: randomUUID(),
      serviceId: meta.serviceId,
      serviceTitle: meta.serviceTitle,
      firstName: "Pending",
      lastName: "",
      phone: body.deliveryPhone || "",
      address: body.deliveryAddress || "",
      deliveryAddress: body.deliveryAddress || "",
      vin: "",
      carMakeModel: "",
      color: "",
      price: amount,
      createdAt: new Date().toISOString(),
      stripeSessionId: fakeSessionId,
      paymentStatus: "paid",
      deliveryMethod: meta.deliveryMethod,
      deliveryEmail: meta.deliveryEmail,
      deliverySlot: meta.deliverySlot,
      deliveryScheduledAt: meta.deliveryScheduledAt,
      deliveryPhone: meta.deliveryPhone,
      productChoice: meta.productChoice,
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
      line_items: [{ price_data: { currency: "usd", unit_amount: Math.round(amount * 100), product_data: { name: "Temporary Tag", description: "NJ temp tag" } }, quantity: 1 }],
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
        serviceTitle: String(body.serviceTitle || "").slice(0, 100),
        amount: String(amount),
      },
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error("Stripe create-session error:", e);
    res.status(500).json({ error: e.message || "Failed to create checkout session" });
  }
});

// Verify Stripe payment and create order (server-side verification)
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
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") return res.status(400).json({ error: "Payment not completed", paymentStatus: session.payment_status });

    const meta = session.metadata || {};
    const existing = await findOrderByStripeSessionId(sessionId);
    if (existing) return res.json(useSupabase() ? orderRowToApi(existing) : existing);

    const serviceTitle = meta.serviceTitle || (meta.productChoice === "insurance_monthly" ? "Tag + Insurance (Monthly)" : meta.productChoice === "insurance_yearly" ? "Tag + Insurance (Yearly)" : "Temporary Tag");
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
      price: (session.amount_total || 0) / 100,
      createdAt: new Date().toISOString(),
      stripeSessionId: sessionId,
      paymentStatus: "paid",
      deliveryMethod: meta.deliveryMethod,
      deliveryEmail: meta.deliveryEmail,
      deliverySlot: meta.deliverySlot,
      deliveryScheduledAt: meta.deliveryScheduledAt,
      deliveryPhone: meta.deliveryPhone,
      productChoice: meta.productChoice,
      telegramSent: false,
      telegramRecipients: [],
      telegramErrors: [],
    };
    await appendActivity("dataIn", { type: "order", orderId: order.id, serviceTitle: order.serviceTitle, price: order.price, stripeSessionId: sessionId });
    await appendActivity("payments", { type: "order", orderId: order.id, amount: order.price, status: "paid", stripeSessionId: sessionId });
    await saveOrder(order);
    res.json(order);
  } catch (e) {
    console.error("Stripe verify error:", e);
    res.status(500).json({ error: e.message || "Failed to verify payment" });
  }
});

// Submit tag info after payment
app.patch("/api/orders/:id/tag-info", async (req, res) => {
  const { id } = req.params;
  const body = req.body;
  try {
    const order = await findOrderById(id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const o = useSupabase() ? orderRowToApi(order) : order;
    if (o.paymentStatus !== "paid") return res.status(400).json({ error: "Order not paid" });

    const vehicleInfo = body.vehicleInfo || (body.year && body.make && body.model && body.color
      ? `${body.year} ${body.make} ${body.model}, ${body.color}` : body.vehicleInfo);
    const carMakeModel = body.year && body.make && body.model
      ? `${body.year} ${body.make} ${body.model}` : (body.vehicleInfo?.split(",")[0] || "");

    await updateOrder(id, {
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      address: body.address,
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

    const updated = await findOrderById(id);
    const full = useSupabase() ? { ...orderRowToApi(updated), ...body, vehicleInfo, carMakeModel } : { ...updated, ...body, vehicleInfo, carMakeModel };
    full.deliveryAddress = full.deliveryAddress || full.delivery_address || "";

    let telegramSent = false;
    let telegramRecipients = [];
    let telegramErrors = [];
    let claimMessageIds = {};

    const dispatchers = await loadDispatchers();
    if (dispatchers.length > 0 && TELEGRAM_BOT_TOKEN) {
      for (const d of dispatchers) {
        // Always send claim to the dispatcher GROUP (bots can reliably post in groups),
        // and best-effort to the personal chat if provided.
        const groupRes = await sendClaimMessageToDispatcher(d.groupId, id, full);
        if (groupRes.ok && groupRes.messageId) claimMessageIds[d.groupId] = groupRes.messageId;
        if (groupRes.ok) telegramRecipients.push(d.groupId);
        else telegramErrors.push({ chatId: d.groupId, error: "Failed to send claim" });

        if (d.dispatcherId && String(d.dispatcherId) !== String(d.groupId)) {
          const dmRes = await sendClaimMessageToDispatcher(d.dispatcherId, id, full);
          if (dmRes.ok && dmRes.messageId) claimMessageIds[d.dispatcherId] = dmRes.messageId;
          if (dmRes.ok) telegramRecipients.push(d.dispatcherId);
          else telegramErrors.push({ chatId: d.dispatcherId, error: "Failed to send claim" });
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
async function uploadDocToStorage(orderId, type, buffer, ext) {
  if (useSupabase() && supabase) {
    await ensureOrderDocumentsBucket();
    const path = `${orderId}/${type}${ext}`;
    const { data, error } = await supabase.storage.from(ORDER_DOCUMENTS_BUCKET).upload(path, buffer, {
      contentType: ext === ".pdf" ? "application/pdf" : "image/jpeg",
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
  if (!["drivers-license", "insurance-card", "vin-photo"].includes(type)) return res.status(404).end();
  const base = `${id}_${type}`;
  for (const ext of [".jpg", ".jpeg", ".png", ".pdf"]) {
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
    res.json(useSupabase() ? data.map(orderRowToApi) : data);
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
    const [s, services] = await Promise.all([loadSettings(), loadServices()]);
    const firstService = services[0];
    const tagPrice = firstService ? (parseFloat(firstService.price) || 150) : 150;
    const telegramDispatchers = Array.isArray(s.telegram_dispatchers) ? s.telegram_dispatchers : [];
    res.json({
      tagPrice,
      insuranceMonthlyPrice: s.insurance_monthly_price,
      insuranceYearlyPrice: s.insurance_yearly_price,
      overnightFedexFee: s.overnight_fedex_fee ?? 50,
      testMode: s.test_mode,
      telegramDispatchers,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch("/api/admin/settings", authMiddleware, async (req, res) => {
  const body = req.body;
  try {
    const updates = {};
    if (body.insuranceMonthlyPrice != null) updates.insurance_monthly_price = parseFloat(body.insuranceMonthlyPrice);
    if (body.insuranceYearlyPrice != null) updates.insurance_yearly_price = parseFloat(body.insuranceYearlyPrice);
    if (body.overnightFedexFee != null) updates.overnight_fedex_fee = parseFloat(body.overnightFedexFee);
    if (body.testMode != null) updates.test_mode = !!body.testMode;
    if (Array.isArray(body.telegramDispatchers)) {
      updates.telegram_dispatchers = body.telegramDispatchers.map((d) => ({
        dispatcherId: String(d.dispatcherId || "").trim(),
        groupId: String(d.groupId || "").trim(),
        groupName: String(d.groupName || "").trim() || (d.groupId ? `Group ${String(d.groupId).slice(-4)}` : ""),
      }));
    }
    await saveSettings(updates);
    const [s, services] = await Promise.all([loadSettings(), loadServices()]);
    const firstService = services[0];
    const tagPrice = firstService ? (parseFloat(firstService.price) || 150) : 150;
    const telegramDispatchers = Array.isArray(s.telegram_dispatchers) ? s.telegram_dispatchers : [];
    res.json({
      tagPrice,
      insuranceMonthlyPrice: s.insurance_monthly_price,
      insuranceYearlyPrice: s.insurance_yearly_price,
      overnightFedexFee: s.overnight_fedex_fee ?? 50,
      testMode: s.test_mode,
      telegramDispatchers,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/admin/stats", authMiddleware, async (req, res) => {
  try {
    const orders = await loadOrders();
    const ordersApi = useSupabase() ? orders.map(orderRowToApi) : orders;
    const activity = await loadActivity();
    const totalPayments = ordersApi.reduce((s, o) => s + (o.price || parseFloat(o.price) || 0), 0);
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
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_IDS.length) console.warn("WARNING: Telegram not configured");
  if (!resend) console.warn("WARNING: RESEND_API_KEY not set — order completion emails will not send");
  else console.log("Resend configured:", FROM_EMAIL);
  if (useSupabase()) console.log("Using Supabase"); else console.log("Using file storage");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") console.error(`Port ${PORT} in use`);
  process.exit(1);
});
