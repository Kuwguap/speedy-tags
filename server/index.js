import "dotenv/config";
import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import jwt from "jsonwebtoken";
import Stripe from "stripe";
import { supabase, useSupabase } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
const SERVICES_FILE = join(DATA_DIR, "services.json");
const ORDERS_FILE = join(DATA_DIR, "orders.json");
const ACTIVITY_FILE = join(DATA_DIR, "activity.json");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET || "speedy-tags-secret-change-in-production";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || "http://localhost:8080";
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_IDS = (process.env.TELEGRAM_CHAT_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

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
      service_id: order.serviceId,
      service_title: order.serviceTitle,
      first_name: order.firstName,
      last_name: order.lastName,
      phone: order.phone,
      address: order.address,
      delivery_address: order.deliveryAddress,
      vin: order.vin,
      car_make_model: order.carMakeModel,
      color: order.color,
      price: order.price,
      created_at: order.createdAt,
      telegram_sent: order.telegramSent || false,
      telegram_recipients: JSON.stringify(order.telegramRecipients || []),
      telegram_errors: JSON.stringify(order.telegramErrors || []),
      stripe_session_id: order.stripeSessionId || null,
      payment_status: order.paymentStatus || "paid",
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
    price: parseFloat(row.price),
    createdAt: row.created_at,
    telegramSent: row.telegram_sent,
    telegramRecipients: typeof row.telegram_recipients === "string" ? JSON.parse(row.telegram_recipients || "[]") : (row.telegram_recipients || []),
    telegramErrors: typeof row.telegram_errors === "string" ? JSON.parse(row.telegram_errors || "[]") : (row.telegram_errors || []),
    stripeSessionId: row.stripe_session_id,
    paymentStatus: row.payment_status,
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

async function sendToTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_CHAT_IDS.length === 0) return [];
  const results = [];
  for (const chatId of TELEGRAM_CHAT_IDS) {
    try {
      const r = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }) }
      );
      const json = await r.json();
      results.push({ chatId, ok: json.ok === true, error: json.description || null });
    } catch (err) {
      results.push({ chatId, ok: false, error: err.message });
    }
  }
  return results;
}

function formatOrderMessage(order) {
  return [
    "<b>🆕 New Order</b>",
    "",
    `<b>Order ID:</b> ${order.id}`,
    `<b>Service:</b> ${order.serviceTitle} — $${order.price.toFixed(2)}`,
    "",
    "<b>Customer:</b>",
    `• ${order.firstName} ${order.lastName}`,
    `• ${order.phone}`,
    `• ${order.address}`,
    "",
    "<b>Delivery:</b>",
    `• ${order.deliveryAddress}`,
    "",
    "<b>Vehicle:</b>",
    `• VIN: ${order.vin}`,
    `• ${order.carMakeModel}`,
    `• Color: ${order.color}`,
  ].join("\n");
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// Health check (no DB/Telegram - always 200)
app.get("/api/health", (req, res) => res.json({ ok: true }));

// Public: Services
app.get("/api/services", async (req, res) => {
  try {
    const data = await loadServices();
    res.json(useSupabase() ? data.map(serviceRowToApi) : data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stripe Checkout: create session and redirect to payment
app.post("/api/checkout/create-session", async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe is not configured. Set STRIPE_SECRET_KEY in environment." });
  const body = req.body;
  const required = ["serviceId", "serviceTitle", "firstName", "lastName", "phone", "address", "deliveryAddress", "vin", "carMakeModel", "color", "price"];
  for (const k of required) {
    if (body[k] == null || body[k] === "") return res.status(400).json({ error: `Missing field: ${k}` });
  }
  const price = parseFloat(body.price);
  if (isNaN(price) || price <= 0) return res.status(400).json({ error: "Invalid price" });
  const baseUrl = APP_URL.replace(/\/$/, "");
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(price * 100),
            product_data: { name: body.serviceTitle, description: `Temporary tag - ${body.serviceTitle}` },
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout/${body.serviceId}`,
      customer_email: body.email || undefined,
      metadata: {
        serviceId: String(body.serviceId),
        serviceTitle: String(body.serviceTitle).slice(0, 200),
        firstName: String(body.firstName).slice(0, 100),
        lastName: String(body.lastName).slice(0, 100),
        phone: String(body.phone).slice(0, 50),
        address: String(body.address).slice(0, 200),
        deliveryAddress: String(body.deliveryAddress).slice(0, 200),
        vin: String(body.vin).slice(0, 20),
        carMakeModel: String(body.carMakeModel).slice(0, 100),
        color: String(body.color).slice(0, 30),
      },
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error("Stripe create-session error:", e);
    res.status(500).json({ error: e.message || "Failed to create checkout session" });
  }
});

// Verify Stripe payment and create order (server-side verification - never trust client)
app.get("/api/checkout/verify", async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe is not configured." });
  const sessionId = req.query.session_id;
  if (!sessionId || typeof sessionId !== "string") return res.status(400).json({ error: "Missing session_id" });
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] });
    if (session.payment_status !== "paid") {
      return res.status(400).json({ error: "Payment not completed", paymentStatus: session.payment_status });
    }
    const meta = session.metadata || {};
    const existing = await findOrderByStripeSessionId(sessionId);
    if (existing) {
      return res.json(useSupabase() ? orderRowToApi(existing) : existing);
    }
    const order = {
      id: randomUUID(),
      serviceId: meta.serviceId || "unknown",
      serviceTitle: meta.serviceTitle || "Temporary Tag",
      firstName: meta.firstName || "",
      lastName: meta.lastName || "",
      phone: meta.phone || "",
      address: meta.address || "",
      deliveryAddress: meta.deliveryAddress || "",
      vin: meta.vin || "",
      carMakeModel: meta.carMakeModel || "",
      color: meta.color || "",
      price: (session.amount_total || 0) / 100,
      createdAt: new Date().toISOString(),
      stripeSessionId: sessionId,
      paymentStatus: "paid",
      telegramSent: false,
      telegramRecipients: [],
      telegramErrors: [],
    };
    await appendActivity("dataIn", { type: "order", orderId: order.id, serviceTitle: order.serviceTitle, price: order.price, stripeSessionId: sessionId });
    await appendActivity("payments", { type: "order", orderId: order.id, amount: order.price, status: "paid", stripeSessionId: sessionId });
    const telegramResults = await sendToTelegram(formatOrderMessage(order));
    order.telegramSent = telegramResults.every((r) => r.ok);
    order.telegramRecipients = telegramResults.filter((r) => r.ok).map((r) => r.chatId);
    order.telegramErrors = telegramResults.filter((r) => !r.ok).map((r) => ({ chatId: r.chatId, error: r.error }));
    await saveOrder(order);
    res.json(order);
  } catch (e) {
    console.error("Stripe verify error:", e);
    res.status(500).json({ error: e.message || "Failed to verify payment" });
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
  if (useSupabase()) console.log("Using Supabase"); else console.log("Using file storage");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") console.error(`Port ${PORT} in use`);
  process.exit(1);
});
