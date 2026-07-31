// Admin page auto-picks the correct API base for your environment:
//   • Served from localhost / 127.0.0.1 / private LAN → same origin (local FastAPI)
//   • Served from file:// (opened directly) → DEFAULT_API_BASE (Render)
//   • Served from any other host (e.g. Vercel) → DEFAULT_API_BASE (Render)
// Override (no code change):
//   • Add ?api=https%3A%2F%2Fyour-api.onrender.com to the URL
//   • Or set localStorage key `krab_api_base` to a full base URL (no trailing slash) and reload
//   • Clear override: ?api=reset
//
// Highkage handle split override:
//   ?highkage=kingkrab,haruhatsu
// or set localStorage key `krab_highkage_handles` to a comma-separated handle list
// (without @). Default highkage handle: haruhatsu
const DEFAULT_API_BASE = "https://krab-dispatch-api.onrender.com";

function _isLocalHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (!h) return false;
  if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "::1") {
    return true;
  }
  // Private LAN ranges and Windows/Mac .local names
  if (h.endsWith(".local") || h.endsWith(".localhost")) return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(h)) return true;
  return false;
}

function _isProductionWebHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  return (
    h === "tristatetags.com" ||
    h === "www.tristatetags.com" ||
    h === "tristatetag.com" ||
    h === "www.tristatetag.com" ||
    h.endsWith(".vercel.app")
  );
}

function resolveApiBase() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = (params.get("api") || "").trim();
    if (fromQuery === "reset" || fromQuery === "clear") {
      try {
        localStorage.removeItem("krab_api_base");
      } catch {
        // ignore
      }
    } else if (
      fromQuery.startsWith("https://") ||
      fromQuery.startsWith("http://")
    ) {
      const normalized = fromQuery.replace(/\/+$/, "");
      try {
        localStorage.setItem("krab_api_base", normalized);
      } catch {
        // ignore
      }
      return normalized;
    }
  } catch {
    // ignore
  }
  try {
    const stored = (localStorage.getItem("krab_api_base") || "").trim();
    if (stored.startsWith("https://") || stored.startsWith("http://")) {
      const loc = window.location;
      const onProd =
        loc &&
        loc.protocol === "https:" &&
        _isProductionWebHost(loc.hostname);
      if (
        onProd &&
        (stored.includes("krab-dispatch-api.onrender.com") || stored.includes("onrender.com"))
      ) {
        return loc.origin.replace(/\/+$/, "") + "/api/dispatch";
      }
      return stored.replace(/\/+$/, "");
    }
  } catch {
    // ignore
  }
  // Auto-detect: when the admin page is served from localhost / private LAN,
  // call the API on the same origin so local data shows up.
  try {
    const loc = window.location;
    if (
      loc &&
      (loc.protocol === "http:" || loc.protocol === "https:") &&
      _isLocalHost(loc.hostname)
    ) {
      return loc.origin.replace(/\/+$/, "");
    }
    // Same-origin proxy on production (mobile Safari blocks cross-origin Render API).
    if (loc && loc.protocol === "https:" && _isProductionWebHost(loc.hostname)) {
      return loc.origin.replace(/\/+$/, "") + "/api/dispatch";
    }
  } catch {
    // ignore
  }
  return DEFAULT_API_BASE;
}

const API_BASE = resolveApiBase();

function issuerTabActive() {
  const issuerPanel = document.getElementById("panel-issuer");
  return !!(issuerPanel && issuerPanel.classList.contains("tab-panel-active"));
}

function dispatchTabActive() {
  const dispatchPanel = document.getElementById("panel-dispatch");
  return !!(dispatchPanel && dispatchPanel.classList.contains("tab-panel-active"));
}

function transactionsTabActive() {
  const p = document.getElementById("panel-transactions");
  return !!(p && p.classList.contains("tab-panel-active"));
}

// Forward registry for handlers that are owned by setupEvents()'s closure
// (e.g. refreshRecipients) but need to be invoked from module-scope code
// like setupAdminTabs()'s tab activation. setupEvents() populates this at
// the end of its initialization; callers must use optional chaining.
const adminApi = {};

function trackTabActive() {
  const p = document.getElementById("panel-track");
  return !!(p && p.classList.contains("tab-panel-active"));
}

// Bridge to the recipients loader defined inside setupEvents(); lets
// top-level code (tab activation, DOMContentLoaded, combined driver card)
// trigger a refresh without a ReferenceError before setup runs.
let _refreshRecipientsImpl = null;
function refreshRecipients() {
  if (typeof _refreshRecipientsImpl === "function") {
    return _refreshRecipientsImpl();
  }
  return Promise.resolve();
}

function setupAdminTabs() {
  const strip = document.querySelector(".tab-strip");
  const txnPanel = document.getElementById("panel-transactions");
  const dispatchPanel = document.getElementById("panel-dispatch");
  const issuerPanel = document.getElementById("panel-issuer");
  const trackPanel = document.getElementById("panel-track");
  if (!strip || !dispatchPanel || !issuerPanel) {
    return () => {};
  }
  const tabs = strip.querySelectorAll(".tab[data-tab]");

  // Per-tab staleness: skip re-fetch when the tab loaded <60s ago. Tab
  // switches within a minute become instant; explicit refresh buttons and
  // post-mutation reloads bypass this via their force flags.
  const TAB_STALE_MS = 60_000;
  const _tabLastLoad = { transactions: 0, issuer: 0, dispatch: 0 };

  const activate = (id) => {
    tabs.forEach((btn) => {
      const on = btn.getAttribute("data-tab") === id;
      btn.classList.toggle("tab-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (txnPanel) {
      txnPanel.classList.toggle("tab-panel-active", id === "transactions");
    }
    dispatchPanel.classList.toggle("tab-panel-active", id === "dispatch");
    issuerPanel.classList.toggle("tab-panel-active", id === "issuer");
    if (trackPanel) {
      trackPanel.classList.toggle("tab-panel-active", id === "track");
    }
    if (id !== "track") {
      stopTrackAutoRefresh();
    }
    const fresh = Date.now() - (_tabLastLoad[id] || 0) < TAB_STALE_MS;
    if (fresh) return;
    _tabLastLoad[id] = Date.now();
    if (id === "issuer") {
      refreshIssuerAdmin();
    } else if (id === "transactions") {
      refreshUnifiedTransactions();
      refreshWeeklyPerformance();
    } else if (id === "dispatch") {
      adminApi.refreshRecipients?.();
      refreshIssuerAdmin();
      // Dispatch panel data (moved off the unlock path): load on first visit.
      try {
        adminApi.refreshDispatchData?.();
      } catch {}
    } else if (id === "track") {
      refreshDriverTrack();
      startTrackAutoRefresh();
    }
  };

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-tab");
      if (id) {
        activate(id);
      }
    });
  });
  return activate;
}

function resolveHighkageHandleSet() {
  const parseList = (raw) => {
    return String(raw || "")
      .split(",")
      .map((h) => h.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean);
  };

  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = (params.get("highkage") || "").trim();
    if (fromQuery) {
      const handles = parseList(fromQuery);
      if (handles.length > 0) {
        localStorage.setItem("krab_highkage_handles", handles.join(","));
        return new Set(handles);
      }
    }
  } catch {
    // ignore
  }

  try {
    const stored = (localStorage.getItem("krab_highkage_handles") || "").trim();
    const handles = parseList(stored);
    if (handles.length > 0) {
      return new Set(handles);
    }
  } catch {
    // ignore
  }

  return new Set(["haruhatsu"]);
}

const HIGHKAGE_FALLBACK_HANDLES = resolveHighkageHandleSet();

function formatNy(ts) {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    const nyDate = new Date(
      d.toLocaleString("en-US", { timeZone: "America/New_York" })
    );
    const day = nyDate.getDate();
    const month = nyDate.toLocaleString("en-US", {
      month: "long",
    });
    const year = nyDate.getFullYear();

    let hours = nyDate.getHours();
    const minutes = nyDate.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    if (hours === 0) hours = 12;

    return `${month} ${day} ${year} ${hours}:${minutes}${ampm.toLowerCase()}`;
  } catch {
    return ts;
  }
}

function formatRevenueUsd(totalCount) {
  const n = Number(totalCount) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n * 100);
}

function normalizeHandle(rawHandle) {
  return String(rawHandle || "").trim().toLowerCase().replace(/^@/, "");
}

function formatHandleWithAt(rawHandle) {
  const h = normalizeHandle(rawHandle);
  return h ? "@" + h : "";
}

function truncateNotes(text, maxLen) {
  const n = maxLen != null ? maxLen : 80;
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return "—";
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

function escapeHtmlAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function receiptViewHref(url, ref) {
  const r = String(ref || "").trim();
  if (r) {
    return (
      API_BASE +
      "/issuer-admin/receipts/view?ref=" +
      encodeURIComponent(r)
    );
  }
  const u = String(url || "").trim();
  if (!u) return "";
  if (u.includes("api.telegram.org/file/bot")) {
    return "";
  }
  return u;
}

function receiptViewUrl(ref) {
  return `${API_BASE}/issuer-admin/receipts/view?ref=${encodeURIComponent(
    String(ref || "").trim()
  )}`;
}

function receiptLinkHtml(url, ref) {
  // Prefer the backend proxy: stored Telegram URLs expire (~1h) while
  // /issuer-admin/receipts/view re-signs them via the permanent file_id.
  const r = String(ref || "").trim();
  if (r && r.toUpperCase() !== "N/A") {
    return `<a href="${escapeHtmlAttr(
      receiptViewUrl(r)
    )}" target="_blank" rel="noopener noreferrer">View</a>`;
  }
  const u = String(url || "").trim();
  // Only show a "View" link when a receipt image was actually uploaded.
  // A reference id alone must not produce a link (nothing to view yet).
  if (!u) return '<span class="muted">—</span>';
  const href = receiptViewHref(u, ref);
  if (!href) return '<span class="muted">—</span>';
  return `<a href="${escapeHtmlAttr(href)}" target="_blank" rel="noopener noreferrer">View</a>`;
}

function issuerGroupFromHandle(rawHandle) {
  const h = normalizeHandle(rawHandle);
  return HIGHKAGE_FALLBACK_HANDLES.has(h) ? "highkage_group" : "sensei_group";
}

function getStoredPassword() {
  try {
    return String(localStorage.getItem("krab_admin_password") || "").trim();
  } catch {
    return "";
  }
}

function storePassword(pw) {
  try {
    localStorage.setItem("krab_admin_password", pw);
  } catch {
    // ignore
  }
}

// Increments whenever a login batch (initial or manual) successfully validates against the API.
// tryInitialLogin uses this so a stale in-flight failure cannot clear the password after the user unlocked.
let _adminAuthSuccessGeneration = 0;

function bumpAdminAuthSuccessGeneration() {
  _adminAuthSuccessGeneration += 1;
}

function hasAdminPassword() {
  return !!getStoredPassword();
}

function syncAdminPasswordInputs(value) {
  const v = String(value || "");
  ["admin-password-input", "txn-admin-password-input", "issuer-admin-password-input"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) el.value = v;
    }
  );
}

function clearAdminAuthErrorDisplays() {
  document.querySelectorAll("[data-auth-error]").forEach((e) => {
    if (e && e.style) e.style.display = "none";
  });
  ["auth-error", "txn-auth-error", "issuer-auth-error"].forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.style) el.style.display = "none";
  });
}

async function fetchWithAdmin(path, opts = {}) {
  const pw = getStoredPassword();
  if (!pw) {
    throw new Error("NO_PASSWORD");
  }
  const headers = Object.assign({}, opts.headers || {}, {
    "X-Admin-Password": pw,
  });
  let res;
  try {
    res = await fetch(API_BASE + path, {
    ...opts,
    headers,
  });
  } catch (e) {
    const msg = (e && e.message) || String(e);
    throw new Error("NETWORK: " + msg);
  }
  if (res.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!res.ok) {
    throw new Error("HTTP_" + res.status);
  }
  return res.json();
}

// Like fetchWithAdmin, but does not throw on non-2xx; callers can branch.
async function requestWithAdminJson(path, opts = {}) {
  const pw = getStoredPassword();
  if (!pw) {
    return { ok: false, status: 0, error: "NO_PASSWORD" };
  }
  const headers = Object.assign({}, opts.headers || {}, {
    Accept: "application/json",
    "X-Admin-Password": pw,
  });
  let res;
  try {
    res = await fetch(API_BASE + path, { ...opts, headers });
  } catch (e) {
    const msg = (e && e.message) || String(e);
    return { ok: false, status: 0, error: "NETWORK: " + msg };
  }
  if (res.status === 401) {
    return { ok: false, status: res.status, error: "UNAUTHORIZED" };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, error: "HTTP_" + res.status };
  }
  const text = await res.text();
  if (!text.trim()) {
    return { ok: false, status: res.status, error: "EMPTY_RESPONSE" };
  }
  if (text.trimStart().startsWith("<")) {
    return { ok: false, status: res.status, error: "HTML_RESPONSE" };
  }
  try {
    const data = JSON.parse(text);
    return { ok: true, status: res.status, data };
  } catch (e) {
    return { ok: false, status: res.status, error: "BAD_JSON" };
  }
}

function issuerFormatDetail(detail) {
  if (detail == null) return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((x) => (x && (x.msg || x.message)) || JSON.stringify(x))
      .join("; ");
  }
  return String(detail);
}

async function issuerApiJson(path, opts = {}) {
  const pw = getStoredPassword();
  const allowAnon = opts.allowAnonymous === true;
  if (!pw && !allowAnon) return { ok: false, error: "NO_PASSWORD" };
  const headers = Object.assign({}, opts.headers || {});
  if (pw) headers["X-Admin-Password"] = pw;
  if (opts.body !== undefined && opts.body !== null) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }
  const { allowAnonymous: _drop, ...fetchOpts } = opts;
  let res;
  try {
    res = await fetch(API_BASE + path, { ...fetchOpts, headers });
  } catch (e) {
    return { ok: false, error: "NETWORK: " + ((e && e.message) || String(e)) };
  }
  const ct = res.headers.get("content-type") || "";
  let body = null;
  if (ct.includes("application/json")) {
    try {
      body = await res.json();
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    const detail = body && (body.detail ?? body.message ?? body.error);
    return {
      ok: false,
      status: res.status,
      error: issuerFormatDetail(detail) || "HTTP_" + res.status,
      body,
    };
  }
  return { ok: true, data: body };
}

function escapeIssuerText(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ==========================================================================
// Unified Transactions tab (joins Dispatcher → Issuer → Driver → Receipt).
// ==========================================================================

let _txnRows = [];
let _cachedIssuerDrivers = [];
let _cachedDispatchRecipients = [];
let _txnLoading = false;
let _txnInflight = null;
let _txnLastFetch = 0;
let _txnRerunForced = false;
const KRAB_TXN_PERIOD_KEY = "krab_txn_period";
let txnUnifiedZoomScale = 1;

function txnPeriodApiValue() {
  const sel = document.getElementById("txn-period-select");
  const v = sel ? String(sel.value || "all").trim().toLowerCase() : "all";
  const allowed = new Set(["1w", "2w", "3w", "1m", "3m", "6m", "12m", "all"]);
  return allowed.has(v) ? v : "all";
}

function txnTransactionsUrl(path, limitNum) {
  const p = new URLSearchParams();
  p.set("limit", String(limitNum));
  const period = txnPeriodApiValue();
  if (period && period !== "all") p.set("period", period);
  return `${path}?${p.toString()}`;
}

function _mapBasicTxToUnifiedRows(items) {
  const arr = Array.isArray(items) ? items : [];
  return arr.map((tx) => ({
    id: tx && tx.id,
    reference_id: (tx && tx.reference_id) || null,
    timestamp_ny: (tx && tx.timestamp_ny) || "",
    filename: (tx && tx.filename) || "",
    delivery_status: (tx && tx.delivery_status) || "",
    tag_name: (tx && tx.lead_client_name) || null,
    price: (tx && tx.price) || null,
    receipt_price: (tx && tx.receipt_price) || null,
    receipt_image_url: (tx && tx.receipt_image_url) || null,
    issuer_group: (tx && tx.issuer_group) || "",
    issuer_submitter_handle: null,
    issuer_submitter_telegram_id: null,
    dispatcher_name: (tx && tx.telegram_name) || "",
    dispatcher_handle: (tx && tx.telegram_handle) || "",
    driver_selected_name: (tx && tx.recipient_name) || "",
    driver_recipient_email: (tx && tx.recipient_email) || "",
    driver_accepted: null,
    driver_history: [],
  }));
}

function setTxnBanner(msg) {
  const el = document.getElementById("txn-banner");
  if (!el) return;
  el.textContent = msg || "";
  el.style.display = msg ? "block" : "none";
}

function setTxnStatus(msg) {
  const el = document.getElementById("txn-status");
  if (!el) return;
  el.textContent = msg || "";
}

function _txnDriverEmailSuffix(row) {
  const e = ((row && row.driver_recipient_email) || "").trim();
  if (!e) return "";
  return ` <span class="small muted">${escapeIssuerText(e)}</span>`;
}

function _txnDriverHandleSuffix(record) {
  if (!record) return "";
  const raw =
    record.telegram_username ||
    record.driver_telegram_username ||
    record.driver_handle ||
    "";
  const handle = String(raw || "").trim().replace(/^@+/, "");
  if (!handle) return "";
  return ` <span class="small muted">@${escapeIssuerText(handle)}</span>`;
}

function _txnDriverCell(row) {
  // Only the driver who actually accepted the lead is shown here. Decliners
  // and reassignment history are intentionally hidden — operations supervisors
  // only need to see who took the lead, their email, and the accept time.
  const accepted = row && row.driver_accepted;
  const selected = (row && row.driver_selected_name) || "";
  const history = Array.isArray(row && row.driver_history)
    ? row.driver_history
    : [];
  const emailSuf = _txnDriverEmailSuffix(row);

  if (accepted && accepted.driver_name) {
    const handleSuf = _txnDriverHandleSuffix(accepted);
    const acceptedSuf = accepted.accepted_at
      ? ` <span class="small muted">· accepted ${escapeIssuerText(
          formatNy(accepted.accepted_at)
        )}</span>`
      : "";
    return (
      `<div><strong>${escapeIssuerText(accepted.driver_name)}</strong>${emailSuf}${handleSuf}${acceptedSuf}</div>`
    );
  }

  // No accepted driver yet — fall back to the originally selected driver name
  // so supervisors at least know who the lead was routed to. Still no decliner
  // list.
  if (selected) {
    return `<div><strong>${escapeIssuerText(selected)}</strong>${emailSuf}</div>`;
  }
  if (history.length > 0 && history[0].driver_name) {
    return `<div><strong>${escapeIssuerText(history[0].driver_name)}</strong>${emailSuf}</div>`;
  }
  return '<div class="muted">—</div>';
}

function _txnIssuerCell(row) {
  // Issuer = who actually sent the tag through Krab Dispatch.
  const senderName = ((row && row.dispatcher_name) || "").trim();
  const senderHandle = ((row && row.dispatcher_handle) || "").trim();

  if (senderName || senderHandle) {
    const parts = [];
    if (senderName) {
      parts.push(`<strong>${escapeIssuerText(senderName)}</strong>`);
    }
    if (senderHandle) {
      parts.push(`<span class="small muted">@${escapeIssuerText(senderHandle)}</span>`);
    }
    return parts.join(" ");
  }

  // Older/partial rows fallback to Issuer-side submitter identity.
  const issuerHandle = ((row && row.issuer_submitter_handle) || "").trim();
  if (issuerHandle && issuerHandle.toLowerCase() !== "unknown") {
    return `<strong>@${escapeIssuerText(issuerHandle)}</strong>`;
  }
  return '<span class="muted">—</span>';
}

function _txnDispatcherCell(row) {
  // Dispatcher = who created the lead in Krab Issuer.
  const issuerHandle = ((row && row.issuer_submitter_handle) || "").trim();
  const creatorName = ((row && row.dispatcher_name) || "").trim();
  const creatorHandle = ((row && row.dispatcher_handle) || "").trim();

  if (issuerHandle && issuerHandle.toLowerCase() !== "unknown") {
    return `<strong>@${escapeIssuerText(issuerHandle)}</strong>`;
  }

  // Fallback for old rows without Issuer lead creator fields.
  if (creatorName || creatorHandle) {
    const parts = [];
    if (creatorName) {
      parts.push(`<strong>${escapeIssuerText(creatorName)}</strong>`);
    }
    if (creatorHandle) {
      parts.push(`<span class="small muted">@${escapeIssuerText(creatorHandle)}</span>`);
    }
    return parts.join(" ");
  }

  return '<span class="muted">—</span>';
}

function _txnResolveDispatcherHandle(row) {
  const h = String((row && row.issuer_submitter_handle) || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
  if (h && h !== "unknown") return h;
  const fallback = String((row && row.dispatcher_handle) || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
  return fallback || "unknown";
}

function _txnDispatcherSlug(handle) {
  return String(handle || "unknown")
    .trim()
    .toLowerCase()
    .replace(/^@/, "") || "unknown";
}

function renderTxnDispatcherGroups(rows) {
  const host = document.getElementById("txn-dispatcher-groups");
  if (!host) return;
  const map = new Map();
  for (const r of rows || []) {
    const handle = _txnResolveDispatcherHandle(r);
    if (handle === "unknown") continue;
    const cur = map.get(handle) || { total: 0, delivered: 0 };
    cur.total += 1;
    if (_wpIsTagIssued(r)) cur.delivered += 1;
    map.set(handle, cur);
  }
  const list = [...map.entries()]
    .map(([handle, v]) => ({ handle, slug: _txnDispatcherSlug(handle), ...v }))
    .sort((a, b) => b.delivered - a.delivered || b.total - a.total || a.handle.localeCompare(b.handle));
  if (list.length === 0) {
    host.innerHTML = "";
    host.style.display = "none";
    return;
  }
  host.style.display = "block";
  host.innerHTML =
    `<div class="panel-title" style="margin-bottom:0.4rem;font-size:0.9rem">Dispatchers (grouped)</div>` +
    `<div class="txn-dispatcher-chips">` +
    list
      .map(
        (d) =>
          `<a class="txn-dispatcher-chip" href="/fridaypayday/${encodeURIComponent(d.slug)}">` +
          `<strong>@${escapeIssuerText(d.handle)}</strong>` +
          `<span class="muted">${d.delivered} tag${d.delivered === 1 ? "" : "s"} · ${d.total} row${d.total === 1 ? "" : "s"}</span>` +
          `</a>`
      )
      .join("") +
    `</div>`;
}

function _txnReceiptCell(row) {
  const url = (row && row.receipt_image_url) || "";
  const ref = (row && row.reference_id) || "";
  if (!url && !ref) return '<span class="muted">—</span>';
  return receiptLinkHtml(url, ref);
}

function _txnPriceCell(row) {
  const raw = (row && row.price) || "";
  if (!raw) return '<span class="muted">—</span>';
  return escapeIssuerText(raw);
}

function _txnReceiptPriceCell(row) {
  const raw = (row && row.receipt_price) || "";
  if (!raw) return '<span class="muted">—</span>';
  return escapeIssuerText(raw);
}

function _txnParsePrice(raw) {
  if (raw == null) return 0;
  const s = String(raw).trim();
  if (!s) return 0;
  // Strip anything that isn't a digit, dot, minus, or comma; normalize commas.
  const cleaned = s.replace(/[^0-9.\-,]/g, "").replace(/,/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return 0;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function _txnFormatUsd(n) {
  const v = Number.isFinite(n) ? n : 0;
  const hasCents = Math.abs(v - Math.round(v)) > 0.0001;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(v);
}

// ==========================================================================
// Weekly performance dashboard (Transactions tab — tristatetags.com/backend)
// ==========================================================================

const PAYROLL_RATE_ISSUER = 9;
const PAYROLL_RATE_DISPATCHER = 5;
const PAYROLL_RATE_CLIENT_FINDER = 10;
const KRAB_WP_CHART_RANGE_KEY = "krab_wp_chart_range";
const NJ_TZ = "America/New_York";

let _wpChartRows = [];
let _wpWeekReceipts = [];
let _wpLoading = false;

function _wpParseNyMs(iso) {
  if (!iso) return NaN;
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? NaN : t.getTime();
}

function _wpRollingStartMs(days) {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function _wpNjWeekStartMs(ms) {
  const d = new Date(ms);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: NJ_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year").value);
  const m = Number(parts.find((p) => p.type === "month").value);
  const day = Number(parts.find((p) => p.type === "day").value);
  const noonUtc = Date.UTC(y, m - 1, day, 17, 0, 0);
  const weekday = new Date(noonUtc).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  return noonUtc - daysSinceMonday * 24 * 60 * 60 * 1000;
}

function _wpWeekKey(ms) {
  const weekStart = _wpNjWeekStartMs(ms);
  const d = new Date(weekStart);
  const y = d.getUTCFullYear();
  const jan1 = Date.UTC(y, 0, 1, 12, 0, 0);
  const weekNum =
    Math.floor((weekStart - _wpNjWeekStartMs(jan1)) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${y}-W${String(weekNum).padStart(2, "0")}`;
}

function _wpWeekLabel(ms) {
  const d = new Date(ms);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: NJ_TZ,
    month: "short",
    day: "numeric",
  }).format(d);
}

function _wpIsTagIssued(row) {
  return ((row && row.delivery_status) || "").toUpperCase() === "DELIVERED";
}

function _wpHasReceipt(row) {
  return !!String((row && row.receipt_image_url) || "").trim();
}

function _wpDriverName(row) {
  const acc = row && row.driver_accepted;
  if (acc && acc.driver_name) return String(acc.driver_name).trim();
  const sel = (row && row.driver_selected_name) || "";
  if (sel) return String(sel).trim();
  const hist = Array.isArray(row && row.driver_history) ? row.driver_history : [];
  if (hist[0] && hist[0].driver_name) return String(hist[0].driver_name).trim();
  return "";
}

function _wpUnpaidReason(row) {
  if (!_wpIsTagIssued(row)) {
    const st = ((row && row.delivery_status) || "unknown").toUpperCase();
    return `Tag not delivered yet (status: ${st})`;
  }
  const driver = _wpDriverName(row);
  if (!driver) {
    return "Delivered — no driver on file; receipt missing";
  }
  return `Driver ${driver} — accepted; receipt not uploaded`;
}

function _wpSumReceiptUsd(rows) {
  let sum = 0;
  for (const r of rows) {
    const n = _txnParsePrice(r && r.receipt_price);
    if (n > 0) sum += n;
  }
  return sum;
}

function _wpBuildWeeklyBuckets(rows, maxWeeks) {
  const map = new Map();
  for (const row of rows || []) {
    const ms = _wpParseNyMs(row.timestamp_ny);
    if (Number.isNaN(ms)) continue;
    const key = _wpWeekKey(ms);
    if (!map.has(key)) {
      map.set(key, {
        key,
        weekStartMs: _wpNjWeekStartMs(ms),
        tags: 0,
        receipts: 0,
        receiptUsd: 0,
      });
    }
    const b = map.get(key);
    if (_wpIsTagIssued(row)) {
      b.tags += 1;
      if (_wpHasReceipt(row)) {
        b.receipts += 1;
        b.receiptUsd += _txnParsePrice(row.receipt_price);
      }
    }
  }
  let list = Array.from(map.values()).sort((a, b) => a.weekStartMs - b.weekStartMs);
  if (maxWeeks != null && maxWeeks > 0 && list.length > maxWeeks) {
    list = list.slice(list.length - maxWeeks);
  }
  for (const b of list) {
    b.label = _wpWeekLabel(b.weekStartMs);
    b.payroll =
      b.tags *
      (PAYROLL_RATE_ISSUER + PAYROLL_RATE_DISPATCHER + PAYROLL_RATE_CLIENT_FINDER);
  }
  return list;
}

function _wpDrawChart(canvas, buckets) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 900;
  const cssH = 220;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  if (!buckets || buckets.length === 0) {
    ctx.fillStyle = "#9ca3af";
    ctx.font = "13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No data for chart — send tags through Dispatch.", cssW / 2, cssH / 2);
    return;
  }

  const padL = 44;
  const padR = 12;
  const padT = 14;
  const padB = 36;
  const plotW = cssW - padL - padR;
  const plotH = cssH - padT - padB;

  let maxCount = 1;
  let maxUsd = 1;
  for (const b of buckets) {
    maxCount = Math.max(maxCount, b.tags, b.receipts);
    maxUsd = Math.max(maxUsd, b.receiptUsd / 100);
  }

  const n = buckets.length;
  const groupW = plotW / n;
  const barW = Math.min(14, groupW * 0.22);

  ctx.strokeStyle = "rgba(148,163,184,0.2)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
  }

  buckets.forEach((b, i) => {
    const cx = padL + groupW * i + groupW / 2;
    const tagsH = (b.tags / maxCount) * plotH;
    const recH = (b.receipts / maxCount) * plotH;
    const usdH = (b.receiptUsd / 100 / maxUsd) * plotH;

    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(cx - barW - 2, padT + plotH - tagsH, barW, tagsH);
    ctx.fillStyle = "#4ade80";
    ctx.fillRect(cx + 2, padT + plotH - recH, barW, recH);
    ctx.fillStyle = "#fbbf24";
    ctx.fillRect(cx - 3, padT + plotH - usdH, 6, usdH);

    if (n <= 26 || i % Math.ceil(n / 13) === 0) {
      ctx.fillStyle = "#9ca3af";
      ctx.font = "10px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(b.label, cx, cssH - 8);
    }
  });

  ctx.fillStyle = "#9ca3af";
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(String(maxCount), padL - 6, padT + 4);
  ctx.fillText("$" + Math.round(maxUsd * 100), padL - 6, padT + plotH);
}

function _wpRenderUnpaidTable(rows) {
  const tbody = document.getElementById("wp-unpaid-tbody");
  const statusEl = document.getElementById("wp-unpaid-status");
  if (!tbody) return;
  tbody.innerHTML = "";
  const unpaid = (rows || []).filter((r) => _wpIsTagIssued(r) && !_wpHasReceipt(r));
  if (statusEl) {
    statusEl.textContent =
      unpaid.length === 0
        ? "All issued tags this week have a receipt on file."
        : `${unpaid.length} issued tag(s) without a receipt this week.`;
  }
  if (unpaid.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "muted";
    td.textContent = "None this week.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  unpaid.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td class="small">${escapeIssuerText(formatNy(r.timestamp_ny))}</td>` +
      `<td><code>${escapeIssuerText(r.reference_id || "—")}</code></td>` +
      `<td style="text-align:left;max-width:10rem;white-space:normal;">${escapeIssuerText(
        r.tag_name || r.filename || "—"
      )}</td>` +
      `<td>${escapeIssuerText(_wpDriverName(r) || "—")}</td>` +
      `<td style="text-align:left;white-space:normal;font-size:0.78rem;">${escapeIssuerText(
        _wpUnpaidReason(r)
      )}</td>`;
    tbody.appendChild(tr);
  });
}

function _wpSumLeadPriceUsd(rows) {
  let sum = 0;
  for (const r of rows) {
    const n = _txnParsePrice(r && r.price);
    sum += n > 0 ? n : 100;
  }
  return sum;
}

function _wpRenderCurrentWeek(weekRows, receiptUploads) {
  const delivered = (weekRows || []).filter(_wpIsTagIssued);
  const tags = delivered.length;
  const withReceipt = delivered.filter(_wpHasReceipt);
  let receiptCount = withReceipt.length;
  let receiptUsd = _wpSumReceiptUsd(withReceipt);

  if (Array.isArray(receiptUploads) && receiptUploads.length > 0) {
    const startMs = _wpRollingStartMs(7);
    const uploaded = receiptUploads.filter((r) => {
      const ms = _wpParseNyMs(r.updated_at);
      return !Number.isNaN(ms) && ms >= startMs;
    });
    if (uploaded.length > 0) {
      receiptCount = uploaded.length;
    }
  }

  const unpaid = delivered.filter((r) => !_wpHasReceipt(r)).length;
  const issuerPay = tags * PAYROLL_RATE_ISSUER;
  const dispPay = tags * PAYROLL_RATE_DISPATCHER;
  const finderPay = tags * PAYROLL_RATE_CLIENT_FINDER;
  const payrollCore = issuerPay + dispPay;
  const totalPay = payrollCore + finderPay;

  const expectedFromLeads = _wpSumLeadPriceUsd(delivered);
  const minimumExpected = tags * 100;
  const expectedIn = Math.max(expectedFromLeads, minimumExpected);
  const revenueLeak = Math.max(0, expectedIn - receiptUsd);
  const netAfterPayroll = receiptUsd - payrollCore;

  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set("wp-tags-issued", String(tags));
  set("wp-receipts-count", String(receiptCount));
  set("wp-receipt-total", _txnFormatUsd(receiptUsd));
  set("wp-unpaid-count", String(unpaid));
  set("wp-expected-in", _txnFormatUsd(expectedIn));
  set("wp-minimum-in", _txnFormatUsd(minimumExpected));
  set("wp-lead-price-total", _txnFormatUsd(expectedFromLeads));
  set("wp-revenue-leak", _txnFormatUsd(revenueLeak));
  set("wp-net-after-payroll", _txnFormatUsd(netAfterPayroll));
  set("wp-pay-tags", String(tags));
  set("wp-pay-tags-dup", String(tags));
  set("wp-pay-tags-dup2", String(tags));
  set("wp-pay-issuer", _txnFormatUsd(issuerPay));
  set("wp-pay-dispatcher", _txnFormatUsd(dispPay));
  set("wp-pay-finder", _txnFormatUsd(finderPay));
  set("wp-payroll-total", _txnFormatUsd(totalPay));
  set("wp-payroll-core", _txnFormatUsd(payrollCore));

  const periodEl = document.getElementById("wp-period-label");
  if (periodEl) {
    const end = new Date();
    const start = new Date(_wpRollingStartMs(7));
    periodEl.innerHTML = `Rolling 7 days (NJ): ${formatNy(start.toISOString())} → ${formatNy(
      end.toISOString()
    )} · <a href="/FridayPayday" style="color:#34d399">Friday Payday →</a>`;
  }

  _wpRenderUnpaidTable(weekRows);
}

const WP_CHART_CACHE_KEY = "krab_wp_chart_rows_v1";
const WP_CHART_CACHE_TTL_MS = 10 * 60 * 1000;

function _wpLoadChartCache() {
  try {
    const raw = sessionStorage.getItem(WP_CHART_CACHE_KEY);
    if (!raw) return null;
    const { ts, rows } = JSON.parse(raw);
    if (!Array.isArray(rows) || Date.now() - ts > WP_CHART_CACHE_TTL_MS) return null;
    return rows;
  } catch (_) {
    return null;
  }
}

function _wpSaveChartCache(rows) {
  try {
    sessionStorage.setItem(WP_CHART_CACHE_KEY, JSON.stringify({ ts: Date.now(), rows }));
  } catch (_) {
    /* quota — the crawl just reruns next load */
  }
}

async function _wpFetchAllTransactions() {
  // History crawl for the chart: pages are fetched in parallel batches of 5
  // (~30 serial round trips become ~3 waves). Stops at the first short page.
  const pageSize = 500;
  const maxItems = 15000;
  const batchSize = 5;
  const all = [];
  let offset = 0;
  for (;;) {
    const offsets = Array.from({ length: batchSize }, (_, i) => offset + i * pageSize);
    const pages = await Promise.all(
      offsets.map((o) =>
        requestWithAdminJson(`/transactions/full?limit=${pageSize}&offset=${o}&period=all`)
      )
    );
    let sawShortPage = false;
    for (const res of pages) {
      if (!res.ok) throw new Error(res.error || "FETCH_FAILED");
      const page = Array.isArray(res.data) ? res.data : [];
      all.push(...page);
      if (page.length < pageSize) {
        sawShortPage = true;
        break;
      }
    }
    offset += batchSize * pageSize;
    if (sawShortPage || all.length >= maxItems) break;
  }
  return all;
}

async function refreshWeeklyPerformance() {
  if (!hasAdminPassword()) return;
  if (_wpLoading) return;
  const statusEl = document.getElementById("wp-status");
  _wpLoading = true;
  if (statusEl) statusEl.textContent = "Loading weekly performance…";

  try {
    const [weekRes, receiptsRes] = await Promise.all([
      requestWithAdminJson("/transactions/full?limit=400&period=1w"),
      issuerApiJson("/issuer-admin/receipts/submitted?limit=500"),
    ]);
    if (!hasAdminPassword()) return;

    const weekRows = weekRes.ok && Array.isArray(weekRes.data) ? weekRes.data : [];
    _wpWeekReceipts =
      receiptsRes.ok && Array.isArray(receiptsRes.data) ? receiptsRes.data : [];

    _wpRenderCurrentWeek(weekRows, _wpWeekReceipts);

    const rangeEl = document.getElementById("wp-chart-range");
    let maxWeeks = 104;
    if (rangeEl) {
      const v = String(rangeEl.value || "104");
      maxWeeks = v === "all" ? null : parseInt(v, 10) || 104;
    }

    const drawFrom = (rows, note) => {
      const buckets = _wpBuildWeeklyBuckets(rows, maxWeeks);
      _wpDrawChart(document.getElementById("wp-chart"), buckets);
      if (statusEl) {
        const wkNote = weekRes.ok ? "" : " (current-week API partial — check password)";
        statusEl.textContent =
          `Chart: ${buckets.length} week(s) from ${rows.length} transactions.${note || ""}${wkNote}`;
      }
    };

    if (_wpChartRows.length === 0) {
      const cached = _wpLoadChartCache();
      if (cached) _wpChartRows = cached;
    }

    if (_wpChartRows.length > 0) {
      drawFrom(_wpChartRows, "");
    } else {
      // Paint the chart NOW from this week's rows, then upgrade to full
      // history in the background — the page never blocks on the crawl.
      drawFrom(weekRows, " · loading full history…");
      _wpFetchAllTransactions()
        .then((rows) => {
          if (!hasAdminPassword()) return;
          _wpChartRows = rows;
          _wpSaveChartCache(rows);
          drawFrom(rows, "");
        })
        .catch((e) => {
          console.error("wp history crawl:", e);
          if (statusEl) statusEl.textContent = "Chart shows current week only (history fetch failed).";
        });
    }
  } catch (e) {
    console.error(e);
    if (statusEl) {
      statusEl.textContent =
        e && String(e.message || e).startsWith("NETWORK:")
          ? "API unreachable — check krab-dispatch-api on Render."
          : "Failed to load weekly performance: " + (e && e.message ? e.message : String(e));
    }
  } finally {
    _wpLoading = false;
  }
}

function setupWeeklyPerformanceEvents() {
  const refreshBtn = document.getElementById("wp-refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      _wpChartRows = [];
      try { sessionStorage.removeItem(WP_CHART_CACHE_KEY); } catch (_) {}
      refreshWeeklyPerformance();
    });
  }
  const rangeEl = document.getElementById("wp-chart-range");
  if (rangeEl) {
    try {
      const saved = localStorage.getItem(KRAB_WP_CHART_RANGE_KEY);
      if (saved) rangeEl.value = saved;
    } catch (_) {}
    rangeEl.addEventListener("change", () => {
      try {
        localStorage.setItem(KRAB_WP_CHART_RANGE_KEY, rangeEl.value);
      } catch (_) {}
      if (_wpChartRows.length) {
        const maxWeeks =
          rangeEl.value === "all" ? null : parseInt(rangeEl.value, 10) || 104;
        _wpDrawChart(
          document.getElementById("wp-chart"),
          _wpBuildWeeklyBuckets(_wpChartRows, maxWeeks)
        );
      } else if (hasAdminPassword()) {
        refreshWeeklyPerformance();
      }
    });
  }
  window.addEventListener("resize", () => {
    if (!_wpChartRows.length) return;
    const rangeEl2 = document.getElementById("wp-chart-range");
    const maxWeeks =
      rangeEl2 && rangeEl2.value === "all"
        ? null
        : parseInt((rangeEl2 && rangeEl2.value) || "104", 10) || 104;
    _wpDrawChart(
      document.getElementById("wp-chart"),
      _wpBuildWeeklyBuckets(_wpChartRows, maxWeeks)
    );
  });
}

// ==========================================================================
// Work status (manual per-transaction workflow flag, separate from delivery
// status). Rendered as a compact <select> under the delivery pill in both the
// unified Transactions table and the Summary table. Saved via
// PATCH /transactions/{id}/work-status.
// ==========================================================================

const WORK_STATUS_OPTIONS = [
  { value: "", label: "—" },
  { value: "working_on_it", label: "working on it" },
  { value: "stuck", label: "stuck" },
  { value: "in_progress", label: "in progress" },
  { value: "done", label: "done" },
];

function workStatusModifierClass(value) {
  if (value === "done") return "ws-done";
  if (value === "stuck") return "ws-stuck";
  if (value === "working_on_it" || value === "in_progress") return "ws-active";
  return "";
}

function workStatusSelectHtml(row) {
  if (!row || row.id == null || String(row.id).trim() === "") return "";
  const current = String(row.work_status || "");
  const mod = workStatusModifierClass(current);
  const opts = WORK_STATUS_OPTIONS.map(
    (o) =>
      `<option value="${o.value}"${o.value === current ? " selected" : ""}>${o.label}</option>`
  ).join("");
  return (
    `<select class="work-status-select${mod ? " " + mod : ""}"` +
    ` data-work-status-id="${escapeHtmlAttr(String(row.id))}"` +
    ` data-ws-prev="${escapeHtmlAttr(current)}">${opts}</select>`
  );
}

function applyWorkStatusTint(sel) {
  sel.classList.remove("ws-done", "ws-stuck", "ws-active");
  const mod = workStatusModifierClass(sel.value);
  if (mod) sel.classList.add(mod);
}

// Keeps the in-memory row objects in sync so a later re-render (without a
// refetch) still shows the saved status.
function updateWorkStatusInRows(id, status) {
  const idStr = String(id);
  for (const r of _txnRows || []) {
    if (r && String(r.id) === idStr) r.work_status = status;
  }
  const items = (lastSummary && lastSummary.items) || [];
  for (const it of items) {
    if (it && String(it.id) === idStr) it.work_status = status;
  }
}

async function commitWorkStatusChange(sel) {
  const id = sel.getAttribute("data-work-status-id") || "";
  if (!id) return;
  const prev = sel.getAttribute("data-ws-prev") || "";
  const next = sel.value || "";
  if (next === prev) return;
  sel.disabled = true;
  const res = await requestWithAdminJson(
    `/transactions/${encodeURIComponent(id)}/work-status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next || null }),
    }
  );
  sel.disabled = false;
  // A 2xx with an empty/non-JSON body (e.g. 204) is still a saved write.
  const saved = res.ok || (res.status >= 200 && res.status < 300);
  if (saved) {
    sel.setAttribute("data-ws-prev", next);
    updateWorkStatusInRows(id, next || null);
    applyWorkStatusTint(sel);
  } else {
    alert("Could not save status");
    sel.value = prev;
    applyWorkStatusTint(sel);
  }
}

function _txnStatusCell(row) {
  const s = ((row && row.delivery_status) || "").toUpperCase();
  const wsSelect = workStatusSelectHtml(row);
  if (!s) return '<span class="muted">—</span>' + wsSelect;
  const klass =
    s === "DELIVERED"
      ? "delivered"
      : s === "PENDING"
      ? "pending"
      : "failed";
  return `<span class="pill ${klass}">${escapeIssuerText(s)}</span>${wsSelect}`;
}

function _txnMatches(row, qLower) {
  if (!qLower) return true;
  const fields = [
    row.reference_id,
    row.tag_name,
    row.price,
    row.receipt_price,
    row.issuer_group,
    row.issuer_submitter_handle,
    row.dispatcher_name,
    row.dispatcher_handle,
    row.driver_selected_name,
    row.driver_recipient_email,
    row.driver_accepted && row.driver_accepted.driver_name,
    row.filename,
  ];
  for (const h of row.driver_history || []) {
    fields.push(h && h.driver_name);
  }
  return fields.some((v) =>
    v && String(v).toLowerCase().includes(qLower)
  );
}

function renderUnifiedTransactions() {
  const tbody = document.getElementById("txn-tbody");
  if (!tbody) return;
  const q = (
    (document.getElementById("txn-search-input") || {}).value || ""
  )
    .trim()
    .toLowerCase();
  const rows = (_txnRows || []).filter((r) => _txnMatches(r, q));
  tbody.innerHTML = "";
  if (rows.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 11;
    td.className = "muted";
    td.textContent = _txnLoading
      ? "Loading…"
      : "No transactions yet. Send a document through Krab Dispatch.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    renderTxnDispatcherGroups([]);
    return;
  }
  let priceSum = 0;
  let priceCount = 0;
  let receiptPriceSum = 0;
  let receiptPriceCount = 0;

  // Group rows by dispatcher (lead creator) with section headers.
  const grouped = new Map();
  const groupOrder = [];
  for (const r of rows) {
    const handle = _txnResolveDispatcherHandle(r);
    if (!grouped.has(handle)) {
      grouped.set(handle, []);
      groupOrder.push(handle);
    }
    grouped.get(handle).push(r);
  }
  groupOrder.sort((a, b) => {
    if (a === "unknown") return 1;
    if (b === "unknown") return -1;
    const da = grouped.get(a).filter(_wpIsTagIssued).length;
    const db = grouped.get(b).filter(_wpIsTagIssued).length;
    return db - da || grouped.get(b).length - grouped.get(a).length || a.localeCompare(b);
  });

  let rowNum = 0;
  tbody.innerHTML = "";
  priceSum = 0;
  priceCount = 0;
  receiptPriceSum = 0;
  receiptPriceCount = 0;

  for (const handle of groupOrder) {
    const groupRows = grouped.get(handle) || [];
    const slug = _txnDispatcherSlug(handle);
    const delivered = groupRows.filter(_wpIsTagIssued).length;
    const headerTr = document.createElement("tr");
    headerTr.className = "txn-dispatcher-group-header";
    const label =
      handle === "unknown"
        ? "Unknown dispatcher"
        : `@${escapeIssuerText(handle)}`;
    const paydayLink =
      handle !== "unknown"
        ? ` <a href="/fridaypayday/${encodeURIComponent(slug)}" class="txn-dispatcher-payday-link">Payroll →</a>`
        : "";
    headerTr.innerHTML =
      `<td colspan="11" style="text-align:left;background:var(--accent-soft,#f0fdf4);font-weight:600;padding:0.55rem 0.65rem;">` +
      `${label} — ${delivered} delivered · ${groupRows.length} row${groupRows.length === 1 ? "" : "s"}${paydayLink}` +
      `</td>`;
    tbody.appendChild(headerTr);

    for (const r of groupRows) {
      rowNum += 1;
      const tr = document.createElement("tr");
      const parsed = _txnParsePrice(r && r.price);
      if (parsed > 0) {
        priceSum += parsed;
        priceCount += 1;
      }
      const parsedReceipt = _txnParsePrice(r && r.receipt_price);
      if (parsedReceipt > 0) {
        receiptPriceSum += parsedReceipt;
        receiptPriceCount += 1;
      }
      tr.innerHTML =
        `<td>${rowNum}</td>` +
        `<td class="small">${escapeIssuerText(formatNy(r.timestamp_ny))}</td>` +
        `<td style="text-align:left;max-width:12rem;white-space:normal;">${
          r.tag_name
            ? escapeIssuerText(r.tag_name)
            : `<span class="muted">${escapeIssuerText(r.filename || "—")}</span>`
        }</td>` +
        `<td style="text-align:left;max-width:14rem;white-space:normal;">${_txnIssuerCell(r)}</td>` +
        `<td style="text-align:left;max-width:14rem;white-space:normal;">${_txnDriverCell(r)}</td>` +
        `<td style="text-align:left;white-space:normal;">${_txnDispatcherCell(r)}</td>` +
        `<td>${
          r.reference_id
            ? `<code>${escapeIssuerText(r.reference_id)}</code>`
            : '<span class="muted">—</span>'
        }</td>` +
        `<td>${_txnPriceCell(r)}</td>` +
        `<td>${_txnReceiptPriceCell(r)}</td>` +
        `<td>${_txnReceiptCell(r)}</td>` +
        `<td>${_txnStatusCell(r)}</td>`;
      tbody.appendChild(tr);
    }
  }

  // Spreadsheet-style totals row: sum lead Price and Receipt Price for visible rows.
  const totalTr = document.createElement("tr");
  totalTr.className = "txn-total-row";
  const countText =
    priceCount > 0 || receiptPriceCount > 0
      ? `${priceCount} lead price · ${receiptPriceCount} receipt price`
      : "0 priced";
  totalTr.innerHTML =
    `<td colspan="7" style="text-align:right;font-weight:600;letter-spacing:0.03em;">` +
    `TOTAL <span class="muted" style="font-weight:400;">(${escapeIssuerText(
      countText
    )} of ${rows.length} rows)</span></td>` +
    `<td style="font-weight:700;color:var(--success);">${escapeIssuerText(
      _txnFormatUsd(priceSum)
    )}</td>` +
    `<td style="font-weight:700;color:var(--accent);">${escapeIssuerText(
      _txnFormatUsd(receiptPriceSum)
    )}</td>` +
    `<td colspan="2"></td>`;
  tbody.appendChild(totalTr);

  const statusEl = document.getElementById("txn-status");
  if (statusEl && !_txnLoading) {
    const periodSel = document.getElementById("txn-period-select");
    const rangeLabel =
      periodSel && periodSel.selectedOptions && periodSel.selectedOptions[0]
        ? periodSel.selectedOptions[0].textContent.trim()
        : "";
    const shownLabel =
      rows.length === _txnRows.length
        ? `Showing ${rows.length} transactions`
        : `Showing ${rows.length} of ${_txnRows.length} transactions`;
    statusEl.textContent = `${shownLabel}${rangeLabel ? ` · ${rangeLabel}` : ""} · Lead price total: ${_txnFormatUsd(priceSum)} · Receipt price total: ${_txnFormatUsd(receiptPriceSum)}`;
  }
  renderTxnDispatcherGroups(rows);
}

function updateTxnAuthGate() {
  const noAuth = document.getElementById("txn-no-auth");
  if (!noAuth) return true;
  const pw = getStoredPassword();
  noAuth.style.display = pw ? "none" : "block";
  return !pw;
}

async function refreshUnifiedTransactions(force) {
  // In-flight dedupe + 30s freshness window: the boot path historically fired
  // this 4x (tab activate, applyLoggedInUI x2, explicit boot call) — collapse
  // duplicates onto the single pending request / recent result.
  if (_txnInflight) {
    // A FORCED call (period change, refresh button) during an in-flight fetch
    // must not be swallowed — the fetch already running carries the old
    // period. Queue one re-run with the fresh select state for when it lands.
    if (force) _txnRerunForced = true;
    return _txnInflight;
  }
  if (!force && Date.now() - _txnLastFetch < 30_000 && _txnRows.length > 0) return;
  _txnInflight = _refreshUnifiedTransactionsInner().finally(() => {
    _txnInflight = null;
    if (_txnRerunForced) {
      _txnRerunForced = false;
      refreshUnifiedTransactions(true);
    }
  });
  return _txnInflight;
}

async function _refreshUnifiedTransactionsInner() {
  setTxnBanner("");
  if (updateTxnAuthGate()) {
    setTxnStatus("");
    _txnRows = [];
    renderUnifiedTransactions();
    return;
  }
  _txnLoading = true;
  setTxnStatus("Loading unified transactions…");
  renderUnifiedTransactions();
  const res = await requestWithAdminJson(
    txnTransactionsUrl("/transactions/full", 2000)
  );
  if (!hasAdminPassword()) {
    _txnLoading = false;
    return;
  }
  _txnLoading = false;
  if (!res.ok) {
    const err = res.error || ("HTTP_" + (res.status || 0));
    setTxnBanner(
      err === "UNAUTHORIZED"
        ? "Unauthorized — re-enter admin password or unlock from the Krab Issuer tab."
        : err === "NO_PASSWORD"
        ? "Unlock on the Krab Issuer tab first."
        : "Failed to load: " + err
    );
    setTxnStatus("");
    _txnRows = [];
    renderUnifiedTransactions();
    return;
  }
  _txnRows = Array.isArray(res.data) ? res.data : [];
  if (_txnRows.length === 0) {
    // Forward-step validation fallback: if unified join returns empty, retry with
    // base transactions so dashboard still shows latest activity.
    const basic = await requestWithAdminJson(
      txnTransactionsUrl("/transactions", 200)
    );
    if (!hasAdminPassword()) {
      return;
    }
    if (basic.ok) {
      _txnRows = _mapBasicTxToUnifiedRows(basic.data);
    }
  }
  if (!hasAdminPassword()) {
    return;
  }
  const periodSel = document.getElementById("txn-period-select");
  const rangeLabel =
    periodSel && periodSel.selectedOptions && periodSel.selectedOptions[0]
      ? periodSel.selectedOptions[0].textContent.trim()
      : "";
  setTxnStatus(
    _txnRows.length
      ? `Showing ${_txnRows.length} transactions${
          rangeLabel ? ` · ${rangeLabel}` : ""
        }.`
      : ""
  );
  _txnLastFetch = Date.now();
  renderUnifiedTransactions();
  renderUnifiedDriversTable();
}

function doAdminLogout() {
  storePassword("");
  syncAdminPasswordInputs("");
  clearAdminAuthErrorDisplays();
  _issuerAiSnapshot = null;
  _txnLoading = false;
  _txnInflight = null;
  _txnLastFetch = 0;
  _txnRows = [];
  _wpChartRows = [];
  _wpWeekReceipts = [];
  setTxnBanner("");
  setTxnStatus("");
  renderUnifiedTransactions();
  setIssuerBanner("");
  applyLoggedInUI(false);
}

function maybeRefreshTxnTab() {
  if (transactionsTabActive()) {
    refreshUnifiedTransactions();
  }
}

function setupTxnEvents() {
  const periodSel = document.getElementById("txn-period-select");
  if (periodSel) {
    try {
      const saved = localStorage.getItem(KRAB_TXN_PERIOD_KEY);
      const allowed = new Set([
        "1w",
        "2w",
        "3w",
        "1m",
        "3m",
        "6m",
        "12m",
        "all",
      ]);
      if (saved && allowed.has(saved)) periodSel.value = saved;
    } catch (_) {}
    periodSel.addEventListener("change", () => {
      try {
        localStorage.setItem(KRAB_TXN_PERIOD_KEY, periodSel.value);
      } catch (_) {}
      refreshUnifiedTransactions(true);
    });
  }
  const refresh = document.getElementById("txn-refresh-btn");
  if (refresh) {
    refresh.addEventListener("click", () => refreshUnifiedTransactions(true));
  }
  const search = document.getElementById("txn-search-input");
  if (search) {
    // Debounced: the 2000-row table rebuild is too heavy for per-keystroke.
    let t = null;
    search.addEventListener("input", () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => renderUnifiedTransactions(), 180);
    });
  }
}

function setIssuerBanner(msg) {
  const el = document.getElementById("issuer-banner");
  if (!el) return;
  el.textContent = msg || "";
  el.style.display = msg ? "block" : "none";
}

function updateIssuerAuthGate() {
  const noAuth = document.getElementById("issuer-no-auth");
  const main = document.getElementById("issuer-main-wrap");
  if (!noAuth || !main) return true;
  const pw = getStoredPassword();
  if (!pw) {
    noAuth.style.display = "block";
    main.style.display = "none";
    setIssuerBanner("");
    return true;
  }
  noAuth.style.display = "none";
  main.style.display = "block";
  return false;
}

function issuerFillAssignSelects(groups, drivers) {
  const sg = document.getElementById("issuer-assign-group");
  const sd = document.getElementById("issuer-assign-driver");
  if (!sg || !sd) return;
  const prevG = sg.value;
  const prevD = sd.value;
  sg.innerHTML = "";
  sd.innerHTML = "";
  (groups || []).forEach((g) => {
    const o = document.createElement("option");
    o.value = g.id;
    o.textContent = g.group_name || g.id;
    sg.appendChild(o);
  });
  (drivers || []).forEach((d) => {
    const o = document.createElement("option");
    o.value = d.id;
    o.textContent = d.driver_name || d.id;
    sd.appendChild(o);
  });
  if (prevG && [...sg.options].some((o) => o.value === prevG)) {
    sg.value = prevG;
  }
  if (prevD && [...sd.options].some((o) => o.value === prevD)) {
    sd.value = prevD;
  }
}

function renderIssuerBotUsage(rows) {
  const tb = document.getElementById("issuer-bot-usage-tbody");
  if (!tb) return;
  tb.innerHTML = "";
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.className = "muted";
    td.textContent = "No usage yet.";
    tr.appendChild(td);
    tb.appendChild(tr);
    return;
  }
  list.forEach((u) => {
    const tr = document.createElement("tr");
    const when = document.createElement("td");
    const ca = u.created_at || "";
    when.textContent = ca.length >= 19 ? ca.slice(0, 19) : ca || "—";
    const user = document.createElement("td");
    const un = u.telegram_username ? "@" + u.telegram_username : u.user_telegram_id;
    user.textContent = un || "—";
    const grp = document.createElement("td");
    grp.textContent = u.group_name || "—";
    const drv = document.createElement("td");
    drv.textContent = u.driver_names || "—";
    drv.style.whiteSpace = "normal";
    tr.appendChild(when);
    tr.appendChild(user);
    tr.appendChild(grp);
    tr.appendChild(drv);
    tb.appendChild(tr);
  });
}

function renderIssuerStats(stats) {
  const sumEl = document.getElementById("issuer-stats-summary");
  const tb = document.getElementById("issuer-stats-tbody");
  if (!sumEl || !tb) return;
  const total = stats && stats.total_leads != null ? stats.total_leads : 0;
  sumEl.textContent = "Total leads sent: " + total;
  tb.innerHTML = "";
  const drivers = (stats && stats.drivers) || [];
  if (drivers.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.className = "muted";
    td.textContent = "No drivers.";
    tr.appendChild(td);
    tb.appendChild(tr);
    return;
  }
  drivers.forEach((d) => {
    const tr = document.createElement("tr");
    const a = document.createElement("td");
    a.textContent = d.driver_name || "—";
    const b = document.createElement("td");
    b.textContent = String(d.leads_accepted ?? 0);
    const c = document.createElement("td");
    c.textContent = String(d.receipts_submitted ?? 0);
    tr.appendChild(a);
    tr.appendChild(b);
    tr.appendChild(c);
    tb.appendChild(tr);
  });
}

function renderIssuerContactSources(sources) {
  const tb = document.getElementById("issuer-contact-tbody");
  if (!tb) return;
  tb.innerHTML = "";
  const list = Array.isArray(sources) ? sources : [];
  if (list.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.className = "muted";
    td.textContent = "No sources yet.";
    tr.appendChild(td);
    tb.appendChild(tr);
    return;
  }
  list.forEach((s) => {
    const tr = document.createElement("tr");
    const lab = document.createElement("td");
    lab.textContent = s.label || "—";
    lab.style.textAlign = "left";
    const st = document.createElement("td");
    st.textContent = s.is_active === false ? "Inactive" : "Active";
    const act = document.createElement("td");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-danger-issuer";
    btn.textContent = s.is_active === false ? "Activate" : "Deactivate";
    btn.dataset.toggleContactSource = s.id;
    act.appendChild(btn);
    tr.appendChild(lab);
    tr.appendChild(st);
    tr.appendChild(act);
    tb.appendChild(tr);
  });
}

function renderIssuerAssignments(rows, groups, drivers) {
  const tb = document.getElementById("issuer-assignments-tbody");
  if (!tb) return;
  tb.innerHTML = "";
  const list = Array.isArray(rows) ? rows : [];
  const gmap = Object.fromEntries((groups || []).map((g) => [g.id, g.group_name]));
  const dmap = Object.fromEntries((drivers || []).map((d) => [d.id, d.driver_name]));
  if (list.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.className = "muted";
    td.textContent = "No assignments.";
    tr.appendChild(td);
    tb.appendChild(tr);
    return;
  }
  list.forEach((a) => {
    const tr = document.createElement("tr");
    const g = document.createElement("td");
    g.textContent = a.group_name || gmap[a.group_id] || "—";
    const d = document.createElement("td");
    d.textContent = a.driver_name || dmap[a.driver_id] || "—";
    const act = document.createElement("td");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-danger-issuer";
    btn.textContent = "Remove";
    btn.dataset.removeAssignment = a.id;
    act.appendChild(btn);
    tr.appendChild(g);
    tr.appendChild(d);
    tr.appendChild(act);
    tb.appendChild(tr);
  });
}

function renderIssuerGroups(groups) {
  const tb = document.getElementById("issuer-groups-tbody");
  if (!tb) return;
  tb.innerHTML = "";
  const list = Array.isArray(groups) ? groups : [];
  if (list.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "muted";
    td.textContent = "No groups.";
    tr.appendChild(td);
    tb.appendChild(tr);
    return;
  }
  list.forEach((g) => {
    const tr = document.createElement("tr");
    const nm = document.createElement("td");
    nm.textContent = g.group_name || "—";
    nm.style.textAlign = "left";
    const tg = document.createElement("td");
    tg.innerHTML = "<code>" + escapeIssuerText(g.group_telegram_id || "") + "</code>";
    const sup = document.createElement("td");
    sup.innerHTML = "<code>" + escapeIssuerText(g.supervisory_telegram_id || "") + "</code>";
    const st = document.createElement("td");
    st.textContent = g.is_active === false ? "Inactive" : "Active";
    const act = document.createElement("td");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-danger-issuer";
    btn.textContent = g.is_active === false ? "Activate" : "Deactivate";
    btn.dataset.toggleGroup = g.id;
    act.appendChild(btn);
    tr.appendChild(nm);
    tr.appendChild(tg);
    tr.appendChild(sup);
    tr.appendChild(st);
    tr.appendChild(act);
    tb.appendChild(tr);
  });
}

/** Last drivers list from /issuer-admin/drivers (for Edit prefill). */
let _issuerDriversCache = [];
/** When set, the issuer "Add driver" form updates this driver instead. */
let _issuerEditingDriverId = null;

function setIssuerDriverFormMode(editing) {
  const btn = document.getElementById("issuer-add-driver-btn");
  if (btn) {
    btn.textContent = editing ? "Update driver" : "Add driver";
  }
}

function beginIssuerDriverEdit(driverId) {
  const d = (_issuerDriversCache || []).find(
    (x) => String(x && x.id) === String(driverId)
  );
  if (!d) return;
  const nameEl = document.getElementById("issuer-driver-name");
  const tgEl = document.getElementById("issuer-driver-tg-id");
  const phoneEl = document.getElementById("issuer-driver-phone");
  if (nameEl) nameEl.value = d.driver_name || "";
  if (tgEl) tgEl.value = d.driver_telegram_id || "";
  if (phoneEl) phoneEl.value = d.phone_number || "";
  _issuerEditingDriverId = String(d.id);
  setIssuerDriverFormMode(true);
  if (nameEl && typeof nameEl.focus === "function") nameEl.focus();
}

function resetIssuerDriverForm() {
  _issuerEditingDriverId = null;
  setIssuerDriverFormMode(false);
  const nameEl = document.getElementById("issuer-driver-name");
  const tgEl = document.getElementById("issuer-driver-tg-id");
  const phoneEl = document.getElementById("issuer-driver-phone");
  if (nameEl) nameEl.value = "";
  if (tgEl) tgEl.value = "";
  if (phoneEl) phoneEl.value = "";
}

function renderIssuerDrivers(drivers) {
  const tb = document.getElementById("issuer-drivers-tbody");
  if (!tb) return;
  _cachedIssuerDrivers = Array.isArray(drivers) ? drivers : [];
  tb.innerHTML = "";
  const list = Array.isArray(drivers) ? drivers : [];
  _issuerDriversCache = list;
  if (list.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "muted";
    td.textContent = "No drivers.";
    tr.appendChild(td);
    tb.appendChild(tr);
    renderUnifiedDriversTable();
    return;
  }
  list.forEach((d) => {
    const tr = document.createElement("tr");
    const nm = document.createElement("td");
    nm.textContent = d.driver_name || "—";
    nm.style.textAlign = "left";
    const tg = document.createElement("td");
    tg.innerHTML = "<code>" + escapeIssuerText(d.driver_telegram_id || "") + "</code>";
    const ph = document.createElement("td");
    ph.textContent = d.phone_number || "—";
    const st = document.createElement("td");
    st.textContent = d.is_active === false ? "Inactive" : "Active";
    const act = document.createElement("td");
    act.style.whiteSpace = "nowrap";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "secondary";
    editBtn.textContent = "Edit";
    editBtn.dataset.editDriver = d.id;
    editBtn.style.marginRight = "0.3rem";
    act.appendChild(editBtn);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-danger-issuer";
    btn.textContent = d.is_active === false ? "Activate" : "Deactivate";
    btn.dataset.toggleDriver = d.id;
    btn.style.marginRight = "0.3rem";
    act.appendChild(btn);
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn-danger-issuer";
    delBtn.textContent = "Delete";
    delBtn.dataset.deleteDriver = d.id;
    act.appendChild(delBtn);
    tr.appendChild(nm);
    tr.appendChild(tg);
    tr.appendChild(ph);
    tr.appendChild(st);
    tr.appendChild(act);
    tb.appendChild(tr);
  });
  renderUnifiedDriversTable();
}

function _normalizeDriverNameKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function mergeUnifiedDrivers(recipients, issuerDrivers, txnRows) {
  const map = new Map();

  function upsert(key, patch) {
    const k = key || "unknown";
    const cur = map.get(k) || {
      name: "",
      email: "",
      telegramId: "",
      telegramUsername: "",
      phone: "",
      sources: [],
    };
    if (patch.name) cur.name = patch.name;
    if (patch.email) cur.email = patch.email;
    if (patch.telegramId) cur.telegramId = patch.telegramId;
    if (patch.telegramUsername) cur.telegramUsername = patch.telegramUsername;
    if (patch.phone) cur.phone = patch.phone;
    for (const s of patch.sources || []) {
      if (!cur.sources.includes(s)) cur.sources.push(s);
    }
    map.set(k, cur);
  }

  for (const r of recipients || []) {
    const name = String(r.name || "").trim();
    const key = _normalizeDriverNameKey(name) || `dispatch-email:${r.email || r.id}`;
    upsert(key, { name, email: r.email || "", sources: ["dispatch"] });
  }

  for (const d of issuerDrivers || []) {
    const name = String(d.driver_name || "").trim();
    const tgId = String(d.driver_telegram_id || "").trim();
    const key = _normalizeDriverNameKey(name) || `issuer-tg:${tgId || d.id}`;
    upsert(key, {
      name,
      telegramId: tgId,
      phone: d.phone_number || "",
      sources: ["issuer"],
    });
  }

  for (const row of txnRows || []) {
    const acc = row && row.driver_accepted;
    const name = String(
      (acc && acc.driver_name) || row.driver_selected_name || ""
    ).trim();
    if (!name) continue;
    const key = _normalizeDriverNameKey(name);
    const tgUser =
      (acc && (acc.telegram_username || acc.driver_telegram_username)) || "";
    upsert(key, {
      name,
      email: row.driver_recipient_email || "",
      telegramId: (acc && acc.driver_telegram_id) || "",
      telegramUsername: tgUser,
      sources: ["transactions"],
    });
  }

  return [...map.values()]
    .filter((d) => d.name || d.email || d.telegramId)
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
}

function renderUnifiedDriversTable() {
  const tb = document.getElementById("unified-drivers-tbody");
  if (!tb) return;
  if (!getStoredPassword()) {
    tb.innerHTML =
      '<tr><td colspan="6" class="muted">Unlock to load merged driver directory.</td></tr>';
    return;
  }
  const merged = mergeUnifiedDrivers(
    _cachedDispatchRecipients,
    _cachedIssuerDrivers,
    _txnRows || []
  );
  tb.innerHTML = "";
  if (merged.length === 0) {
    tb.innerHTML =
      '<tr><td colspan="6" class="muted">No drivers in Dispatch recipients or Issuer bot yet.</td></tr>';
    return;
  }
  for (const d of merged) {
    const tr = document.createElement("tr");
    const uname = d.telegramUsername
      ? d.telegramUsername.startsWith("@")
        ? d.telegramUsername
        : `@${d.telegramUsername}`
      : "—";
    tr.innerHTML =
      `<td style="text-align:left">${escapeIssuerText(d.name || "—")}</td>` +
      `<td>${escapeIssuerText(d.email || "—")}</td>` +
      `<td><code>${escapeIssuerText(d.telegramId || "—")}</code></td>` +
      `<td>${escapeIssuerText(uname)}</td>` +
      `<td>${escapeIssuerText(d.phone || "—")}</td>` +
      `<td class="small muted">${escapeIssuerText(d.sources.join(", "))}</td>`;
    tb.appendChild(tr);
  }
}

function renderIssuerAssistants(groups, assistantsByGroup) {
  const host = document.getElementById("issuer-assistants-host");
  if (!host) return;
  host.innerHTML = "";
  const list = Array.isArray(groups) ? groups : [];
  if (list.length === 0) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "No groups yet.";
    host.appendChild(p);
    return;
  }
  list.forEach((g) => {
    const card = document.createElement("div");
    card.className = "assistant-card";
    const title = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = g.group_name || g.id;
    title.appendChild(strong);
    title.appendChild(document.createTextNode(" — assistants"));
    const ul = document.createElement("ul");
    const tids = assistantsByGroup[g.id] || [];
    if (tids.length === 0) {
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = "None yet";
      ul.appendChild(li);
    } else {
      tids.forEach((tid) => {
        const li = document.createElement("li");
        const code = document.createElement("code");
        code.style.fontSize = "0.78rem";
        code.textContent = tid;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-danger-issuer";
        btn.style.marginLeft = "0.35rem";
        btn.textContent = "Remove";
        btn.dataset.removeAssistantGroup = g.id;
        btn.dataset.removeAssistantTid = tid;
        li.appendChild(code);
        li.appendChild(btn);
        ul.appendChild(li);
      });
    }
    const row = document.createElement("div");
    row.className = "field-row";
    const inp = document.createElement("input");
    inp.type = "text";
    inp.placeholder = "Assistant Telegram ID";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.textContent = "Add assistant";
    addBtn.dataset.addAssistantGroup = g.id;
    row.appendChild(inp);
    row.appendChild(addBtn);
    card.appendChild(title);
    card.appendChild(ul);
    card.appendChild(row);
    host.appendChild(card);
  });
}

function renderIssuerDebts(summary) {
  const tb = document.getElementById("issuer-debts-tbody");
  if (!tb) return;
  tb.innerHTML = "";
  const drivers = (summary && summary.drivers) || [];
  const withDebt = drivers.filter((x) => (Number(x.owed_receipts) || 0) > 0);
  if (withDebt.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.className = "muted";
    td.textContent = "No pending receipt debts.";
    tr.appendChild(td);
    tb.appendChild(tr);
    return;
  }
  withDebt.forEach((d) => {
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    name.style.textAlign = "left";
    name.textContent = (d.driver_name || "—") + (d.is_active === false ? " (inactive)" : "");
    const owed = document.createElement("td");
    owed.textContent = String(d.owed_receipts ?? 0);
    const refs = document.createElement("td");
    refs.style.whiteSpace = "normal";
    refs.style.textAlign = "left";
    refs.style.fontSize = "0.74rem";
    (d.pending_references || []).forEach((pr) => {
      const wrap = document.createElement("span");
      wrap.style.display = "inline-block";
      wrap.style.margin = "0.1rem 0.35rem 0 0";
      const code = document.createElement("code");
      code.textContent = pr.reference_id || "—";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-danger-issuer";
      btn.textContent = "×";
      btn.title = "Remove assignment";
      btn.dataset.removeDebtAssignment = pr.assignment_id;
      wrap.appendChild(code);
      wrap.appendChild(document.createTextNode(" "));
      wrap.appendChild(btn);
      refs.appendChild(wrap);
    });
    const act = document.createElement("td");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-danger-issuer";
    btn.textContent = "Clear all pending";
    btn.dataset.clearDebtsDriver = d.driver_id;
    act.appendChild(btn);
    tr.appendChild(name);
    tr.appendChild(owed);
    tr.appendChild(refs);
    tr.appendChild(act);
    tb.appendChild(tr);
  });
}

function renderIssuerSubmitted(rows) {
  const tb = document.getElementById("issuer-submitted-tbody");
  if (!tb) return;
  tb.innerHTML = "";
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "muted";
    td.textContent = "No submitted receipts.";
    tr.appendChild(td);
    tb.appendChild(tr);
    return;
  }
  list.forEach((r) => {
    const tr = document.createElement("tr");
    const ref = document.createElement("td");
    ref.textContent = r.reference_id || "—";
    const dr = document.createElement("td");
    dr.textContent = r.driver_name || "—";
    const gr = document.createElement("td");
    gr.textContent = r.group_name || "—";
    const upd = document.createElement("td");
    const u = r.updated_at || "";
    upd.textContent = u.length >= 19 ? u.slice(0, 19) : u || "—";
    const link = document.createElement("td");
    const refValue =
      r.reference_id && String(r.reference_id).trim().toUpperCase() !== "N/A"
        ? String(r.reference_id).trim()
        : "";
    let linkHtml = receiptLinkHtml(r.receipt_image_url, refValue);
    if (refValue) {
      linkHtml +=
        `<img src="${escapeHtmlAttr(receiptViewUrl(refValue))}" loading="lazy" ` +
        `alt="Receipt ${escapeHtmlAttr(refValue)}" ` +
        `style="max-width:120px;max-height:150px;object-fit:contain;border-radius:6px;` +
        `border:1px solid var(--border-subtle);display:block;margin-top:4px">`;
    }
    link.innerHTML = linkHtml;
    tr.appendChild(ref);
    tr.appendChild(dr);
    tr.appendChild(gr);
    tr.appendChild(upd);
    tr.appendChild(link);
    tb.appendChild(tr);
  });
}

function renderIssuerRenewals(rows) {
  const tb = document.getElementById("issuer-renewals-tbody");
  if (!tb) return;
  tb.innerHTML = "";
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.className = "muted";
    td.textContent = "No upcoming renewals.";
    tr.appendChild(td);
    tb.appendChild(tr);
    return;
  }
  list.forEach((r) => {
    const tr = document.createElement("tr");
    const due = document.createElement("td");
    const ds = r.renewal_due_at || "";
    due.textContent = ds.length >= 19 ? ds.slice(0, 19) : ds || "—";
    const ref = document.createElement("td");
    ref.textContent = r.reference_id || "—";
    const cl = document.createElement("td");
    cl.textContent = r.client_name || "—";
    cl.style.maxWidth = "8rem";
    cl.style.whiteSpace = "normal";
    const gr = document.createElement("td");
    gr.textContent = r.group_name || "—";
    const dr = document.createElement("td");
    dr.textContent = r.driver_name || "—";
    const st = document.createElement("td");
    st.textContent = r.status || "—";
    const days = document.createElement("td");
    days.textContent = r.days_left != null ? String(r.days_left) : "—";
    tr.appendChild(due);
    tr.appendChild(ref);
    tr.appendChild(cl);
    tr.appendChild(gr);
    tr.appendChild(dr);
    tr.appendChild(st);
    tr.appendChild(days);
    tb.appendChild(tr);
  });
}

function applyIssuerSettingsUi(settings) {
  const choose = !!(settings && settings.assistants_choose_group);
  const mode =
    settings && settings.receipt_detection_mode === "strict" ? "strict" : "lax";
  const flowLabel = document.getElementById("issuer-lead-flow-label");
  const btnMode = document.getElementById("issuer-toggle-assistants-mode");
  const recLabel = document.getElementById("issuer-receipt-mode-label");
  if (flowLabel) {
    flowLabel.textContent = choose
      ? "Current: assistants choose group."
      : "Current: assigned groups only.";
  }
  if (btnMode) {
    btnMode.textContent = choose
      ? "Use assigned groups only"
      : "Allow assistants to choose group";
  }
  if (recLabel) {
    recLabel.textContent =
      mode === "strict"
        ? "Current: strict ($ on receipt)."
        : "Current: lax (match amount).";
  }
  const stIn = document.getElementById("issuer-st-telegram-id");
  if (stIn && settings) {
    stIn.value = settings.st_telegram_id || "";
  }
}

let _issuerInflight = null;
let _issuerLastFetch = 0;

async function refreshIssuerAdmin(force) {
  // This is a 10+N request suite — dedupe concurrent calls and skip repeats
  // within 60s. Mutation handlers pass force=true so post-edit reloads always run.
  if (_issuerInflight) return _issuerInflight;
  if (!force && Date.now() - _issuerLastFetch < 60_000) return;
  _issuerLastFetch = Date.now();
  _issuerInflight = _refreshIssuerAdminInner().finally(() => {
    _issuerInflight = null;
  });
  return _issuerInflight;
}

async function _refreshIssuerAdminInner() {
  setIssuerBanner("");
  if (updateIssuerAuthGate()) {
    _issuerLastFetch = 0; // locked — don't count this as a fetch
    return;
  }
  const dtb = document.getElementById("issuer-drivers-tbody");
  if (dtb) {
    dtb.innerHTML =
      '<tr><td colspan="5" class="muted">Loading drivers…</td></tr>';
  }

  const [gRes, dRes] = await Promise.all([
    issuerApiJson("/issuer-admin/groups"),
    issuerApiJson("/issuer-admin/drivers"),
  ]);
  if (!hasAdminPassword()) {
    return;
  }
  if (gRes.status === 401 || dRes.status === 401) {
    setIssuerBanner("Session expired. Re-enter password on the Krab Issuer tab.");
    return;
  }

  const drivers = dRes.ok && Array.isArray(dRes.data) ? dRes.data : [];
  if (dRes.ok) {
    renderIssuerDrivers(drivers);
  } else if (dtb) {
    dtb.innerHTML =
      '<tr><td colspan="5" class="muted">Could not load drivers.</td></tr>';
  }

  if (!gRes.ok) {
    setIssuerBanner(
      gRes.status === 503
        ? "Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the API server."
        : gRes.error || "Could not load groups."
    );
    return;
  }
  const groups = Array.isArray(gRes.data) ? gRes.data : [];

  const [setRes, aRes, cRes, bRes, stRes, rdRes, subRes, renRes] =
    await Promise.all([
      issuerApiJson("/issuer-admin/settings"),
      issuerApiJson("/issuer-admin/assignments"),
      issuerApiJson("/issuer-admin/contact-sources"),
      issuerApiJson("/issuer-admin/bot-usage?limit=100"),
      issuerApiJson("/issuer-admin/stats"),
      issuerApiJson("/issuer-admin/receipt-debts/summary"),
      issuerApiJson("/issuer-admin/receipts/submitted?limit=80"),
      issuerApiJson("/issuer-admin/renewals/upcoming"),
    ]);
  if (!hasAdminPassword()) {
    return;
  }
  const softErr = [setRes, aRes, cRes, bRes, stRes, rdRes, subRes, renRes].find(
    (x) => !x.ok && x.status !== 503
  );
  if (softErr && softErr.status === 401) {
    setIssuerBanner("Session expired. Re-enter password on the Krab Issuer tab.");
    return;
  }
  const settings = setRes.ok && setRes.data ? setRes.data : {};
  const assignments = aRes.ok && Array.isArray(aRes.data) ? aRes.data : [];
  const contacts = cRes.ok && Array.isArray(cRes.data) ? cRes.data : [];
  const botUsage = bRes.ok && Array.isArray(bRes.data) ? bRes.data : [];
  const stats = stRes.ok && stRes.data ? stRes.data : { total_leads: 0, drivers: [] };
  const debts = rdRes.ok && rdRes.data ? rdRes.data : { drivers: [] };
  const submitted = subRes.ok && Array.isArray(subRes.data) ? subRes.data : [];
  const renewals = renRes.ok && Array.isArray(renRes.data) ? renRes.data : [];

  if (!hasAdminPassword()) {
    return;
  }
  applyIssuerSettingsUi(settings);
  issuerFillAssignSelects(groups, drivers);
  renderIssuerBotUsage(botUsage);
  renderIssuerStats(stats);
  renderIssuerContactSources(contacts);
  renderIssuerAssignments(assignments, groups, drivers);
  renderIssuerGroups(groups);
  renderIssuerDebts(debts);
  renderIssuerSubmitted(submitted);
  renderIssuerRenewals(renewals);

  const asstResults = await Promise.all(
    groups.map((g) => issuerApiJson("/issuer-admin/groups/" + g.id + "/assistants"))
  );
  if (!hasAdminPassword()) {
    return;
  }
  const assistantsByGroup = {};
  groups.forEach((g, i) => {
    const r = asstResults[i];
    assistantsByGroup[g.id] = r.ok && Array.isArray(r.data) ? r.data : [];
  });
  renderIssuerAssistants(groups, assistantsByGroup);

  _issuerAiSnapshot = {
    source: "krab_issuer_admin",
    group_count: groups.length,
    driver_count: drivers.length,
    assignment_count: assignments.length,
    contact_source_count: contacts.length,
    assistants_group_count: groups.filter(
      (g) => (assistantsByGroup[g.id] || []).length > 0
    ).length,
    settings: {
      assistants_choose_group: !!settings.assistants_choose_group,
      receipt_detection_mode: settings.receipt_detection_mode || "",
    },
    stats_total_leads: stats.total_leads,
    stats_drivers_headline: Array.isArray(stats.drivers)
      ? stats.drivers.slice(0, 12)
      : [],
    debt_rows: Array.isArray(debts.drivers) ? debts.drivers.length : 0,
    submitted_recent: submitted.length,
    renewals_upcoming: renewals.length,
    sample_group_names: groups
      .slice(0, 15)
      .map((g) => g.group_name || "")
      .filter(Boolean),
    sample_driver_names: drivers
      .slice(0, 20)
      .map((d) => d.driver_name || "")
      .filter(Boolean),
  };

  const warn = [dRes, setRes, aRes, cRes, bRes, stRes, rdRes, subRes, renRes].filter(
    (x) => !x.ok
  );
  if (warn.length) {
    setIssuerBanner(
      "Some sections failed to load (" +
        warn.map((w) => w.error || "error").join("; ") +
        "). Check API logs."
    );
  }
}

function setupIssuerAdminEvents() {
  const refreshBtn = document.getElementById("issuer-refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => refreshIssuerAdmin());
  }

  const btnAssist = document.getElementById("issuer-toggle-assistants-mode");
  if (btnAssist) {
    btnAssist.addEventListener("click", async () => {
      const cur = await issuerApiJson("/issuer-admin/settings");
      if (!cur.ok) {
        alert(cur.error || "Could not read settings");
        return;
      }
      const next = !cur.data.assistants_choose_group;
      const res = await issuerApiJson("/issuer-admin/settings", {
        method: "POST",
        body: JSON.stringify({ assistants_choose_group: next }),
      });
      if (!res.ok) {
        alert(res.error || "Could not update");
        return;
      }
      await refreshIssuerAdmin();
    });
  }

  const rs = document.getElementById("issuer-set-receipt-strict");
  const rl = document.getElementById("issuer-set-receipt-lax");
  async function postReceiptMode(mode) {
    const res = await issuerApiJson("/issuer-admin/settings", {
      method: "POST",
      body: JSON.stringify({ receipt_detection_mode: mode }),
    });
    if (!res.ok) {
      alert(res.error || "Could not update");
      return;
    }
    await refreshIssuerAdmin();
  }
  if (rs) rs.addEventListener("click", () => postReceiptMode("strict"));
  if (rl) rl.addEventListener("click", () => postReceiptMode("lax"));

  const saveSt = document.getElementById("issuer-save-st-btn");
  if (saveSt) {
    saveSt.addEventListener("click", async () => {
      const v = document.getElementById("issuer-st-telegram-id");
      const raw = v ? v.value.trim() : "";
      const res = await issuerApiJson("/issuer-admin/settings", {
        method: "POST",
        body: JSON.stringify({ st_telegram_id: raw }),
      });
      if (!res.ok) {
        alert(res.error || "Could not save");
        return;
      }
      await refreshIssuerAdmin();
    });
  }

  const addG = document.getElementById("issuer-add-group-btn");
  if (addG) {
    addG.addEventListener("click", async () => {
      const name = document.getElementById("issuer-group-name").value.trim();
      const gtg = document.getElementById("issuer-group-tg-id").value.trim();
      const sup = document.getElementById("issuer-group-supervisory-id").value.trim();
      if (!name || !gtg || !sup) {
        alert("Fill group name, group Telegram ID, and supervisory ID.");
        return;
      }
      const res = await issuerApiJson("/issuer-admin/groups", {
        method: "POST",
        body: JSON.stringify({
          group_name: name,
          group_telegram_id: gtg,
          supervisory_telegram_id: sup,
        }),
      });
      if (!res.ok) {
        alert(res.error || "Could not add group");
        return;
      }
      document.getElementById("issuer-group-name").value = "";
      document.getElementById("issuer-group-tg-id").value = "";
      document.getElementById("issuer-group-supervisory-id").value = "";
      await refreshIssuerAdmin();
    });
  }

  const addD = document.getElementById("issuer-add-driver-btn");
  if (addD) {
    addD.addEventListener("click", async () => {
      const name = document.getElementById("issuer-driver-name").value.trim();
      const tg = document.getElementById("issuer-driver-tg-id").value.trim();
      const phone = document.getElementById("issuer-driver-phone").value.trim();
      if (!name || !tg) {
        alert("Driver name and Telegram ID are required.");
        return;
      }
      if (_issuerEditingDriverId) {
        const res = await issuerApiJson(
          "/issuer-admin/drivers/" + encodeURIComponent(_issuerEditingDriverId),
          {
            method: "PUT",
            body: JSON.stringify({
              driver_name: name,
              driver_telegram_id: tg,
              phone_number: phone,
            }),
          }
        );
        if (!res.ok) {
          alert(res.error || "Could not update driver");
          return;
        }
        resetIssuerDriverForm();
        await refreshIssuerAdmin();
        return;
      }
      const body = { driver_name: name, driver_telegram_id: tg };
      if (phone) body.phone_number = phone;
      // Public path: allow non-authenticated users on the lock screen to
      // register a driver chatID. Read endpoints stay locked behind the
      // admin password.
      const res = await issuerApiJson("/issuer-admin/drivers", {
        method: "POST",
        body: JSON.stringify(body),
        allowAnonymous: true,
      });
      if (!res.ok) {
        alert(res.error || "Could not add driver");
        return;
      }
      document.getElementById("issuer-driver-name").value = "";
      document.getElementById("issuer-driver-tg-id").value = "";
      document.getElementById("issuer-driver-phone").value = "";
      if (hasAdminPassword()) {
        await refreshIssuerAdmin();
      } else {
        alert("Driver added.");
      }
    });
  }

  const addC = document.getElementById("issuer-add-contact-btn");
  if (addC) {
    addC.addEventListener("click", async () => {
      const lab = document.getElementById("issuer-contact-label").value.trim();
      if (!lab) {
        alert("Enter a label.");
        return;
      }
      const res = await issuerApiJson("/issuer-admin/contact-sources", {
        method: "POST",
        body: JSON.stringify({ label: lab, sort_order: 0 }),
      });
      if (!res.ok) {
        alert(res.error || "Could not add");
        return;
      }
      document.getElementById("issuer-contact-label").value = "";
      await refreshIssuerAdmin();
    });
  }

  const assignBtn = document.getElementById("issuer-assign-btn");
  if (assignBtn) {
    assignBtn.addEventListener("click", async () => {
      const gid = document.getElementById("issuer-assign-group").value;
      const did = document.getElementById("issuer-assign-driver").value;
      if (!gid || !did) {
        alert("Choose a group and driver.");
        return;
      }
      const res = await issuerApiJson("/issuer-admin/assignments", {
        method: "POST",
        body: JSON.stringify({ group_id: gid, driver_id: did }),
      });
      if (!res.ok) {
        alert(res.error || "Could not assign (duplicate?)");
        return;
      }
      await refreshIssuerAdmin();
    });
  }

  const gtb = document.getElementById("issuer-groups-tbody");
  if (gtb) {
    gtb.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-toggle-group]");
      if (!btn) return;
      const id = btn.getAttribute("data-toggle-group");
      const res = await issuerApiJson("/issuer-admin/groups/" + id + "/toggle", {
        method: "POST",
      });
      if (!res.ok) {
        alert(res.error || "Toggle failed");
        return;
      }
      await refreshIssuerAdmin();
    });
  }

  const dtb = document.getElementById("issuer-drivers-tbody");
  if (dtb) {
    dtb.addEventListener("click", async (ev) => {
      const editBtn = ev.target.closest("[data-edit-driver]");
      if (editBtn) {
        beginIssuerDriverEdit(editBtn.getAttribute("data-edit-driver"));
        return;
      }
      const delBtn = ev.target.closest("[data-delete-driver]");
      if (delBtn) {
        const id = delBtn.getAttribute("data-delete-driver");
        if (
          !confirm(
            "Delete this driver? If they have lead history the delete is blocked — deactivate instead."
          )
        ) {
          return;
        }
        const res = await issuerApiJson(
          "/issuer-admin/drivers/" + encodeURIComponent(id),
          { method: "DELETE" }
        );
        if (!res.ok) {
          alert(res.error || "Delete failed");
          return;
        }
        if (_issuerEditingDriverId === String(id)) {
          resetIssuerDriverForm();
        }
        await refreshIssuerAdmin();
        return;
      }
      const btn = ev.target.closest("[data-toggle-driver]");
      if (!btn) return;
      const id = btn.getAttribute("data-toggle-driver");
      const res = await issuerApiJson("/issuer-admin/drivers/" + id + "/toggle", {
        method: "POST",
      });
      if (!res.ok) {
        alert(res.error || "Toggle failed");
        return;
      }
      await refreshIssuerAdmin();
    });
  }

  const ctb = document.getElementById("issuer-contact-tbody");
  if (ctb) {
    ctb.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-toggle-contact-source]");
      if (!btn) return;
      const id = btn.getAttribute("data-toggle-contact-source");
      const res = await issuerApiJson(
        "/issuer-admin/contact-sources/" + id + "/toggle",
        { method: "POST" }
      );
      if (!res.ok) {
        alert(res.error || "Toggle failed");
        return;
      }
      await refreshIssuerAdmin();
    });
  }

  const atb = document.getElementById("issuer-assignments-tbody");
  if (atb) {
    atb.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-remove-assignment]");
      if (!btn) return;
      const id = btn.getAttribute("data-remove-assignment");
      if (!confirm("Remove this driver from the group?")) return;
      const res = await issuerApiJson("/issuer-admin/assignments/" + id, {
        method: "DELETE",
      });
      if (!res.ok) {
        alert(res.error || "Remove failed");
        return;
      }
      await refreshIssuerAdmin();
    });
  }

  const debtb = document.getElementById("issuer-debts-tbody");
  if (debtb) {
    debtb.addEventListener("click", async (ev) => {
      const rm = ev.target.closest("[data-remove-debt-assignment]");
      if (rm) {
        const aid = rm.getAttribute("data-remove-debt-assignment");
        if (!confirm("Delete this assignment row? Lead stays in DB.")) return;
        const res = await issuerApiJson(
          "/issuer-admin/receipt-debts/assignments/" + aid,
          { method: "DELETE" }
        );
        if (!res.ok) {
          alert(res.error || "Could not remove");
          return;
        }
        await refreshIssuerAdmin();
        return;
      }
      const cl = ev.target.closest("[data-clear-debts-driver]");
      if (cl) {
        const did = cl.getAttribute("data-clear-debts-driver");
        if (!confirm("Clear ALL pending receipt assignments for this driver?")) return;
        const res = await issuerApiJson(
          "/issuer-admin/receipt-debts/drivers/" + did + "/pending",
          { method: "DELETE" }
        );
        if (!res.ok) {
          alert(res.error || "Could not clear");
          return;
        }
        await refreshIssuerAdmin();
      }
    });
  }

  const host = document.getElementById("issuer-assistants-host");
  if (host) {
    host.addEventListener("click", async (ev) => {
      const add = ev.target.closest("[data-add-assistant-group]");
      if (add) {
        const gid = add.getAttribute("data-add-assistant-group");
        const row = add.closest(".field-row");
        const inp = row ? row.querySelector("input[type=text]") : null;
        const tid = inp ? inp.value.trim() : "";
        if (!tid) {
          alert("Enter a Telegram ID.");
          return;
        }
        const res = await issuerApiJson("/issuer-admin/groups/" + gid + "/assistants", {
          method: "POST",
          body: JSON.stringify({ telegram_id: tid }),
        });
        if (!res.ok) {
          alert(res.error || "Could not add assistant");
          return;
        }
        inp.value = "";
        await refreshIssuerAdmin();
        return;
      }
      const rm = ev.target.closest("[data-remove-assistant-group]");
      if (rm) {
        const gid = rm.getAttribute("data-remove-assistant-group");
        const tid = rm.getAttribute("data-remove-assistant-tid");
        if (!confirm("Remove assistant " + tid + "?")) return;
        const res = await issuerApiJson(
          "/issuer-admin/groups/" +
            gid +
            "/assistants/" +
            encodeURIComponent(tid),
          { method: "DELETE" }
        );
        if (!res.ok) {
          alert(res.error || "Could not remove");
          return;
        }
        await refreshIssuerAdmin();
      }
    });
  }
}

// ==========================================================================
// Driver Track tab — native Leaflet live map (no iframe).
// Data: GET /issuer-admin/tracking/overview + /issuer-admin/tracking/route.
// ==========================================================================

let _trackMap = null;
let _trackMarkers = {}; // driver_id -> L.Marker (pulsing dot)
let _trackTrails = {}; // driver_id -> L.Polyline (amber trail)
let _trackDestMarkers = {}; // session token -> L.Marker (🏁)
let _trackRouteLine = null;
let _trackSelectedToken = null;
let _trackLastDrivers = [];
let _trackTimer = null;
let _trackDidFit = false;
let _trackHours = 8;
let _trackLoading = false;

function setTrackStatus(msg) {
  const el = document.getElementById("track-status");
  if (el) el.textContent = msg || "";
}

function trackDriverIcon() {
  return L.divIcon({
    className: "trk-pulse-icon",
    html: '<div class="trk-pulse"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function trackFlagIcon() {
  return L.divIcon({
    className: "trk-flag-icon",
    html: '<div class="trk-flag">🏁</div>',
    iconSize: [18, 18],
    iconAnchor: [9, 16],
  });
}

function ensureTrackMap() {
  if (_trackMap) return _trackMap;
  const el = document.getElementById("track-map");
  if (!el || typeof L === "undefined") return null;
  _trackMap = L.map(el, { zoomControl: true }).setView([40.7128, -74.006], 10);
  const dark = L.tileLayer(
    "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
    { maxZoom: 20, attribution: "© OpenStreetMap © CARTO" }
  );
  const sat = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19, attribution: "© Esri" }
  );
  dark.addTo(_trackMap);
  L.control
    .layers({ Map: dark, Satellite: sat }, null, {
      position: "topright",
      collapsed: false,
    })
    .addTo(_trackMap);
  return _trackMap;
}

function trackAgoLabel(ts) {
  if (!ts) return "";
  const ms = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(ms)) return "";
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m ago`;
}

function trackStatusPillClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "located" || s === "details_sent") return "delivered";
  if (s === "pending") return "pending";
  return "failed"; // overridden / cancelled / unknown
}

function renderTrackDriverList(drivers) {
  const host = document.getElementById("track-driver-list");
  if (!host) return;
  host.innerHTML = "";
  const list = Array.isArray(drivers) ? drivers : [];
  if (list.length === 0) {
    const span = document.createElement("span");
    span.className = "muted small";
    span.textContent = "No driver pings in the selected window.";
    host.appendChild(span);
    return;
  }
  list.forEach((d) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "track-chip" +
      (d.session_token && d.session_token === _trackSelectedToken
        ? " track-chip-active"
        : "");
    const dot = document.createElement("span");
    dot.className = "trk-live-dot" + (d.live ? " live" : "");
    btn.appendChild(dot);
    const label = document.createElement("span");
    const ago = trackAgoLabel(d.last_ping && d.last_ping.created_at);
    label.textContent =
      (d.driver_name || "Driver " + d.driver_id) + (ago ? " · " + ago : "");
    btn.appendChild(label);
    btn.addEventListener("click", () => {
      if (!d.session_token) {
        setTrackStatus("No tracking session for this driver.");
        return;
      }
      if (_trackSelectedToken === d.session_token) {
        clearTrackRoute();
      } else {
        showTrackRoute(d.session_token);
      }
    });
    host.appendChild(btn);
  });
}

function renderTrackSessions(sessions) {
  const tb = document.getElementById("track-sessions-tbody");
  if (!tb) return;
  tb.innerHTML = "";
  const list = Array.isArray(sessions) ? sessions : [];
  if (list.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.className = "muted";
    td.textContent = "No tracking sessions in the last 48h.";
    tr.appendChild(td);
    tb.appendChild(tr);
    return;
  }
  list.forEach((s) => {
    const tr = document.createElement("tr");
    const ref = document.createElement("td");
    ref.innerHTML = s.reference_id
      ? "<code>" + escapeIssuerText(s.reference_id) + "</code>"
      : '<span class="muted">—</span>';
    const drv = document.createElement("td");
    drv.textContent = s.driver_name || "—";
    const kind = document.createElement("td");
    kind.textContent = s.kind || "—";
    const st = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = "pill " + trackStatusPillClass(s.status);
    pill.textContent = String(s.status || "unknown").toUpperCase();
    st.appendChild(pill);
    const created = document.createElement("td");
    created.className = "small";
    created.textContent = s.created_at ? formatNy(s.created_at) : "—";
    const located = document.createElement("td");
    located.className = "small";
    located.textContent = s.located_at ? formatNy(s.located_at) : "—";
    tr.appendChild(ref);
    tr.appendChild(drv);
    tr.appendChild(kind);
    tr.appendChild(st);
    tr.appendChild(created);
    tr.appendChild(located);
    tb.appendChild(tr);
  });
}

function renderTrackOverview(data) {
  const map = ensureTrackMap();
  const drivers = Array.isArray(data && data.drivers) ? data.drivers : [];
  const trails = (data && data.trails) || {};
  const sessions = Array.isArray(data && data.sessions) ? data.sessions : [];

  if (map) {
    // Pulsing driver markers — moved with setLatLng, removed when stale.
    const seenDrivers = new Set();
    drivers.forEach((d) => {
      if (!d || !d.last_ping || d.last_ping.lat == null || d.last_ping.lng == null) {
        return;
      }
      const key = String(d.driver_id);
      seenDrivers.add(key);
      const ll = [Number(d.last_ping.lat), Number(d.last_ping.lng)];
      const name = String(d.driver_name || "Driver " + key);
      let m = _trackMarkers[key];
      if (!m) {
        m = L.marker(ll, { icon: trackDriverIcon() });
        m.bindTooltip(name, { direction: "top", offset: [0, -10] });
        m.addTo(map);
        _trackMarkers[key] = m;
      } else {
        m.setLatLng(ll);
        m.setTooltipContent(name);
      }
    });
    Object.keys(_trackMarkers).forEach((k) => {
      if (!seenDrivers.has(k)) {
        map.removeLayer(_trackMarkers[k]);
        delete _trackMarkers[k];
      }
    });

    // Amber movement trails.
    const seenTrails = new Set();
    Object.keys(trails).forEach((k) => {
      const pts = (trails[k] || [])
        .filter((p) => Array.isArray(p) && p[0] != null && p[1] != null)
        .map((p) => [Number(p[0]), Number(p[1])]);
      if (pts.length < 2) return;
      seenTrails.add(k);
      let line = _trackTrails[k];
      if (!line) {
        line = L.polyline(pts, { color: "#f59e0b", weight: 3, opacity: 0.65 });
        line.addTo(map);
        _trackTrails[k] = line;
      } else {
        line.setLatLngs(pts);
      }
    });
    Object.keys(_trackTrails).forEach((k) => {
      if (!seenTrails.has(k)) {
        map.removeLayer(_trackTrails[k]);
        delete _trackTrails[k];
      }
    });

    // 🏁 destination markers for sessions with resolved coordinates.
    const seenDest = new Set();
    sessions.forEach((s) => {
      if (!s || !s.token || s.dest_lat == null || s.dest_lng == null) return;
      const key = String(s.token);
      seenDest.add(key);
      const ll = [Number(s.dest_lat), Number(s.dest_lng)];
      const tip =
        (s.driver_name ? s.driver_name + " → " : "") +
        (s.delivery_address || s.reference_id || "destination");
      let m = _trackDestMarkers[key];
      if (!m) {
        m = L.marker(ll, { icon: trackFlagIcon() });
        m.bindTooltip(tip, { direction: "top", offset: [0, -14] });
        m.addTo(map);
        _trackDestMarkers[key] = m;
      } else {
        m.setLatLng(ll);
        m.setTooltipContent(tip);
      }
    });
    Object.keys(_trackDestMarkers).forEach((k) => {
      if (!seenDest.has(k)) {
        map.removeLayer(_trackDestMarkers[k]);
        delete _trackDestMarkers[k];
      }
    });
  }

  renderTrackDriverList(drivers);
  renderTrackSessions(sessions);

  if (map && !_trackDidFit) {
    const pts = [];
    Object.values(_trackMarkers).forEach((m) => pts.push(m.getLatLng()));
    Object.values(_trackDestMarkers).forEach((m) => pts.push(m.getLatLng()));
    if (pts.length > 0) {
      map.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 14 });
      _trackDidFit = true;
    }
  }
}

function clearTrackRoute() {
  _trackSelectedToken = null;
  if (_trackRouteLine && _trackMap) {
    _trackMap.removeLayer(_trackRouteLine);
  }
  _trackRouteLine = null;
  const card = document.getElementById("track-route-card");
  if (card) {
    card.style.display = "none";
    card.innerHTML = "";
  }
  renderTrackDriverList(_trackLastDrivers);
}

async function showTrackRoute(token) {
  _trackSelectedToken = token;
  renderTrackDriverList(_trackLastDrivers);
  const card = document.getElementById("track-route-card");
  if (card) {
    card.style.display = "block";
    card.innerHTML = '<div class="muted small">Loading route…</div>';
  }
  const res = await requestWithAdminJson(
    "/issuer-admin/tracking/route?token=" + encodeURIComponent(token)
  );
  if (_trackSelectedToken !== token) {
    return; // user picked another driver (or cleared) while loading
  }
  if (!res.ok || !res.data || res.data.ok === false) {
    if (card) {
      card.innerHTML =
        '<div class="muted small">Route unavailable (' +
        escapeIssuerText(res.error || "no data") +
        ").</div>";
    }
    return;
  }
  const r = res.data;
  const fromAddr =
    (r.from &&
      (r.from.address ||
        (r.from.lat != null ? r.from.lat + ", " + r.from.lng : ""))) ||
    "—";
  const toAddr =
    (r.to &&
      (r.to.address || (r.to.lat != null ? r.to.lat + ", " + r.to.lng : ""))) ||
    "—";
  if (card) {
    card.innerHTML =
      '<div class="panel-title" style="margin-bottom:0.4rem">' +
      escapeIssuerText(r.driver_name || "Driver") +
      (r.reference_id
        ? ' — <code>' + escapeIssuerText(r.reference_id) + "</code>"
        : "") +
      "</div>" +
      '<div class="small" style="margin-bottom:0.25rem"><strong>FROM</strong> ' +
      escapeIssuerText(fromAddr) +
      "</div>" +
      '<div class="small" style="margin-bottom:0.45rem"><strong>TO</strong> ' +
      escapeIssuerText(toAddr) +
      "</div>" +
      '<div style="display:flex;gap:1.2rem;flex-wrap:wrap;align-items:baseline">' +
      '<div><div class="metric-label">ETA</div>' +
      '<div style="font-size:1.5rem;font-weight:700;color:var(--accent)">' +
      escapeIssuerText(r.eta_label || "—") +
      "</div></div>" +
      '<div><div class="metric-label">Distance</div>' +
      '<div style="font-size:1.1rem;font-weight:600">' +
      escapeIssuerText(r.distance_label || "—") +
      "</div></div>" +
      '<div><div class="metric-label">Status</div><div>' +
      escapeIssuerText(r.status || "—") +
      "</div></div>" +
      "</div>";
  }
  const map = ensureTrackMap();
  if (_trackRouteLine && map) {
    map.removeLayer(_trackRouteLine);
    _trackRouteLine = null;
  }
  const geom = Array.isArray(r.geometry)
    ? r.geometry.filter((p) => Array.isArray(p) && p.length >= 2)
    : [];
  if (map && geom.length >= 2) {
    _trackRouteLine = L.polyline(geom, {
      color: "#6ea3d8",
      weight: 3,
      dashArray: "8 10",
      opacity: 0.9,
    });
    _trackRouteLine.addTo(map);
    map.fitBounds(_trackRouteLine.getBounds().pad(0.2));
  }
}

async function refreshDriverTrack() {
  const map = ensureTrackMap();
  if (map) {
    // Panel was display:none when the map initialized — recalc dimensions.
    setTimeout(() => {
      try {
        map.invalidateSize();
      } catch (_) {
        // ignore
      }
    }, 60);
  }
  if (!getStoredPassword()) {
    setTrackStatus("Unlock to view live tracking.");
    return;
  }
  if (_trackLoading) return;
  _trackLoading = true;
  const res = await requestWithAdminJson(
    "/issuer-admin/tracking/overview?hours=" + encodeURIComponent(_trackHours)
  );
  _trackLoading = false;
  if (!res.ok) {
    setTrackStatus(
      res.error === "UNAUTHORIZED" || res.error === "NO_PASSWORD"
        ? "Unlock to view live tracking."
        : "Failed to load tracking: " + (res.error || "error")
    );
    return;
  }
  const data = res.data || {};
  _trackLastDrivers = Array.isArray(data.drivers) ? data.drivers : [];
  renderTrackOverview(data);
  const liveCount = _trackLastDrivers.filter((d) => d && d.live).length;
  setTrackStatus(
    `${_trackLastDrivers.length} driver(s) · ${liveCount} live · last ${_trackHours}h`
  );
}

function startTrackAutoRefresh() {
  if (_trackTimer) return;
  _trackTimer = setInterval(() => {
    if (!trackTabActive()) {
      stopTrackAutoRefresh();
      return;
    }
    refreshDriverTrack();
  }, 10000);
}

function stopTrackAutoRefresh() {
  if (_trackTimer) {
    clearInterval(_trackTimer);
    _trackTimer = null;
  }
}

function setupTrackEvents() {
  document.querySelectorAll(".track-hours-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const h = parseInt(btn.getAttribute("data-track-hours"), 10);
      if (!Number.isFinite(h)) return;
      _trackHours = h;
      document
        .querySelectorAll(".track-hours-btn")
        .forEach((b) => b.classList.toggle("track-hours-active", b === btn));
      refreshDriverTrack();
    });
  });
  const rf = document.getElementById("track-refresh-btn");
  if (rf) {
    rf.addEventListener("click", () => refreshDriverTrack());
  }
}

async function checkHealth() {
  const pill = document.getElementById("status-pill");
  const text = document.getElementById("status-text");
  try {
    const res = await fetch(API_BASE + "/health");
    const data = await res.json();
    if (data.status === "ok") {
      pill.querySelector(".dot").classList.remove("dot-bad");
      pill.querySelector(".dot").classList.add("dot-ok");
      text.textContent = "API online · " + API_BASE;
    } else {
      text.textContent = "API up but health check is not OK";
    }
  } catch (e) {
    pill.querySelector(".dot").classList.remove("dot-ok");
    pill.querySelector(".dot").classList.add("dot-bad");
    text.textContent = "API unreachable (check Render) · " + API_BASE;
  }
}

function renderTransactions(items) {
  const body = document.getElementById("tx-body");
  body.innerHTML = "";
  if (!items || items.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 10;
    td.className = "muted";
    td.textContent = "No transmissions yet.";
    tr.appendChild(td);
    body.appendChild(tr);
    return;
  }

  const sortedItems = [...items].sort((a, b) => parseItemTimeMs(b) - parseItemTimeMs(a));
  sortedItems.forEach((tx, index) => {
    const tr = document.createElement("tr");

    const tdNum = document.createElement("td");
    tdNum.textContent = String(index + 1);
    tr.appendChild(tdNum);

    const tdTime = document.createElement("td");
    tdTime.textContent = formatNy(tx.timestamp_ny);
    tr.appendChild(tdTime);

    const tdClient = document.createElement("td");
    tdClient.innerHTML = `<strong>${tx.filename}</strong>`;
    tr.appendChild(tdClient);

    const tdTelegram = document.createElement("td");
    tdTelegram.textContent = tx.telegram_name || "—";
    tr.appendChild(tdTelegram);

    const tdDriver = document.createElement("td");
    if (tx.recipient_name) {
      tdDriver.textContent = tx.recipient_name;
    } else {
      tdDriver.textContent = "Not recorded";
    }
    tr.appendChild(tdDriver);

    const tdRef = document.createElement("td");
    tdRef.textContent = (tx.reference_id && String(tx.reference_id).trim()) || "—";
    tr.appendChild(tdRef);

    const tdStatus = document.createElement("td");
    tdStatus.className = "status";
    const pill = document.createElement("span");
    const status = (tx.delivery_status || "").toUpperCase();
    pill.classList.add("pill");
    if (status === "DELIVERED") {
      pill.classList.add("delivered");
    } else if (status === "PENDING") {
      pill.classList.add("pending");
    } else {
      pill.classList.add("failed");
    }
    pill.textContent = status || "UNKNOWN";
    tdStatus.appendChild(pill);
    tr.appendChild(tdStatus);

    body.appendChild(tr);
  });
}

async function refreshTransactions() {
  const body = document.getElementById("tx-body");
  try {
    // Bounded: the Dispatch panel this feeds shows recent activity; the
    // unbounded fetch was the heaviest single request on the unlock path.
    const data = await fetchWithAdmin("/transactions?limit=300");
    if (!hasAdminPassword()) {
      return;
    }
    renderTransactions(data);
  } catch (e) {
    console.error(e);
    if (!body) {
      return;
    }
    body.innerHTML = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 10;
    td.className = "muted";
    td.textContent =
      (e && e.message && String(e.message).startsWith("NETWORK:")
        ? "API unreachable. Check Render service and network, or point admin to the correct API. Base: " +
          API_BASE
        : "Failed to load data. " + (e && e.message ? e.message : "")) +
      "";
    tr.appendChild(td);
    body.appendChild(tr);
  }
}

async function refreshLatest() {
  const el = document.getElementById("latest-tx");
  try {
    const data = await fetchWithAdmin("/transactions/latest");
    if (!hasAdminPassword()) {
      return;
    }
    if (!data) {
      el.textContent = "No transmissions yet.";
      return;
    }
    const refLine =
      data.reference_id && String(data.reference_id).trim()
        ? `<div class="small">Reference: ${String(data.reference_id).trim()}</div>`
        : "";
    const leadLine =
      data.lead_client_name && String(data.lead_client_name).trim()
        ? `<div class="small">Lead: ${String(data.lead_client_name)
            .trim()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")}</div>`
        : "";
    const recLine = data.receipt_image_url
      ? `<div class="small">Receipt: ${receiptLinkHtml(data.receipt_image_url, data.reference_id)}</div>`
      : "";
    el.innerHTML = `
      <div><strong>${data.filename}</strong></div>
      ${refLine}
      ${leadLine}
      ${recLine}
      <div class="small">
        ${data.telegram_name || "—"} · ${formatNy(data.timestamp_ny)}
      </div>
      <div class="small">Driver: ${data.recipient_name || "Not recorded"}</div>
      <div class="small">Status: ${data.delivery_status}</div>
    `;
  } catch (e) {
    console.error(e);
    if (el) {
      el.textContent =
        (e && e.message && String(e.message).startsWith("NETWORK:")
          ? "API unreachable. Base: " + API_BASE
          : "Failed to load latest. " + (e && e.message ? e.message : ""));
    }
  }
}

let lastSummary = null;
/** Last Issuer-admin compact snapshot for AI (Krab Issuer tab). Cleared on logout. */
let _issuerAiSnapshot = null;
let summaryZoomScale = 1;
let txZoomScale = 1;
const summaryAiHistory = [];
const SUMMARY_AI_HISTORY_KEY = "krab_summary_ai_history";

const issuerAiHistory = [];
const ISSUER_AI_HISTORY_KEY = "krab_issuer_ai_history";

function loadSummaryAiHistory() {
  try {
    const raw = sessionStorage.getItem(SUMMARY_AI_HISTORY_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      summaryAiHistory.length = 0;
      for (const m of parsed.slice(-20)) {
        if (!m || !m.role || !m.content) continue;
        summaryAiHistory.push({
          role: String(m.role),
          content: String(m.content),
        });
      }
    }
  } catch {
    // ignore
  }
}

function saveSummaryAiHistory() {
  try {
    sessionStorage.setItem(
      SUMMARY_AI_HISTORY_KEY,
      JSON.stringify(summaryAiHistory.slice(-20))
    );
  } catch {
    // ignore
  }
}

function loadIssuerAiHistory() {
  try {
    const raw = sessionStorage.getItem(ISSUER_AI_HISTORY_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      issuerAiHistory.length = 0;
      for (const m of parsed.slice(-20)) {
        if (!m || !m.role || !m.content) continue;
        issuerAiHistory.push({
          role: String(m.role),
          content: String(m.content),
        });
      }
    }
  } catch {
    // ignore
  }
}

function saveIssuerAiHistory() {
  try {
    sessionStorage.setItem(
      ISSUER_AI_HISTORY_KEY,
      JSON.stringify(issuerAiHistory.slice(-20))
    );
  } catch {
    // ignore
  }
}

function renderIssuerAiLog() {
  const log = document.getElementById("issuer-ai-log");
  if (!log) return;
  log.innerHTML = "";
  if (!issuerAiHistory.length) {
    const div = document.createElement("div");
    div.className = "summary-ai-msg assistant";
    div.textContent = "Ask across Krab Issuer and Krab Dispatch (shared references).";
    log.appendChild(div);
    return;
  }
  for (const m of issuerAiHistory.slice(-16)) {
    const div = document.createElement("div");
    div.className =
      "summary-ai-msg " + (m.role === "user" ? "user" : "assistant");
    div.textContent = m.content;
    log.appendChild(div);
  }
  log.scrollTop = log.scrollHeight;
}

function renderSummaryAiLog() {
  const log = document.getElementById("summary-ai-log");
  if (!log) return;
  log.innerHTML = "";
  if (!summaryAiHistory.length) {
    const div = document.createElement("div");
    div.className = "summary-ai-msg assistant";
    div.textContent =
      "Ask across both bots—for example counts by driver, refs, or receipt status.";
    log.appendChild(div);
    return;
  }
  for (const m of summaryAiHistory.slice(-16)) {
    const div = document.createElement("div");
    div.className =
      "summary-ai-msg " + (m.role === "user" ? "user" : "assistant");
    div.textContent = m.content;
    log.appendChild(div);
  }
  log.scrollTop = log.scrollHeight;
}

function clampSummaryZoom(next) {
  return Math.max(0.05, Math.min(2.5, next));
}

function applySummaryZoom(scale) {
  summaryZoomScale = clampSummaryZoom(scale);
  const table = document.querySelector("#summary-table table");
  if (table) {
    // `zoom` gives practical pinch-like resizing in Chromium-based browsers.
    table.style.zoom = String(summaryZoomScale);
  }
  const resetBtn = document.getElementById("summary-zoom-reset-btn");
  if (resetBtn) {
    resetBtn.textContent = `${Math.round(summaryZoomScale * 100)}%`;
  }
  const resetBtnExpanded = document.getElementById("summary-expanded-zoom-reset-btn");
  if (resetBtnExpanded) {
    resetBtnExpanded.textContent = `${Math.round(summaryZoomScale * 100)}%`;
  }
}

function clampTxZoom(next) {
  return Math.max(0.05, Math.min(2.5, next));
}

function applyTxZoom(scale) {
  txZoomScale = clampTxZoom(scale);
  const table = document.querySelector("#tx-table table");
  if (table) {
    table.style.zoom = String(txZoomScale);
  }
  const resetBtn = document.getElementById("tx-zoom-reset-btn");
  if (resetBtn) {
    resetBtn.textContent = `${Math.round(txZoomScale * 100)}%`;
  }
  const resetBtnExpanded = document.getElementById("tx-expanded-zoom-reset-btn");
  if (resetBtnExpanded) {
    resetBtnExpanded.textContent = `${Math.round(txZoomScale * 100)}%`;
  }
}

function clampTxnUnifiedZoom(next) {
  return Math.max(0.05, Math.min(2.5, next));
}

function applyTxnUnifiedZoom(scale) {
  txnUnifiedZoomScale = clampTxnUnifiedZoom(scale);
  const table = document.querySelector("#txn-ledger-wrapper table");
  if (table) {
    table.style.zoom = String(txnUnifiedZoomScale);
  }
  const resetBtn = document.getElementById("txn-ledger-zoom-reset-btn");
  if (resetBtn) {
    resetBtn.textContent = `${Math.round(txnUnifiedZoomScale * 100)}%`;
  }
  const resetBtnExpanded = document.getElementById(
    "txn-ledger-expanded-zoom-reset-btn"
  );
  if (resetBtnExpanded) {
    resetBtnExpanded.textContent = `${Math.round(txnUnifiedZoomScale * 100)}%`;
  }
}

// Pull a phone-like sequence out of free text (client_details) as a fallback
// when the API doesn't send a dedicated client phone field.
function extractPhoneLike(text) {
  const s = String(text || "");
  const m = s.match(/\+?\d[\d\-\s().]{7,}\d/);
  return m ? m[0].replace(/\s+/g, " ").trim() : "";
}

// Driver phone isn't on each transmission row — join it from the issuer driver
// directory by normalized name.
function buildDriverPhoneMap() {
  const map = {};
  for (const d of _cachedIssuerDrivers || []) {
    const key = _normalizeDriverNameKey(d && d.driver_name);
    if (key && d.phone_number) map[key] = d.phone_number;
  }
  return map;
}

function driverPhoneFor(it, map) {
  return (
    it.recipient_phone ||
    it.driver_phone ||
    (map && map[_normalizeDriverNameKey(it.recipient_name)]) ||
    ""
  );
}

function clientPhoneFor(it) {
  return (
    it.client_phone ||
    it.lead_client_phone ||
    it.customer_phone ||
    it.phone ||
    extractPhoneLike(it.client_details) ||
    ""
  );
}

function clientEmailFor(it) {
  const direct =
    it.client_email || it.lead_client_email || it.customer_email || "";
  if (direct) return String(direct).trim();
  // Fallback: scrape an email out of the free-text client details.
  const m = String(it.client_details || "").match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? m[0] : "";
}

// ==========================================================================
// Live Count — manual per-driver countdown.
// The admin types a base count into any summary row's Live Count input; that
// row becomes the anchor (base_count + anchor_ts stored server-side via
// PUT /live-counts). Rows of the same driver at/after the anchor timestamp
// count down chronologically: base, base-1, base-2, … (may go negative).
// Rows before the anchor, and drivers with no entry, show a blank input.
// ==========================================================================

/** driver_key → { base_count, anchor_ts } from GET /live-counts; null = none loaded. */
let _liveCountsByDriver = null;
/** true when /live-counts was unavailable due to missing/invalid admin password. */
let _liveCountsLocked = false;

function liveCountDriverKey(name) {
  return String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

// One fetch per summary render; sets the module state used by renderSummaryTable.
async function refreshLiveCountsState() {
  _liveCountsByDriver = null;
  _liveCountsLocked = false;
  const res = await requestWithAdminJson("/live-counts");
  if (res.ok && res.data && typeof res.data === "object" && !Array.isArray(res.data)) {
    _liveCountsByDriver = res.data;
  } else if (res.status === 401 || res.error === "NO_PASSWORD") {
    _liveCountsLocked = true;
  }
}

/**
 * Map of summary item → number to display in its Live Count input.
 * Setting a count on any row makes EVERY transaction of that driver show the
 * base number (existing rows all read e.g. 20); each NEW transaction after
 * the anchor then subtracts one (19, 18, …). Items missing a driver
 * name/timestamp, or belonging to a driver with no live-count entry, are
 * absent from the map (blank input).
 */
function computeLiveCountDisplay(items, countsMap) {
  const result = new Map();
  if (!countsMap) return result;
  const byDriver = new Map();
  for (const it of items || []) {
    if (!it) continue;
    const key = liveCountDriverKey(it.recipient_name);
    if (!key) continue;
    const ms = parseItemTimeMs(it);
    if (!Number.isFinite(ms)) continue;
    if (!byDriver.has(key)) byDriver.set(key, []);
    byDriver.get(key).push({ it, ms });
  }
  for (const [key, rows] of byDriver) {
    const entry = countsMap[key];
    if (!entry || entry.base_count == null) continue;
    const base = Number(entry.base_count);
    if (!Number.isFinite(base)) continue;
    const anchorMs = Date.parse(String(entry.anchor_ts || ""));
    if (!Number.isFinite(anchorMs)) continue;
    rows.sort((a, b) => a.ms - b.ms);
    let offset = 0;
    for (const r of rows) {
      // 1s tolerance so the anchor row itself lands in the "show base" bucket
      // even if the stored anchor_ts round-tripped with different precision.
      if (r.ms <= anchorMs + 1000) {
        result.set(r.it, base);
      } else {
        offset += 1;
        result.set(r.it, base - offset);
      }
    }
  }
  return result;
}

async function commitLiveCountEdit(input) {
  const driver = input.getAttribute("data-live-count-driver") || "";
  const ts = input.getAttribute("data-live-count-ts") || "";
  if (!driver || !ts) return;
  const raw = String(input.value || "").trim();
  let base = null;
  if (raw !== "") {
    base = Number(raw);
    if (!Number.isFinite(base)) return;
  }
  input.disabled = true;
  const res = await requestWithAdminJson("/live-counts", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ driver, base_count: base, anchor_ts: ts }),
  });
  input.disabled = false;
  // A 2xx with an empty/non-JSON body (e.g. 204) is still a saved write.
  const saved = res.ok || (res.status >= 200 && res.status < 300);
  if (saved) {
    const key = liveCountDriverKey(driver);
    if (!_liveCountsByDriver) _liveCountsByDriver = {};
    if (base == null) {
      delete _liveCountsByDriver[key];
    } else {
      _liveCountsByDriver[key] = { base_count: base, anchor_ts: ts };
    }
  } else {
    alert("Could not save live count");
  }
  // Repaint from local state: on success the edited row becomes the anchor and
  // later rows of that driver count down; on failure this reverts the input.
  if (lastSummary) renderSummaryTable(lastSummary);
}

// Delegated listeners: table bodies are rebuilt via innerHTML on every render,
// so per-element handlers would be lost. Nothing here fires on render — only
// on actual user input.
function setupWorkStatusAndLiveCountEvents() {
  document.addEventListener("change", (ev) => {
    const el = ev.target;
    if (!el || !el.classList) return;
    if (el.classList.contains("work-status-select")) {
      void commitWorkStatusChange(el);
    } else if (el.classList.contains("live-count-input")) {
      void commitLiveCountEdit(el);
    }
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter") return;
    const el = ev.target;
    if (el && el.classList && el.classList.contains("live-count-input")) {
      // Blur commits via the change listener above (only if the value changed).
      el.blur();
    }
  });
}

function renderSummaryTable(summary) {
  const tbody = document.getElementById("summary-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const items = (summary && summary.items) || [];
  if (items.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 18;
    td.className = "muted";
    td.textContent = "No transmissions in this summary window.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const sorted = [...items].sort((a, b) => parseItemTimeMs(b) - parseItemTimeMs(a));
  const issuerHandleCounts = {};
  for (const it of sorted) {
    const handle = normalizeHandle(it.telegram_handle) || "__unknown__";
    issuerHandleCounts[handle] = (issuerHandleCounts[handle] || 0) + 1;
  }
  const driverPhoneMap = buildDriverPhoneMap();
  const liveCountDisplay = computeLiveCountDisplay(sorted, _liveCountsByDriver);

  for (let i = 0; i < sorted.length; i += 1) {
    const it = sorted[i];
    const tr = document.createElement("tr");

    const tdNum = document.createElement("td");
    tdNum.textContent = String(i + 1);
    tr.appendChild(tdNum);

    const tdTime = document.createElement("td");
    tdTime.textContent = formatNy(it.timestamp_ny);
    tr.appendChild(tdTime);

    const tdPdf = document.createElement("td");
    tdPdf.textContent = it.filename || "—";
    tr.appendChild(tdPdf);

    const tdReceipt = document.createElement("td");
    tdReceipt.className = "small";
    tdReceipt.innerHTML = receiptLinkHtml(it.receipt_image_url, it.reference_id);
    tr.appendChild(tdReceipt);

    const tdReceiptPrice = document.createElement("td");
    const rp =
      it.receipt_price != null && String(it.receipt_price).trim() !== ""
        ? String(it.receipt_price).trim()
        : "";
    tdReceiptPrice.textContent = rp || "—";
    tr.appendChild(tdReceiptPrice);

    const tdPrice = document.createElement("td");
    const p = it.price != null && String(it.price).trim() !== "" ? String(it.price).trim() : "";
    tdPrice.textContent = p || "—";
    tr.appendChild(tdPrice);

    const tdDriverName = document.createElement("td");
    tdDriverName.textContent = it.recipient_name || "—";
    tr.appendChild(tdDriverName);

    // Live Count: manual per-driver countdown (see computeLiveCountDisplay).
    const tdLiveCount = document.createElement("td");
    const liveInput = document.createElement("input");
    liveInput.type = "number";
    liveInput.className = "live-count-input";
    liveInput.placeholder = "—";
    const liveDriverName = String(it.recipient_name || "").trim();
    const liveRowTs = String(it.timestamp_ny || "").trim();
    if (_liveCountsLocked) {
      liveInput.disabled = true;
      liveInput.title = "Unlock to edit";
    } else if (!liveDriverName || !liveRowTs) {
      // Rows without a driver name or timestamp cannot anchor a countdown.
      liveInput.disabled = true;
    } else {
      liveInput.setAttribute("data-live-count-driver", liveDriverName);
      liveInput.setAttribute("data-live-count-ts", liveRowTs);
    }
    const liveVal = liveCountDisplay.get(it);
    if (liveVal != null) liveInput.value = String(liveVal);
    tdLiveCount.appendChild(liveInput);
    tr.appendChild(tdLiveCount);

    const tdDriverPhone = document.createElement("td");
    tdDriverPhone.textContent = driverPhoneFor(it, driverPhoneMap) || "—";
    tr.appendChild(tdDriverPhone);

    const tdClientPhone = document.createElement("td");
    tdClientPhone.textContent = clientPhoneFor(it) || "—";
    tr.appendChild(tdClientPhone);

    const tdClientEmail = document.createElement("td");
    tdClientEmail.textContent = clientEmailFor(it) || "—";
    tr.appendChild(tdClientEmail);

    const tdSuccess = document.createElement("td");
    tdSuccess.textContent =
      (it.delivery_status || "").toUpperCase() === "DELIVERED" ? "YES" : "NO";
    tr.appendChild(tdSuccess);

    const tdStatus = document.createElement("td");
    tdStatus.className = "status";
    const statusPill = document.createElement("span");
    const status = (it.delivery_status || "").toUpperCase();
    statusPill.classList.add("pill");
    if (status === "DELIVERED") {
      statusPill.classList.add("delivered");
    } else if (status === "PENDING") {
      statusPill.classList.add("pending");
    } else {
      statusPill.classList.add("failed");
    }
    statusPill.textContent = status || "UNKNOWN";
    tdStatus.appendChild(statusPill);
    tdStatus.insertAdjacentHTML("beforeend", workStatusSelectHtml(it));
    tr.appendChild(tdStatus);

    const tdCount = document.createElement("td");
    const handleKey = normalizeHandle(it.telegram_handle) || "__unknown__";
    const rawCount = issuerHandleCounts[handleKey] || 0;
    tdCount.textContent = String(rawCount);
    tr.appendChild(tdCount);

    const tdIssuerName = document.createElement("td");
    tdIssuerName.textContent = it.telegram_name || "—";
    tr.appendChild(tdIssuerName);

    const tdIssuerHandle = document.createElement("td");
    tdIssuerHandle.textContent = formatHandleWithAt(it.telegram_handle) || "—";
    tr.appendChild(tdIssuerHandle);

    const tdDriverEmail = document.createElement("td");
    tdDriverEmail.textContent = it.recipient_email || "—";
    tr.appendChild(tdDriverEmail);

    const tdRef = document.createElement("td");
    tdRef.textContent = (it.reference_id && String(it.reference_id).trim()) || "—";
    tr.appendChild(tdRef);

    tbody.appendChild(tr);
  }
}

function renderSummaryIssuerTable(summary) {
  const tbody = document.getElementById("summary-issuer-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const items = (summary && summary.items) || [];
  if (items.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "muted";
    td.textContent = "No issuer data in this summary window.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const grouped = {};
  for (const it of items) {
    const issuerName = it.telegram_name || "Unknown";
    const issuerHandle = formatHandleWithAt(it.telegram_handle) || "—";
    const key = `${issuerName}||${issuerHandle}`;
    if (!grouped[key]) {
      grouped[key] = {
        issuerName,
        issuerHandle,
        total: 0,
        delivered: 0,
        pending: 0,
        failed: 0,
        drivers: new Set(),
      };
    }
    const g = grouped[key];
    g.total += 1;
    const status = (it.delivery_status || "").toUpperCase();
    if (status === "DELIVERED") g.delivered += 1;
    else if (status === "PENDING") g.pending += 1;
    else g.failed += 1;
    if (it.recipient_name) g.drivers.add(it.recipient_name);
  }

  const rows = Object.values(grouped).sort((a, b) => b.total - a.total);
  for (const row of rows) {
    const tr = document.createElement("tr");
    const cells = [
      row.issuerName,
      row.issuerHandle,
      String(row.delivered),
      String(row.pending),
      row.drivers.size > 0 ? Array.from(row.drivers).join(", ") : "—",
    ];
    for (const c of cells) {
      const td = document.createElement("td");
      td.textContent = c;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

function getNyDateKey(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  } catch {
    return "";
  }
}

function answerSummaryQuestion(question) {
  const q = String(question || "").trim().toLowerCase();
  if (!q) return "Please ask a question.";
  if (!lastSummary || !Array.isArray(lastSummary.items)) {
    return "Generate summary first so I can analyze the data.";
  }
  const items = lastSummary.items;
  if (!items.length) return "There are no rows in the current summary window.";

  // Forward-step validation: only answer from loaded rows and clear patterns.
  if (q.includes("how many issuers") && q.includes("today")) {
    const todayNy = getNyDateKey(new Date().toISOString());
    const issuerSet = new Set();
    for (const it of items) {
      if (getNyDateKey(it.timestamp_ny) === todayNy) {
        issuerSet.add((it.telegram_name || "").trim().toLowerCase());
      }
    }
    return `${issuerSet.size} issuer(s) made transactions today (NJ time).`;
  }

  const m = q.match(/how many(?:\s+does)?\s+(@?[a-z0-9_ ]+?)\s+(?:have|made|did)/i);
  if (m && m[1]) {
    const targetRaw = m[1].trim().toLowerCase().replace(/^@/, "");
    let count = 0;
    for (const it of items) {
      const name = (it.telegram_name || "").trim().toLowerCase();
      const handle = normalizeHandle(it.telegram_handle);
      if (name === targetRaw || handle === targetRaw) count += 1;
    }
    return `${targetRaw} has ${count} transaction(s) in the current summary window.`;
  }

  if (q.includes("total")) {
    return `Total transactions in this summary: ${items.length}.`;
  }

  if (q.includes("how are you") || q.includes("how you doing")) {
    return "I am doing great and ready to help with your dashboard data. 😊";
  }

  if (
    (q.includes("which issuer") || q.includes("who")) &&
    (q.includes("most") || q.includes("highest") || q.includes("top"))
  ) {
    const counts = {};
    for (const it of items) {
      const issuer = (it.telegram_name || "Unknown").trim();
      counts[issuer] = (counts[issuer] || 0) + 1;
    }
    let topIssuer = "Unknown";
    let topCount = 0;
    for (const [issuer, n] of Object.entries(counts)) {
      if (n > topCount) {
        topIssuer = issuer;
        topCount = n;
      }
    }
    return `${topIssuer} has the most transactions: ${topCount}.`;
  }

  return "I can answer questions like: 'how many issuers made transactions today?' or 'how many does haru have?'";
}

async function askSummaryWithGpt(question, options = {}) {
  if (!lastSummary || !Array.isArray(lastSummary.items)) {
    return "Generate summary first so I can analyze the data.";
  }
  const q = String(question || "").trim();
  if (!q) {
    return "Please ask a question.";
  }
  const issuerSnap =
    options && options.includeIssuerSnapshot && _issuerAiSnapshot
      ? _issuerAiSnapshot
      : null;
  const payload = {
    question: q,
    history: options.historySlice || summaryAiHistory.slice(-12),
    window:
      (document.getElementById("summary-window") &&
        document.getElementById("summary-window").value) ||
      "1w",
    summary: {
      period_start_ny: lastSummary.period_start_ny,
      period_end_ny: lastSummary.period_end_ny,
      total_transactions: lastSummary.total_transactions,
      delivered: lastSummary.delivered,
      pending: lastSummary.pending,
      failed: lastSummary.failed,
      items: (lastSummary.items || []).slice(0, 300),
    },
    issuer_admin_snapshot: issuerSnap,
  };
  const res = await requestWithAdminJson("/ai/summary-ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    return `AI unavailable (${res.error || "request failed"}).`;
  }
  return (res.data && res.data.answer) || "No answer returned.";
}

// ── Curated client list (Client PDF Name + client phone) ──────────────────
function buildClientListRows() {
  const items = (lastSummary && lastSummary.items) || [];
  const out = [];
  const seen = new Set();
  for (const it of items) {
    const pdf = String((it && it.filename) || "").trim();
    const phone = String(clientPhoneFor(it) || "").trim();
    const email = String(clientEmailFor(it) || "").trim();
    if (!pdf && !phone && !email) continue;
    const key = pdf.toLowerCase() + "|" + phone + "|" + email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ pdf: pdf || "—", phone: phone || "—", email: email || "—" });
  }
  return out;
}

async function openClientListModal() {
  // Need a summary window loaded; generate one on demand.
  if (!lastSummary || !lastSummary.items || lastSummary.items.length === 0) {
    await refreshSummary();
  }
  const rows = buildClientListRows();
  const modal = document.getElementById("client-list-modal");
  const tbody = document.getElementById("client-list-tbody");
  const count = document.getElementById("client-list-count");
  if (!modal || !tbody) return;
  if (rows.length === 0) {
    alert("No client rows in the current summary window. Generate a summary first.");
    return;
  }
  tbody.innerHTML = rows
    .map(
      (r, i) =>
        `<tr>` +
        `<td style="padding:0.35rem 0.5rem; border-bottom:1px solid rgba(15,23,42,0.1); opacity:0.6;">${i + 1}</td>` +
        `<td style="padding:0.35rem 0.5rem; border-bottom:1px solid rgba(15,23,42,0.1);">${escapeIssuerText(r.pdf)}</td>` +
        `<td style="padding:0.35rem 0.5rem; border-bottom:1px solid rgba(15,23,42,0.1); font-variant-numeric:tabular-nums;">${escapeIssuerText(r.phone)}</td>` +
        `<td style="padding:0.35rem 0.5rem; border-bottom:1px solid rgba(15,23,42,0.1);">${escapeIssuerText(r.email)}</td>` +
        `</tr>`
    )
    .join("");
  if (count) count.textContent = `${rows.length} client${rows.length === 1 ? "" : "s"}`;
  modal.style.display = "flex";
}

function downloadClientListCsv() {
  const rows = buildClientListRows();
  if (rows.length === 0) {
    alert("No client rows to download. Generate a summary first.");
    return;
  }
  const csvRows = [["ClientPdfName", "ClientPhone", "ClientEmail"], ...rows.map((r) => [r.pdf, r.phone, r.email])];
  const csv = csvRows
    .map((r) => r.map((f) => `"${String(f ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `client-list-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function downloadSummaryCsv() {
  if (!lastSummary || !lastSummary.items || lastSummary.items.length === 0) {
    alert("No summary data to download. Generate a summary first.");
    return;
  }

  const rows = [
    [
      "Row",
      "TimeDate",
      "ClientPdfName",
      "Receipt",
      "ReceiptPrice",
      "TotalPrice",
      "DriverName",
      "DriverPhone",
      "ClientPhone",
      "ClientEmail",
      "Success",
      "Status",
      "Count",
      "IssuerName",
      "IssuerUsername",
      "DriverEmail",
      "Reference",
      "Notes",
      "LeadIssuer",
    ],
  ];

  const issuerHandleCounts = {};
  for (const it of lastSummary.items) {
    const handle = normalizeHandle(it.telegram_handle) || "__unknown__";
    issuerHandleCounts[handle] = (issuerHandleCounts[handle] || 0) + 1;
  }
  const driverPhoneMap = buildDriverPhoneMap();

  for (let i = 0; i < lastSummary.items.length; i += 1) {
    const it = lastSummary.items[i];
    const receiptUrl = (it.receipt_image_url && String(it.receipt_image_url).trim()) || "";
    const receiptRef = (it.reference_id && String(it.reference_id).trim()) || "";
    const receiptHref = receiptUrl
      ? receiptRef && receiptRef.toUpperCase() !== "N/A"
        ? receiptViewUrl(receiptRef)
        : receiptUrl
      : "";
    const receiptCsvValue = receiptHref
      ? `=HYPERLINK("${receiptHref.replace(/"/g, '""')}","View")`
      : "";
    const priceStr =
      it.price != null && String(it.price).trim() !== ""
        ? String(it.price).trim()
        : "";
    const receiptPriceStr =
      it.receipt_price != null && String(it.receipt_price).trim() !== ""
        ? String(it.receipt_price).trim()
        : "";
    rows.push([
      i + 1,
      formatNy(it.timestamp_ny || ""),
      it.filename || "",
      receiptCsvValue,
      receiptPriceStr,
      priceStr,
      it.recipient_name || "Not recorded",
      driverPhoneFor(it, driverPhoneMap),
      clientPhoneFor(it),
      clientEmailFor(it),
      (it.delivery_status || "").toUpperCase() === "DELIVERED" ? "YES" : "NO",
      (it.delivery_status || "").toUpperCase() || "UNKNOWN",
      issuerHandleCounts[normalizeHandle(it.telegram_handle) || "__unknown__"] || 0,
      it.telegram_name || "",
      formatHandleWithAt(it.telegram_handle),
      it.recipient_email || "",
      (it.reference_id && String(it.reference_id).trim()) || "",
      (() => {
        const s = String(it.client_details || "")
          .replace(/\s+/g, " ")
          .trim();
        if (!s) return "";
        return s.length > 500 ? s.slice(0, 500) + "…" : s;
      })(),
      (it.lead_client_name && String(it.lead_client_name).trim()) || "",
    ]);
  }

  const csv = rows
    .map((r) =>
      r
        .map((field) => {
          const v = String(field ?? "");
          if (v.includes(",") || v.includes('"') || v.includes("\n")) {
            return `"${v.replace(/"/g, '""')}"`;
          }
          return v;
        })
        .join(",")
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "krab_dispatch_summary.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Issuer team totals for the dashboard.
 *
 * Important: do NOT trust `issuer_group` alone — production data may label
 * highkage senders (e.g. @haruhatsu) as sensei. Telegram handle list wins.
 */
function deriveGroupCountsForDashboard(data) {
  const items = (data && data.items) || [];
  const counts = {
    sensei_group: { issued: 0, sent: 0 },
    highkage_group: { issued: 0, sent: 0 },
  };

  for (const it of items) {
    const status = (it.delivery_status || "").toUpperCase();
    const handle = String(it.telegram_handle || "")
      .trim()
      .toLowerCase()
      .replace(/^@/, "");
    const bucket = HIGHKAGE_FALLBACK_HANDLES.has(handle)
      ? "highkage_group"
      : "sensei_group";
    counts[bucket].issued += 1;
    if (status === "DELIVERED") {
      counts[bucket].sent += 1;
    }
  }

  return counts;
}

function windowKeyToDays(windowKey) {
  const k = (windowKey || "1w").toLowerCase();
  const map = {
    "1w": 7,
    "1m": 30,
    "3m": 90,
    "6m": 180,
    "1y": 365,
    all: null,
  };
  return map[k] === undefined ? 7 : map[k];
}

function parseItemTimeMs(item) {
  const raw = (item && item.timestamp_ny) || "";
  if (!raw) {
    return NaN;
  }
  const t = new Date(raw);
  const ms = t.getTime();
  return Number.isNaN(ms) ? NaN : ms;
}

async function fetchAllAdminTransactions() {
  const all = [];
  const pageSize = 200;
  let offset = 0;
  const maxItems = 20000;
  while (all.length < maxItems) {
    const pageRes = await requestWithAdminJson(
      "/transactions?limit=" + pageSize + "&offset=" + offset
    );
    if (!pageRes.ok) {
      throw new Error(pageRes.error || "FAILED_PAGE");
    }
    const page = pageRes.data;
    if (!page || page.length === 0) {
      break;
    }
    for (const row of page) {
      all.push(row);
    }
    if (page.length < pageSize) {
      break;
    }
    offset += pageSize;
  }
  return all;
}

function buildClientWindowSummary(allTx, windowKey) {
  const nowMs = Date.now();
  const days = windowKeyToDays(windowKey);
  const startMs = days == null ? null : nowMs - days * 24 * 60 * 60 * 1000;

  const filtered = [];
  for (const it of allTx) {
    const tms = parseItemTimeMs(it);
    if (Number.isNaN(tms)) {
      continue;
    }
    if (startMs == null || tms >= startMs) {
      filtered.push(it);
    }
  }
  filtered.sort((a, b) => parseItemTimeMs(a) - parseItemTimeMs(b));

  let delivered = 0;
  let pending = 0;
  let failed = 0;
  for (const it of filtered) {
    const status = (it.delivery_status || "").toUpperCase();
    if (status === "DELIVERED") {
      delivered += 1;
    } else if (status === "PENDING") {
      pending += 1;
    } else {
      failed += 1;
    }
  }

  const firstItemMs = filtered.length > 0 ? parseItemTimeMs(filtered[0]) : NaN;
  const lastItemMs =
    filtered.length > 0
      ? parseItemTimeMs(filtered[filtered.length - 1])
      : NaN;

  let periodStartMs = nowMs;
  if (filtered.length > 0 && !Number.isNaN(firstItemMs)) {
    periodStartMs = firstItemMs;
  } else if (startMs != null) {
    periodStartMs = startMs;
  } else {
    // "all" and no data: use now as a harmless anchor for formatting
    periodStartMs = nowMs;
  }

  let periodEndMs = nowMs;
  if (filtered.length > 0 && !Number.isNaN(lastItemMs)) {
    periodEndMs = lastItemMs;
  }

  return {
    period_start_ny: new Date(periodStartMs).toISOString(),
    period_end_ny: new Date(periodEndMs).toISOString(),
    total_transactions: filtered.length,
    delivered,
    pending,
    failed,
    items: filtered,
    _client_window: true,
  };
}

// The summary table's Driver Phone column joins on the issuer drivers
// directory. Historically that cache only filled when the issuer tab was
// opened, so the column rendered blank on first load — fetch it on demand.
let _issuerDriversInflight = null;
async function ensureIssuerDriversLoaded() {
  if (Array.isArray(_cachedIssuerDrivers) && _cachedIssuerDrivers.length > 0) return;
  if (_issuerDriversInflight) return _issuerDriversInflight;
  _issuerDriversInflight = (async () => {
    try {
      const res = await issuerApiJson("/issuer-admin/drivers");
      if (res.ok && Array.isArray(res.data)) {
        _cachedIssuerDrivers = res.data;
      }
    } catch (_) {
      /* summary still renders; phone cells fall back to em-dash */
    } finally {
      _issuerDriversInflight = null;
    }
  })();
  return _issuerDriversInflight;
}

async function refreshSummary() {
  const windowEl = document.getElementById("summary-window");
  const periodEl = document.getElementById("summary-period");
  const totalEl = document.getElementById("summary-total");
  const revenueEl = document.getElementById("summary-revenue");
  const deliveredEl = document.getElementById("summary-delivered");
  const pfEl = document.getElementById("summary-pending-failed");
  const senseiEl = document.getElementById("summary-sensei");
  const highkageEl = document.getElementById("summary-highkage");
  const statusEl = document.getElementById("summary-status");

  try {
    const windowKey = (windowEl && windowEl.value) || "1w";
    if (statusEl) {
      statusEl.textContent = "Loading summary (NJ)...";
    }

    // Primary path: server-side rolling window summary (avoids large /transactions scans).
    const rollRes = await requestWithAdminJson(
      "/summaries/rolling?window=" + encodeURIComponent(windowKey)
    );
    if (!hasAdminPassword()) {
      return;
    }
    let data = null;
    if (rollRes.ok) {
      data = rollRes.data;
    } else {
      if (statusEl) {
        statusEl.textContent =
          "Rolling summary API unavailable, building summary locally (can be slow)...";
      }
      const allTx = await fetchAllAdminTransactions();
      if (!hasAdminPassword()) {
        return;
      }
      data = buildClientWindowSummary(allTx, windowKey);
    }
    if (!hasAdminPassword()) {
      return;
    }
    // Load the drivers directory before rendering so Driver Phone resolves.
    await ensureIssuerDriversLoaded();
    lastSummary = data;
    periodEl.textContent =
      data.period_start_ny && data.period_end_ny
        ? `${formatNy(data.period_start_ny)} → ${formatNy(data.period_end_ny)}`
        : `All time → ${formatNy(data.period_end_ny)}`;
    totalEl.textContent = `${data.total_transactions} total`;
    if (revenueEl) {
      revenueEl.textContent = formatRevenueUsd(data.total_transactions);
    }
    deliveredEl.textContent = data.delivered;
    pfEl.textContent = `${data.pending} / ${data.failed}`;
    const fallbackCounts = deriveGroupCountsForDashboard(data);
    const apiGc = data.group_counts;
    const useApiGroupCounts =
      apiGc &&
      apiGc.sensei_group &&
      apiGc.highkage_group &&
      !data._client_window;
    const sensei = useApiGroupCounts
      ? apiGc.sensei_group
      : fallbackCounts.sensei_group;
    const highkage = useApiGroupCounts
      ? apiGc.highkage_group
      : fallbackCounts.highkage_group;
    senseiEl.textContent = `${sensei.issued} / ${sensei.sent}`;
    highkageEl.textContent = `${highkage.issued} / ${highkage.sent}`;
    if (statusEl) {
      if (data.total_transactions === 0) {
        statusEl.textContent = "No transmissions in the selected window.";
      } else {
        const omitted = Number(data.items_omitted) || 0;
        const extra =
          omitted > 0
            ? ` Table lists the latest ${
                (data.items && data.items.length) || 0
              } rows; ${omitted} older rows are omitted from the table.`
            : "";
        statusEl.textContent = "Summary generated successfully." + extra;
      }
    }

    // Live Count anchors (manual per-driver countdown) — one fetch per render.
    await refreshLiveCountsState();
    if (!hasAdminPassword()) {
      return;
    }

    renderSummaryTable(data);
    renderSummaryIssuerTable(data);
  } catch (e) {
    console.error(e);
    const revenueOnErr = document.getElementById("summary-revenue");
    if (revenueOnErr) {
      revenueOnErr.textContent = "—";
    }
    if (statusEl) {
      statusEl.textContent =
        e && e.message && String(e.message).startsWith("NETWORK:")
          ? "API unreachable. Check Render service, then try again. Base: " + API_BASE
          : "Failed to load summary. " + (e && e.message ? e.message : "");
    }
  }
}

function applyLoggedInUI(loggedIn) {
  const authArea = document.getElementById("auth-area");
  const dashArea = document.getElementById("dashboard-area");
  const tabLogoutIds = [
    "txn-tab-logout-btn",
    "dispatch-tab-logout-btn",
    "issuer-tab-logout-btn",
  ];
  const dispatchHeaderWrap = document.getElementById("dispatch-header-wrap");
  const dispatchTxPanel = document.getElementById("dispatch-transmissions-panel");
  const txnPrivateWrap = document.getElementById("txn-private-wrap");
  const txnToolbarPrivate = document.getElementById("txn-toolbar-private");
  const txnPageTitle = document.getElementById("txn-page-title");
  const txnAuthArea = document.getElementById("txn-auth-area");
  const issuerPageTitle = document.getElementById("issuer-page-title");
  const issuerPrivateWrap = document.getElementById("issuer-private-wrap");
  const issuerSupabaseDriverStack = document.getElementById(
    "issuer-supabase-driver-stack"
  );
  const dispatchAiChatWrap = document.getElementById("dispatch-ai-chat-wrap");
  const issuerAiChatWrap = document.getElementById("issuer-ai-chat-wrap");
  const issuerToolbarPrivate = document.getElementById("issuer-toolbar-private");
  const issuerAuthArea = document.getElementById("issuer-auth-area");

  if (authArea) authArea.style.display = loggedIn ? "none" : "block";
  if (dashArea) dashArea.style.display = loggedIn ? "block" : "none";
  tabLogoutIds.forEach((id) => {
    const b = document.getElementById(id);
    if (b) b.style.display = loggedIn ? "inline-flex" : "none";
  });

  // panel-dispatch (tab label "Krab Issuer"): Access + email recipients; full dashboard after unlock.
  if (dispatchHeaderWrap) dispatchHeaderWrap.style.display = loggedIn ? "flex" : "none";
  if (dispatchTxPanel) dispatchTxPanel.style.display = loggedIn ? "block" : "none";

  // Transactions tab: when locked, show ONLY the Unlock controls in header.
  if (txnPageTitle) txnPageTitle.style.display = loggedIn ? "block" : "none";
  if (txnAuthArea) txnAuthArea.style.display = loggedIn ? "none" : "block";
  if (txnPrivateWrap) txnPrivateWrap.style.display = loggedIn ? "block" : "none";
  if (txnToolbarPrivate) txnToolbarPrivate.style.display = loggedIn ? "contents" : "none";

  // Krab Issuer tab: when locked, show Access only; main Issuer tools (groups, etc.) after unlock.
  if (issuerPageTitle) issuerPageTitle.style.display = loggedIn ? "block" : "none";
  if (issuerAuthArea) issuerAuthArea.style.display = loggedIn ? "none" : "block";
  if (issuerPrivateWrap) issuerPrivateWrap.style.display = loggedIn ? "block" : "none";
  if (issuerToolbarPrivate) issuerToolbarPrivate.style.display = loggedIn ? "contents" : "none";
  // panel-issuer (tab label "Krab Dispatch"): chatID add driver always visible; Drivers table after unlock.
  const issuerDriversListPanel = document.getElementById(
    "issuer-drivers-list-panel"
  );
  if (issuerSupabaseDriverStack) {
    issuerSupabaseDriverStack.style.display = "block";
    issuerSupabaseDriverStack.setAttribute("aria-hidden", "false");
  }
  if (issuerDriversListPanel) {
    issuerDriversListPanel.style.display = loggedIn ? "block" : "none";
    issuerDriversListPanel.setAttribute(
      "aria-hidden",
      loggedIn ? "false" : "true"
    );
  }
  if (dispatchAiChatWrap) {
    dispatchAiChatWrap.style.display = loggedIn ? "block" : "none";
    dispatchAiChatWrap.setAttribute("aria-hidden", loggedIn ? "false" : "true");
  }
  if (issuerAiChatWrap) {
    issuerAiChatWrap.style.display = loggedIn ? "block" : "none";
    issuerAiChatWrap.setAttribute("aria-hidden", loggedIn ? "false" : "true");
  }
}

async function tryInitialLogin() {
  const genAtStart = _adminAuthSuccessGeneration;
  if (!hasAdminPassword()) return;
  try {
    // Validate the password with ONE cheap request, unlock the UI
    // immediately, and load the rest in parallel without blocking paint.
    await refreshLatest();
    bumpAdminAuthSuccessGeneration();
    applyLoggedInUI(true);
    // Dispatch-panel data (transactions list, rolling summary) loads lazily
    // on first visit to the Dispatch tab — not on the unlock path.
  } catch {
    if (_adminAuthSuccessGeneration !== genAtStart) {
      return;
    }
    storePassword("");
    applyLoggedInUI(false);
  }
}

function setupEvents() {
  const loginBtn = document.getElementById("login-btn");
  const input = document.getElementById("admin-password-input");
  const err = document.getElementById("auth-error");
  const txnLoginBtn = document.getElementById("txn-login-btn");
  const txnInput = document.getElementById("txn-admin-password-input");
  const txnErr = document.getElementById("txn-auth-error");
  const issuerLoginBtn = document.getElementById("issuer-login-btn");
  const issuerInput = document.getElementById("issuer-admin-password-input");
  const issuerErr = document.getElementById("issuer-auth-error");
  const refreshTableBtn = document.getElementById("refresh-table-btn");
  const summaryBtn = document.getElementById("summary-btn");
  const summaryDownloadBtn = document.getElementById(
    "summary-download-btn"
  );
  const summaryExpandBtn = document.getElementById("summary-expand-btn");
  const summaryZoomInBtn = document.getElementById("summary-zoom-in-btn");
  const summaryZoomOutBtn = document.getElementById("summary-zoom-out-btn");
  const summaryZoomResetBtn = document.getElementById("summary-zoom-reset-btn");
  const summaryExpandedZoomInBtn = document.getElementById(
    "summary-expanded-zoom-in-btn"
  );
  const summaryExpandedZoomOutBtn = document.getElementById(
    "summary-expanded-zoom-out-btn"
  );
  const summaryExpandedZoomResetBtn = document.getElementById(
    "summary-expanded-zoom-reset-btn"
  );
  const summaryExpandedCloseBtn = document.getElementById(
    "summary-expanded-close-btn"
  );
  const txExpandBtn = document.getElementById("tx-expand-btn");
  const txZoomInBtn = document.getElementById("tx-zoom-in-btn");
  const txZoomOutBtn = document.getElementById("tx-zoom-out-btn");
  const txZoomResetBtn = document.getElementById("tx-zoom-reset-btn");
  const txExpandedZoomInBtn = document.getElementById("tx-expanded-zoom-in-btn");
  const txExpandedZoomOutBtn = document.getElementById("tx-expanded-zoom-out-btn");
  const txExpandedZoomResetBtn = document.getElementById("tx-expanded-zoom-reset-btn");
  const txExpandedCloseBtn = document.getElementById("tx-expanded-close-btn");
  const txnLedgerExpandBtn = document.getElementById("txn-ledger-expand-btn");
  const txnLedgerZoomInBtn = document.getElementById("txn-ledger-zoom-in-btn");
  const txnLedgerZoomOutBtn = document.getElementById("txn-ledger-zoom-out-btn");
  const txnLedgerZoomResetBtn = document.getElementById("txn-ledger-zoom-reset-btn");
  const txnLedgerExpandedZoomInBtn = document.getElementById(
    "txn-ledger-expanded-zoom-in-btn"
  );
  const txnLedgerExpandedZoomOutBtn = document.getElementById(
    "txn-ledger-expanded-zoom-out-btn"
  );
  const txnLedgerExpandedZoomResetBtn = document.getElementById(
    "txn-ledger-expanded-zoom-reset-btn"
  );
  const txnLedgerExpandedCloseBtn = document.getElementById(
    "txn-ledger-expanded-close-btn"
  );
  const summaryAiInput = document.getElementById("summary-ai-input");
  const summaryAiAskBtn = document.getElementById("summary-ai-ask-btn");
  const summaryAiAnswer = document.getElementById("summary-ai-answer");
  const issuerAiInput = document.getElementById("issuer-ai-input");
  const issuerAiAskBtn = document.getElementById("issuer-ai-ask-btn");
  const issuerAiAnswer = document.getElementById("issuer-ai-answer");
  loadSummaryAiHistory();
  renderSummaryAiLog();
  loadIssuerAiHistory();
  renderIssuerAiLog();

  async function doLoginWithPassword(pwRaw, errEl) {
    const pw = String(pwRaw || "").trim();
    if (!pw) return;
    storePassword(pw);
    syncAdminPasswordInputs(pw);
    clearAdminAuthErrorDisplays();
    try {
      // One cheap validating request, then unlock and load the rest async.
      await refreshLatest();
      bumpAdminAuthSuccessGeneration();
      applyLoggedInUI(true);
      // Dispatch-panel data loads lazily on first Dispatch-tab visit.
    } catch (e) {
      console.error(e);
      storePassword("");
      syncAdminPasswordInputs("");
      if (errEl && errEl.style) {
        errEl.style.display = "block";
      } else if (err) {
        err.style.display = "block";
      }
    }
  }

  async function doLoginFromMain() {
    return doLoginWithPassword(input && input.value, err);
  }
  async function doLoginFromTxn() {
    return doLoginWithPassword(txnInput && txnInput.value, txnErr);
  }
  async function doLoginFromIssuer() {
    return doLoginWithPassword(issuerInput && issuerInput.value, issuerErr);
  }

  if (loginBtn) loginBtn.addEventListener("click", doLoginFromMain);
  if (input) {
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") doLoginFromMain();
    });
  }
  if (txnLoginBtn) txnLoginBtn.addEventListener("click", doLoginFromTxn);
  if (txnInput) {
    txnInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") doLoginFromTxn();
    });
  }
  if (issuerLoginBtn) issuerLoginBtn.addEventListener("click", doLoginFromIssuer);
  if (issuerInput) {
    issuerInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") doLoginFromIssuer();
    });
  }

  ["txn-tab-logout-btn", "dispatch-tab-logout-btn", "issuer-tab-logout-btn"].forEach(
    (id) => {
      const b = document.getElementById(id);
      if (b) b.addEventListener("click", () => doAdminLogout());
    }
  );

  refreshTableBtn.addEventListener("click", () => {
    refreshTransactions();
    refreshLatest();
  });

  summaryBtn.addEventListener("click", () => {
    refreshSummary();
  });

  if (summaryDownloadBtn) {
    summaryDownloadBtn.addEventListener("click", () => {
      downloadSummaryCsv();
    });
  }

  const clientListBtn = document.getElementById("summary-client-list-btn");
  if (clientListBtn) {
    clientListBtn.addEventListener("click", () => {
      openClientListModal();
    });
  }
  const clientListClose = document.getElementById("client-list-close-btn");
  if (clientListClose) {
    clientListClose.addEventListener("click", () => {
      const m = document.getElementById("client-list-modal");
      if (m) m.style.display = "none";
    });
  }
  const clientListDownload = document.getElementById("client-list-download-btn");
  if (clientListDownload) {
    clientListDownload.addEventListener("click", () => {
      downloadClientListCsv();
    });
  }
  const clientListModal = document.getElementById("client-list-modal");
  if (clientListModal) {
    clientListModal.addEventListener("click", (ev) => {
      if (ev.target === clientListModal) clientListModal.style.display = "none";
    });
  }

  if (summaryExpandBtn) {
    summaryExpandBtn.addEventListener("click", () => {
      const wrapper = document.getElementById("summary-table-wrapper");
      if (!wrapper) return;
      const expanded = wrapper.classList.toggle("expanded");
      summaryExpandBtn.innerHTML = expanded
        ? "🗕<span>Collapse</span>"
        : "⤢<span>Expand</span>";
    });
  }

  if (summaryExpandedCloseBtn) {
    summaryExpandedCloseBtn.addEventListener("click", () => {
      const wrapper = document.getElementById("summary-table-wrapper");
      if (!wrapper) return;
      wrapper.classList.remove("expanded");
      if (summaryExpandBtn) {
        summaryExpandBtn.innerHTML = "⤢<span>Expand</span>";
      }
    });
  }

  if (txExpandBtn) {
    txExpandBtn.addEventListener("click", () => {
      const wrapper = document.getElementById("tx-table-wrapper");
      if (!wrapper) return;
      const expanded = wrapper.classList.toggle("expanded");
      txExpandBtn.innerHTML = expanded ? "🗕<span>Collapse</span>" : "⤢<span>Expand</span>";
    });
  }

  if (txExpandedCloseBtn) {
    txExpandedCloseBtn.addEventListener("click", () => {
      const wrapper = document.getElementById("tx-table-wrapper");
      if (!wrapper) return;
      wrapper.classList.remove("expanded");
      if (txExpandBtn) {
        txExpandBtn.innerHTML = "⤢<span>Expand</span>";
      }
    });
  }

  if (txnLedgerExpandBtn) {
    txnLedgerExpandBtn.addEventListener("click", () => {
      const wrapper = document.getElementById("txn-ledger-wrapper");
      if (!wrapper) return;
      const expanded = wrapper.classList.toggle("expanded");
      txnLedgerExpandBtn.innerHTML = expanded
        ? "🗕<span>Collapse</span>"
        : "⤢<span>Expand</span>";
    });
  }

  if (txnLedgerExpandedCloseBtn) {
    txnLedgerExpandedCloseBtn.addEventListener("click", () => {
      const wrapper = document.getElementById("txn-ledger-wrapper");
      if (!wrapper) return;
      wrapper.classList.remove("expanded");
      if (txnLedgerExpandBtn) {
        txnLedgerExpandBtn.innerHTML = "⤢<span>Expand</span>";
      }
    });
  }

  if (summaryZoomInBtn) {
    summaryZoomInBtn.addEventListener("click", () => {
      applySummaryZoom(summaryZoomScale + 0.1);
    });
  }
  if (summaryZoomOutBtn) {
    summaryZoomOutBtn.addEventListener("click", () => {
      applySummaryZoom(summaryZoomScale - 0.1);
    });
  }
  if (summaryZoomResetBtn) {
    summaryZoomResetBtn.addEventListener("click", () => {
      applySummaryZoom(1);
    });
  }
  if (summaryExpandedZoomInBtn) {
    summaryExpandedZoomInBtn.addEventListener("click", () => {
      applySummaryZoom(summaryZoomScale + 0.1);
    });
  }
  if (summaryExpandedZoomOutBtn) {
    summaryExpandedZoomOutBtn.addEventListener("click", () => {
      applySummaryZoom(summaryZoomScale - 0.1);
    });
  }
  if (summaryExpandedZoomResetBtn) {
    summaryExpandedZoomResetBtn.addEventListener("click", () => {
      applySummaryZoom(1);
    });
  }

  if (txZoomInBtn) {
    txZoomInBtn.addEventListener("click", () => {
      applyTxZoom(txZoomScale + 0.1);
    });
  }
  if (txZoomOutBtn) {
    txZoomOutBtn.addEventListener("click", () => {
      applyTxZoom(txZoomScale - 0.1);
    });
  }
  if (txZoomResetBtn) {
    txZoomResetBtn.addEventListener("click", () => {
      applyTxZoom(1);
    });
  }
  if (txExpandedZoomInBtn) {
    txExpandedZoomInBtn.addEventListener("click", () => {
      applyTxZoom(txZoomScale + 0.1);
    });
  }
  if (txExpandedZoomOutBtn) {
    txExpandedZoomOutBtn.addEventListener("click", () => {
      applyTxZoom(txZoomScale - 0.1);
    });
  }
  if (txExpandedZoomResetBtn) {
    txExpandedZoomResetBtn.addEventListener("click", () => {
      applyTxZoom(1);
    });
  }

  if (txnLedgerZoomInBtn) {
    txnLedgerZoomInBtn.addEventListener("click", () => {
      applyTxnUnifiedZoom(txnUnifiedZoomScale + 0.1);
    });
  }
  if (txnLedgerZoomOutBtn) {
    txnLedgerZoomOutBtn.addEventListener("click", () => {
      applyTxnUnifiedZoom(txnUnifiedZoomScale - 0.1);
    });
  }
  if (txnLedgerZoomResetBtn) {
    txnLedgerZoomResetBtn.addEventListener("click", () => {
      applyTxnUnifiedZoom(1);
    });
  }
  if (txnLedgerExpandedZoomInBtn) {
    txnLedgerExpandedZoomInBtn.addEventListener("click", () => {
      applyTxnUnifiedZoom(txnUnifiedZoomScale + 0.1);
    });
  }
  if (txnLedgerExpandedZoomOutBtn) {
    txnLedgerExpandedZoomOutBtn.addEventListener("click", () => {
      applyTxnUnifiedZoom(txnUnifiedZoomScale - 0.1);
    });
  }
  if (txnLedgerExpandedZoomResetBtn) {
    txnLedgerExpandedZoomResetBtn.addEventListener("click", () => {
      applyTxnUnifiedZoom(1);
    });
  }

  const summaryTableWrap = document.querySelector("#summary-table");
  if (summaryTableWrap) {
    let pinchStartDistance = 0;
    let pinchStartScale = 1;
    summaryTableWrap.addEventListener(
      "touchstart",
      (ev) => {
        if (ev.touches.length === 2) {
          const dx = ev.touches[0].clientX - ev.touches[1].clientX;
          const dy = ev.touches[0].clientY - ev.touches[1].clientY;
          pinchStartDistance = Math.hypot(dx, dy);
          pinchStartScale = summaryZoomScale;
        }
      },
      { passive: true }
    );
    summaryTableWrap.addEventListener(
      "touchmove",
      (ev) => {
        if (ev.touches.length === 2 && pinchStartDistance > 0) {
          const dx = ev.touches[0].clientX - ev.touches[1].clientX;
          const dy = ev.touches[0].clientY - ev.touches[1].clientY;
          const distance = Math.hypot(dx, dy);
          const ratio = distance / pinchStartDistance;
          applySummaryZoom(pinchStartScale * ratio);
          ev.preventDefault();
        }
      },
      { passive: false }
    );
  }

  const txTableWrap = document.querySelector("#tx-table");
  if (txTableWrap) {
    let pinchStartDistance = 0;
    let pinchStartScale = 1;
    txTableWrap.addEventListener(
      "touchstart",
      (ev) => {
        if (ev.touches.length === 2) {
          const dx = ev.touches[0].clientX - ev.touches[1].clientX;
          const dy = ev.touches[0].clientY - ev.touches[1].clientY;
          pinchStartDistance = Math.hypot(dx, dy);
          pinchStartScale = txZoomScale;
        }
      },
      { passive: true }
    );
    txTableWrap.addEventListener(
      "touchmove",
      (ev) => {
        if (ev.touches.length === 2 && pinchStartDistance > 0) {
          const dx = ev.touches[0].clientX - ev.touches[1].clientX;
          const dy = ev.touches[0].clientY - ev.touches[1].clientY;
          const distance = Math.hypot(dx, dy);
          const ratio = distance / pinchStartDistance;
          applyTxZoom(pinchStartScale * ratio);
          ev.preventDefault();
        }
      },
      { passive: false }
    );
  }

  const txnLedgerTableWrap = document.querySelector("#txn-table-wrap");
  if (txnLedgerTableWrap) {
    let pinchStartDistance = 0;
    let pinchStartScale = 1;
    txnLedgerTableWrap.addEventListener(
      "touchstart",
      (ev) => {
        if (ev.touches.length === 2) {
          const dx = ev.touches[0].clientX - ev.touches[1].clientX;
          const dy = ev.touches[0].clientY - ev.touches[1].clientY;
          pinchStartDistance = Math.hypot(dx, dy);
          pinchStartScale = txnUnifiedZoomScale;
        }
      },
      { passive: true }
    );
    txnLedgerTableWrap.addEventListener(
      "touchmove",
      (ev) => {
        if (ev.touches.length === 2 && pinchStartDistance > 0) {
          const dx = ev.touches[0].clientX - ev.touches[1].clientX;
          const dy = ev.touches[0].clientY - ev.touches[1].clientY;
          const distance = Math.hypot(dx, dy);
          const ratio = distance / pinchStartDistance;
          applyTxnUnifiedZoom(pinchStartScale * ratio);
          ev.preventDefault();
        }
      },
      { passive: false }
    );
  }

  async function handleAiAsk() {
    if (!summaryAiAnswer) return;
    const q = summaryAiInput ? summaryAiInput.value : "";
    if (!String(q || "").trim()) {
      summaryAiAnswer.textContent = "Please enter a question.";
      return;
    }
    // Forward-step validation: if summary is missing, try to load it first.
    if (!lastSummary || !Array.isArray(lastSummary.items)) {
      try {
        await refreshSummary();
      } catch {
        // continue to fallback messaging below
      }
    }
    summaryAiAnswer.textContent = "Thinking...";
    summaryAiHistory.push({ role: "user", content: String(q) });
    saveSummaryAiHistory();
    renderSummaryAiLog();
    try {
      const ai = await askSummaryWithGpt(q, {
        historySlice: summaryAiHistory.slice(-12),
      });
      summaryAiAnswer.textContent = ai;
      summaryAiHistory.push({ role: "assistant", content: String(ai) });
      saveSummaryAiHistory();
      renderSummaryAiLog();
    } catch {
      const msg = "AI unavailable right now. Please try again.";
      summaryAiAnswer.textContent = msg;
      summaryAiHistory.push({ role: "assistant", content: msg });
      saveSummaryAiHistory();
      renderSummaryAiLog();
    }
    if (summaryAiInput) {
      summaryAiInput.value = "";
    }
  }
  if (summaryAiAskBtn) {
    summaryAiAskBtn.addEventListener("click", handleAiAsk);
  }
  if (summaryAiInput) {
    summaryAiInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        handleAiAsk();
      }
    });
  }

  async function handleIssuerAiAsk() {
    if (!issuerAiAnswer) return;
    const q = issuerAiInput ? issuerAiInput.value : "";
    if (!String(q || "").trim()) {
      issuerAiAnswer.textContent = "Please enter a question.";
      return;
    }
    if (!lastSummary || !Array.isArray(lastSummary.items)) {
      try {
        await refreshSummary();
      } catch {
        // continue
      }
    }
    issuerAiAnswer.textContent = "Thinking...";
    issuerAiHistory.push({ role: "user", content: String(q) });
    saveIssuerAiHistory();
    renderIssuerAiLog();
    try {
      const ai = await askSummaryWithGpt(q, {
        historySlice: issuerAiHistory.slice(-12),
        includeIssuerSnapshot: true,
      });
      issuerAiAnswer.textContent = ai;
      issuerAiHistory.push({ role: "assistant", content: String(ai) });
      saveIssuerAiHistory();
      renderIssuerAiLog();
    } catch {
      const msg = "AI unavailable right now. Please try again.";
      issuerAiAnswer.textContent = msg;
      issuerAiHistory.push({ role: "assistant", content: msg });
      saveIssuerAiHistory();
      renderIssuerAiLog();
    }
    if (issuerAiInput) issuerAiInput.value = "";
  }
  if (issuerAiAskBtn) {
    issuerAiAskBtn.addEventListener("click", handleIssuerAiAsk);
  }
  if (issuerAiInput) {
    issuerAiInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        handleIssuerAiAsk();
      }
    });
  }

  // Recipient management
  const addRecipientBtn = document.getElementById("add-recipient-btn");
  const recipientForm = document.getElementById("recipient-form");
  const recipientNameInput = document.getElementById("recipient-name-input");
  const recipientEmailInput = document.getElementById("recipient-email-input");
  const saveRecipientBtn = document.getElementById("save-recipient-btn");
  const cancelRecipientBtn = document.getElementById("cancel-recipient-btn");
  const recipientError = document.getElementById("recipient-error");
  const recipientListWrap = document.getElementById("recipient-list-wrap");
  const recipientsBody = document.getElementById("recipients-body");
  // When set, saveRecipient PATCHes this recipient instead of POSTing a new one.
  let editingRecipientId = null;

  function resetRecipientFormMode() {
    editingRecipientId = null;
    if (saveRecipientBtn) saveRecipientBtn.textContent = "Save";
  }

  function beginEditRecipient(r) {
    editingRecipientId = r && r.id ? String(r.id) : null;
    if (!editingRecipientId) return;
    if (recipientForm) recipientForm.style.display = "block";
    if (recipientNameInput) recipientNameInput.value = r.name || "";
    if (recipientEmailInput) recipientEmailInput.value = r.email || "";
    if (saveRecipientBtn) saveRecipientBtn.textContent = "Update";
    if (recipientError) recipientError.style.display = "none";
    if (recipientNameInput) recipientNameInput.focus();
  }

  function updateRecipientConfidentialUI() {
    const hasPw = !!getStoredPassword();
    if (recipientListWrap) {
      recipientListWrap.style.display = hasPw ? "block" : "none";
    }
    if (!hasPw && recipientsBody) {
      recipientsBody.innerHTML = `
        <tr>
          <td colspan="3" class="muted">Unlock to view saved driver emails.</td>
        </tr>
      `;
    }
  }

  async function refreshRecipients() {
    // Confidentiality: allow adding without password, but hide the list until unlocked.
    if (!getStoredPassword()) {
      updateRecipientConfidentialUI();
      return;
    }
    try {
      const res = await fetch(API_BASE + "/recipients/ui");
      if (!res.ok) {
        throw new Error("HTTP_" + res.status);
      }
      const recipients = await res.json();
      if (!hasAdminPassword()) {
        updateRecipientConfidentialUI();
        return;
      }
      renderRecipients(recipients);
      _cachedDispatchRecipients = Array.isArray(recipients) ? recipients : [];
      renderUnifiedDriversTable();
    } catch (e) {
      console.error("Failed to fetch recipients:", e);
      recipientsBody.innerHTML = `
          <tr>
            <td colspan="3" class="muted">Failed to load drivers. Is the API updated?</td>
          </tr>
        `;
    }
  }

  function renderRecipients(recipients) {
    updateRecipientConfidentialUI();
    if (!getStoredPassword()) return;
    recipientsBody.innerHTML = "";
    if (!recipients || recipients.length === 0) {
      recipientsBody.innerHTML = `
        <tr>
          <td colspan="3" class="muted">No drivers yet. Click Add to create one.</td>
        </tr>
      `;
      return;
    }

    for (const r of recipients) {
      const tr = document.createElement("tr");

      const tdName = document.createElement("td");
      tdName.textContent = r.name;
      tr.appendChild(tdName);

      const tdEmail = document.createElement("td");
      tdEmail.textContent = r.email;
      tr.appendChild(tdEmail);

      const tdActions = document.createElement("td");
      const editBtn = document.createElement("button");
      editBtn.className = "secondary";
      editBtn.style.fontSize = "0.75rem";
      editBtn.style.marginRight = "0.3rem";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => beginEditRecipient(r));
      tdActions.appendChild(editBtn);
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "secondary";
      deleteBtn.style.fontSize = "0.75rem";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => deleteRecipient(r.id));
      tdActions.appendChild(deleteBtn);
      tr.appendChild(tdActions);

      recipientsBody.appendChild(tr);
    }
  }

  async function deleteRecipient(id) {
    if (!confirm("Are you sure you want to delete this driver?")) {
      return;
    }
    try {
      const res = await fetch(
        API_BASE + "/recipients/ui/" + encodeURIComponent(id),
        { method: "DELETE" }
      );
      if (!res.ok) {
        throw new Error("HTTP_" + res.status);
      }
      if (editingRecipientId === String(id)) {
        resetRecipientFormMode();
        recipientNameInput.value = "";
        recipientEmailInput.value = "";
        recipientForm.style.display = "none";
      }
      await refreshRecipients();
    } catch (e) {
      console.error("Failed to delete recipient:", e);
      alert("Failed to delete driver. Please try again.");
    }
  }

  async function saveRecipient() {
    const name = recipientNameInput.value.trim();
    const email = recipientEmailInput.value.trim();

    if (!name || !email) {
      recipientError.textContent = "Name and email are required.";
      recipientError.style.display = "block";
      return;
    }

    if (!email.includes("@")) {
      recipientError.textContent = "Please enter a valid email address.";
      recipientError.style.display = "block";
      return;
    }

    recipientError.style.display = "none";

    try {
      const isEdit = !!editingRecipientId;
      const url = isEdit
        ? API_BASE + "/recipients/ui/" + encodeURIComponent(editingRecipientId)
        : API_BASE + "/recipients/ui";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      if (!res.ok) {
        throw new Error("HTTP_" + res.status);
      }
      resetRecipientFormMode();
      recipientNameInput.value = "";
      recipientEmailInput.value = "";
      recipientForm.style.display = "none";
      await refreshRecipients();
    } catch (e) {
      console.error("Failed to save recipient:", e);
      recipientError.textContent = "Failed to save driver. Please try again.";
      recipientError.style.display = "block";
    }
  }

  addRecipientBtn.addEventListener("click", () => {
    resetRecipientFormMode();
    recipientForm.style.display = "block";
    recipientNameInput.focus();
  });

  cancelRecipientBtn.addEventListener("click", () => {
    resetRecipientFormMode();
    recipientForm.style.display = "none";
    recipientNameInput.value = "";
    recipientEmailInput.value = "";
    recipientError.style.display = "none";
  });

  saveRecipientBtn.addEventListener("click", saveRecipient);

  recipientNameInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      recipientEmailInput.focus();
    }
  });

  recipientEmailInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      saveRecipient();
    }
  });

  // Combined driver add (Krab Issuer + Krab Dispatch). Both endpoints are
  // public (/recipients/ui + /issuer-admin/drivers), so this card works while
  // the dashboard is locked — required behavior.
  const combinedAddBtn = document.getElementById("combined-driver-add-btn");
  if (combinedAddBtn) {
    const combinedStatus = document.getElementById("combined-driver-status");
    const setCombinedStatus = (msg, isErr) => {
      if (!combinedStatus) return;
      combinedStatus.textContent = msg || "";
      combinedStatus.style.display = msg ? "block" : "none";
      combinedStatus.style.color = isErr ? "var(--danger)" : "var(--text-muted)";
    };
    combinedAddBtn.addEventListener("click", async () => {
      const nameEl = document.getElementById("combined-driver-name");
      const emailEl = document.getElementById("combined-driver-email");
      const tgEl = document.getElementById("combined-driver-tg-id");
      const phoneEl = document.getElementById("combined-driver-phone");
      const name = nameEl ? nameEl.value.trim() : "";
      const email = emailEl ? emailEl.value.trim() : "";
      const tg = tgEl ? tgEl.value.trim() : "";
      const phone = phoneEl ? phoneEl.value.trim() : "";
      if (!name || !email || !tg) {
        setCombinedStatus(
          "Driver name, email, and Telegram ID are required.",
          true
        );
        return;
      }
      if (!email.includes("@")) {
        setCombinedStatus("Please enter a valid email address.", true);
        return;
      }
      combinedAddBtn.disabled = true;
      setCombinedStatus("Adding driver to both systems…", false);

      // (a) Krab Dispatch email recipient.
      let dispatchOk = false;
      let dispatchErr = "";
      try {
        const res = await fetch(API_BASE + "/recipients/ui", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email }),
        });
        if (res.ok) {
          dispatchOk = true;
        } else {
          dispatchErr = "HTTP_" + res.status;
        }
      } catch (e) {
        dispatchErr = "network";
      }

      // (b) Krab Issuer driver (chatID) — email passed through when supported.
      let issuerOk = false;
      let issuerErr = "";
      try {
        const body = { driver_name: name, driver_telegram_id: tg, email };
        if (phone) body.phone_number = phone;
        const res = await fetch(API_BASE + "/issuer-admin/drivers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          issuerOk = true;
        } else {
          try {
            const j = await res.json();
            issuerErr =
              issuerFormatDetail(j && (j.detail ?? j.message ?? j.error)) ||
              "HTTP_" + res.status;
          } catch {
            issuerErr = "HTTP_" + res.status;
          }
        }
      } catch (e) {
        issuerErr = "network";
      }

      combinedAddBtn.disabled = false;
      const parts = [
        dispatchOk
          ? "✅ Dispatch (email) added"
          : "❌ Dispatch (email) failed" + (dispatchErr ? ` (${dispatchErr})` : ""),
        issuerOk
          ? "✅ Issuer (chatID) added"
          : "❌ Issuer (chatID) failed" + (issuerErr ? ` (${issuerErr})` : ""),
      ];
      setCombinedStatus(parts.join(" · "), !(dispatchOk && issuerOk));
      if (dispatchOk && issuerOk) {
        if (nameEl) nameEl.value = "";
        if (emailEl) emailEl.value = "";
        if (tgEl) tgEl.value = "";
        if (phoneEl) phoneEl.value = "";
      }
      if (dispatchOk) {
        refreshRecipients();
      }
      if (issuerOk && getStoredPassword()) {
        refreshIssuerAdmin();
      }
    });
  }

  // Refresh recipients when logged in; Add driver card also loads without password.
  const originalApplyLoggedInUI = applyLoggedInUI;
  applyLoggedInUI = (loggedIn) => {
    originalApplyLoggedInUI(loggedIn);
    if (loggedIn) {
      updateIssuerAuthGate();
      // Lazy per-tab: only load data for the tab the user is looking at.
      // Other tabs load on first activation (see setupAdminTabs.activate).
      if (transactionsTabActive()) {
        maybeRefreshTxnTab();
        refreshWeeklyPerformance();
      } else if (document.getElementById("panel-issuer")?.classList.contains("tab-panel-active")) {
        refreshIssuerAdmin();
      } else {
        refreshRecipients();
        adminApi.refreshDispatchData?.();
      }
    } else {
      updateIssuerAuthGate();
      updateTxnAuthGate();
      updateRecipientConfidentialUI();
      const idtb = document.getElementById("issuer-drivers-tbody");
      if (idtb) {
        idtb.innerHTML =
          '<tr><td colspan="5" class="muted">Unlock to load drivers.</td></tr>';
      }
    }
  };

  // Expose the recipients loader to top-level callers (tab activation,
  // DOMContentLoaded, combined driver card) via the refreshRecipients bridge.
  _refreshRecipientsImpl = refreshRecipients;

  setupIssuerAdminEvents();
  setupTxnEvents();
  setupWeeklyPerformanceEvents();
  setupTrackEvents();
  setupWorkStatusAndLiveCountEvents();

  applySummaryZoom(1);
  applyTxZoom(1);
  applyTxnUnifiedZoom(1);
  updateRecipientConfidentialUI();

  // Publish closure-owned handlers so module-scope callers (tab activation,
  // etc.) can reach them. Must happen before applyLoggedInUI() so any
  // ordering between setupEvents() and tab activation is safe.
  adminApi.refreshRecipients = refreshRecipients;
  adminApi.refreshDispatchData = () => {
    void Promise.allSettled([refreshTransactions(), refreshLatest(), refreshSummary()]);
  };

  // Initial lock layout: without this, first paint shows tables before any login attempt.
  applyLoggedInUI(!!String(getStoredPassword() || "").trim());
}

window.addEventListener("DOMContentLoaded", async () => {
  const activateTab = setupAdminTabs();
  activateTab("transactions");
  checkHealth();
  setupEvents();
  updateTxnAuthGate();
  renderUnifiedTransactions();
  // refreshRecipients() is owned by setupEvents() and is already invoked
  // through applyLoggedInUI() at the end of setupEvents(); calling it here
  // would reference an undefined name in this scope (TDZ ReferenceError).
  await tryInitialLogin();
  // applyLoggedInUI (called inside tryInitialLogin) loads the visible tab's
  // data; the old explicit re-kick here caused duplicate joined fetches.
});


