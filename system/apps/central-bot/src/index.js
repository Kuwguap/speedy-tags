/**
 * Central bot + dashboard HTTP service (Render).
 *   Dashboard (admin-auth):  /  /transactions  /deliveries  /renewals
 *                            /drivers  /supervisors  (+ POST actions)
 *   Renewal sweep:           POST /renewals/run (UI) + POST /cron/renewals (secret)
 *   Telegram control bot:    POST /telegram/webhook
 *   Health:                  GET /health
 */

import express from "express";
import { config, assertConfig } from "./config.js";
import { requireAuth, issueCookie, clearCookie, checkPassword, isAuthed } from "./auth.js";
import * as db from "./db.js";
import * as views from "./views.js";
import { runRenewalSweep } from "./renewals.js";
import { handleUpdate, setWebhook } from "./telegram.js";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "1mb" }));

const html = (res, body) => res.set("Content-Type", "text/html; charset=utf-8").send(body);

app.get("/health", (_req, res) => res.json({ ok: true, service: "central-bot" }));

// ─── Auth ────────────────────────────────────────────────────────────────────
app.get("/login", (req, res) => {
  if (isAuthed(req)) return res.redirect("/");
  html(res, views.loginPage());
});
app.post("/login", (req, res) => {
  if (checkPassword(req.body?.password)) {
    issueCookie(res);
    return res.redirect("/");
  }
  html(res, views.loginPage("Incorrect password."));
});
app.post("/logout", (req, res) => {
  clearCookie(res);
  res.redirect("/login");
});

// ─── Dashboard pages ─────────────────────────────────────────────────────────
app.get("/", requireAuth, async (_req, res) => html(res, views.overviewPage(await db.overview())));
app.get("/transactions", requireAuth, async (_req, res) => html(res, views.transactionsPage(await db.listTransactions())));
app.get("/deliveries", requireAuth, async (_req, res) => html(res, views.deliveriesPage(await db.listDeliveries())));
app.get("/renewals", requireAuth, async (_req, res) => html(res, views.renewalsPage(await db.upcomingRenewals())));
app.get("/drivers", requireAuth, async (_req, res) => html(res, views.driversPage(await db.listDrivers())));
app.get("/supervisors", requireAuth, async (_req, res) => html(res, views.supervisorsPage(await db.listSupervisors())));

// ─── Drivers CRUD ────────────────────────────────────────────────────────────
app.post("/drivers/add", requireAuth, async (req, res) => {
  try {
    await db.addDriver({ name: req.body.name, email: req.body.email, telegram_id: req.body.telegram_id });
    res.redirect("/drivers");
  } catch (err) {
    html(res, views.driversPage(await db.listDrivers(), `Could not add driver: ${err.message}`));
  }
});
app.post("/drivers/:id/toggle", requireAuth, async (req, res) => {
  const list = await db.listDrivers();
  const cur = list.find((x) => x.id === req.params.id);
  await db.setDriverActive(req.params.id, !cur?.active);
  res.redirect("/drivers");
});
app.post("/drivers/:id/delete", requireAuth, async (req, res) => {
  await db.deleteDriver(req.params.id);
  res.redirect("/drivers");
});

// ─── Supervisors CRUD ────────────────────────────────────────────────────────
app.post("/supervisors/add", requireAuth, async (req, res) => {
  try {
    await db.addSupervisor({ name: req.body.name, telegram_id: req.body.telegram_id });
    res.redirect("/supervisors");
  } catch (err) {
    html(res, views.supervisorsPage(await db.listSupervisors(), `Could not add supervisor: ${err.message}`));
  }
});
app.post("/supervisors/:id/toggle", requireAuth, async (req, res) => {
  const list = await db.listSupervisors();
  const cur = list.find((x) => x.id === req.params.id);
  await db.setSupervisorActive(req.params.id, !cur?.active);
  res.redirect("/supervisors");
});
app.post("/supervisors/:id/delete", requireAuth, async (req, res) => {
  await db.deleteSupervisor(req.params.id);
  res.redirect("/supervisors");
});

// ─── Renewals ────────────────────────────────────────────────────────────────
app.post("/renewals/run", requireAuth, async (_req, res) => {
  await runRenewalSweep().catch((e) => console.error("[renewals] manual:", e.message));
  res.redirect("/renewals");
});
// Unattended trigger (e.g. Render Cron Job) — guarded by the admin password.
app.post("/cron/renewals", async (req, res) => {
  if ((req.get("x-cron-secret") || req.query.secret) !== config.adminPassword) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  try {
    res.json({ ok: true, ...(await runRenewalSweep()) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Telegram control bot ────────────────────────────────────────────────────
app.post("/telegram/webhook", async (req, res) => {
  res.json({ ok: true });
  try {
    await handleUpdate(req.body);
  } catch (err) {
    console.error("[central-tg] handler:", err);
  }
});

app.listen(config.port, async () => {
  assertConfig();
  console.log(`[central-bot] dashboard + bot on :${config.port}`);
  await setWebhook();
  // In-process renewal sweep (also available via Render Cron → /cron/renewals).
  if (config.renewalSweepMinutes > 0) {
    const everyMs = config.renewalSweepMinutes * 60000;
    setInterval(() => {
      runRenewalSweep()
        .then((r) => r.sent && console.log(`[renewals] auto-sent ${r.sent}`))
        .catch((e) => console.error("[renewals] auto:", e.message));
    }, everyMs);
  }
});
