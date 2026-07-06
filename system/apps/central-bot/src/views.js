/**
 * Server-rendered dashboard HTML. Carries the NJ brand system (ink / plate /
 * amber, Oswald + Archivo) so it reads as one product with the two sites.
 * Kept dependency-free: plain template strings, tiny inline JS for forms.
 */

function esc(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;
const dt = (s) => (s ? new Date(s).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—");
const d = (s) => (s ? new Date(s).toLocaleDateString("en-US", { dateStyle: "medium" }) : "—");

const CSS = `
:root{--ink:#12161C;--ink7:#232B36;--plate:#F5F3EC;--reg:#1F5E3A;--amber:#E8A33D;--amber2:#C77F1E;--slate:#5A6472;--line:rgba(18,22,28,.10)}
*{box-sizing:border-box}body{margin:0;background:var(--plate);color:var(--ink);font-family:Archivo,-apple-system,Segoe UI,sans-serif;
  background-image:radial-gradient(circle at 12% 0,rgba(232,163,61,.06),transparent 40%),radial-gradient(circle at 88% 4%,rgba(31,94,58,.05),transparent 42%)}
a{color:var(--ink)}
.wrap{max-width:1100px;margin:0 auto;padding:0 20px}
header.top{background:var(--ink);color:var(--plate)}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;max-width:1100px;margin:0 auto}
.brand{font-family:Oswald,sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:19px}
.brand b{color:var(--amber)}
nav.tabs{display:flex;gap:4px;flex-wrap:wrap;background:var(--ink7)}
nav.tabs a{padding:12px 16px;color:#cdd3db;text-decoration:none;font-family:Oswald,sans-serif;text-transform:uppercase;font-size:13px;letter-spacing:.5px}
nav.tabs a.active{background:var(--plate);color:var(--ink)}
h1.page{font-family:Oswald,sans-serif;text-transform:uppercase;letter-spacing:.5px;font-size:26px;margin:26px 0 18px}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}
.stat{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px}
.stat .k{font-family:Oswald,sans-serif;text-transform:uppercase;letter-spacing:.12em;font-size:11px;color:var(--slate)}
.stat .v{font-family:Oswald,sans-serif;font-weight:700;font-size:30px;margin-top:6px}
.stat .sub{font-size:12px;color:var(--slate);margin-top:4px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px;margin-top:18px}
table{width:100%;border-collapse:collapse;font-size:14px}
th{font-family:Oswald,sans-serif;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--slate);text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}
td{padding:9px 10px;border-bottom:1px solid var(--line)}
tr:last-child td{border-bottom:0}
.pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600}
.pill.tag{background:rgba(31,94,58,.12);color:var(--reg)}
.pill.insurance{background:rgba(232,163,61,.16);color:var(--amber2)}
.pill.accepted{background:rgba(232,163,61,.16);color:var(--amber2)}
.pill.delivered{background:rgba(31,94,58,.12);color:var(--reg)}
.pill.assigned{background:rgba(90,100,114,.14);color:var(--slate)}
.pill.due{background:rgba(200,60,60,.12);color:#b23}
input,button{font-family:inherit;font-size:14px}
input{border:1px solid var(--line);border-radius:9px;padding:9px 11px;width:100%}
.row{display:grid;gap:10px;grid-template-columns:1fr 1fr 1fr auto;align-items:end}
.row .fld label{display:block;font-family:Oswald,sans-serif;text-transform:uppercase;font-size:11px;letter-spacing:.1em;color:var(--slate);margin-bottom:4px}
.btn{background:var(--ink);color:var(--plate);border:0;border-radius:999px;padding:10px 18px;font-family:Oswald,sans-serif;text-transform:uppercase;letter-spacing:.5px;cursor:pointer}
.btn.amber{background:var(--amber);color:var(--ink)}
.btn.mini{padding:5px 12px;font-size:12px}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
form.inline{display:inline}
.muted{color:var(--slate);font-size:13px}
.empty{padding:26px;text-align:center;color:var(--slate)}
.flash{background:rgba(31,94,58,.1);color:var(--reg);border:1px solid rgba(31,94,58,.25);border-radius:10px;padding:10px 14px;margin-top:14px;font-size:14px}
`;

function layout(active, title, body) {
  const tab = (href, label) =>
    `<a href="${href}" class="${active === href ? "active" : ""}">${label}</a>`;
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)} · NJ Control</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Oswald:wght@500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<header class="top"><div class="topbar"><span class="brand"><b>NJ</b> Control</span>
<form class="inline" method="post" action="/logout"><button class="btn ghost mini" style="color:#cdd3db;border-color:#39424f">Sign out</button></form></div>
<nav class="tabs"><div class="wrap" style="display:flex;gap:4px;flex-wrap:wrap;padding:0">
${tab("/", "Overview")}${tab("/transactions", "Transactions")}${tab("/deliveries", "Deliveries")}${tab("/renewals", "Renewals")}${tab("/drivers", "Drivers")}${tab("/supervisors", "Supervisors")}
</div></nav></header>
<main class="wrap">${body}</main></body></html>`;
}

export function loginPage(error) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/><title>Sign in · NJ Control</title>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&family=Oswald:wght@600;700&display=swap" rel="stylesheet">
<style>${CSS}body{display:grid;place-items:center;min-height:100dvh}</style></head><body>
<form method="post" action="/login" class="card" style="width:340px;margin:0">
<div class="brand" style="color:var(--ink);margin-bottom:6px"><b style="color:var(--amber2)">NJ</b> Control</div>
<p class="muted" style="margin:0 0 16px">Sign in to the operations dashboard.</p>
${error ? `<div class="flash" style="background:rgba(200,60,60,.1);color:#b23;border-color:rgba(200,60,60,.25)">${esc(error)}</div>` : ""}
<label style="font-family:Oswald,sans-serif;text-transform:uppercase;font-size:11px;letter-spacing:.1em;color:var(--slate)">Admin password</label>
<input type="password" name="password" autofocus style="margin:6px 0 14px" required/>
<button class="btn" style="width:100%">Sign in</button></form></body></html>`;
}

export function overviewPage(o) {
  const stat = (k, v, sub) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
  return layout("/", "Overview", `<h1 class="page">Overview</h1>
  <div class="grid">
    ${stat("Total revenue", money(o.revenueCents), `${o.txnCount} paid transactions`)}
    ${stat("Tags", money(o.tagRevenueCents), `${o.tagCount} orders`)}
    ${stat("Insurance", money(o.insRevenueCents), `${o.insCount} payments`)}
    ${stat("Users", o.userCount, "registered")}
    ${stat("Deliveries", `${o.deliveriesOpen}`, `open · ${o.deliveriesDone} delivered`)}
    ${stat("Renewals due", o.renewalsDue, "awaiting reminder")}
  </div>
  <div class="card"><div class="row" style="grid-template-columns:1fr auto"><div><b style="font-family:Oswald,sans-serif;text-transform:uppercase;letter-spacing:.5px">Renewal sweep</b><div class="muted">Email every customer whose 28-day tag is due and not yet reminded.</div></div>
  <form method="post" action="/renewals/run"><button class="btn amber">Run sweep now</button></form></div></div>`);
}

export function transactionsPage(rows) {
  const body = rows.length
    ? `<table><thead><tr><th>When</th><th>Source</th><th>Amount</th><th>Status</th><th>Stripe id</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${dt(r.created_at)}</td><td><span class="pill ${r.source}">${esc(r.source)}</span></td><td>${money(r.amount_cents)}</td><td>${esc(r.status)}</td><td class="muted">${esc((r.stripe_id || "").slice(0, 28))}</td></tr>`).join("")}
    </tbody></table>`
    : `<div class="empty">No transactions yet.</div>`;
  return layout("/transactions", "Transactions", `<h1 class="page">Transactions</h1><div class="card">${body}</div>`);
}

export function deliveriesPage(rows) {
  const body = rows.length
    ? `<table><thead><tr><th>Assigned</th><th>Order</th><th>Driver</th><th>Status</th><th>Receipt</th></tr></thead><tbody>
    ${rows.map((r) => {
      const o = r.orders || {};
      const who = `${o.first_name || ""} ${o.last_name || ""}`.trim();
      return `<tr><td>${dt(r.assigned_at)}</td><td>${esc(o.plate || "—")} <span class="muted">${esc(who)}</span></td><td>${esc(r.drivers?.name || "—")}</td><td><span class="pill ${esc(r.status)}">${esc(r.status)}</span></td><td>${r.receipt_url ? `<a href="${esc(r.receipt_url)}" target="_blank">View</a>` : "—"}</td></tr>`;
    }).join("")}
    </tbody></table>`
    : `<div class="empty">No deliveries yet.</div>`;
  return layout("/deliveries", "Deliveries", `<h1 class="page">Deliveries</h1><div class="card">${body}</div>`);
}

export function renewalsPage(rows) {
  const now = Date.now();
  const body = rows.length
    ? `<table><thead><tr><th>Customer</th><th>Plate</th><th>First paid</th><th>Renewal due</th><th>Status</th><th>Reminders</th></tr></thead><tbody>
    ${rows.map((r) => {
      const due = r.renewal_due_at && new Date(r.renewal_due_at).getTime() <= now && !r.renewal_reminded_at;
      return `<tr><td>${esc(`${r.first_name || ""} ${r.last_name || ""}`.trim() || r.email || "—")}</td><td>${esc(r.plate || "—")}</td><td>${d(r.paid_at)}</td><td>${d(r.renewal_due_at)}</td><td>${due ? `<span class="pill due">Due</span>` : r.renewal_reminded_at ? `<span class="pill delivered">Reminded</span>` : `<span class="pill assigned">Scheduled</span>`}</td><td>${r.renewal_count || 0}</td></tr>`;
    }).join("")}
    </tbody></table>`
    : `<div class="empty">No paid orders with a renewal date yet.</div>`;
  return layout("/renewals", "Renewals", `<h1 class="page">Renewals</h1>
  <div class="card"><form method="post" action="/renewals/run" style="display:flex;justify-content:space-between;align-items:center"><span class="muted">Manually email everyone whose renewal is due and unreminded.</span><button class="btn amber">Run sweep now</button></form></div>
  <div class="card">${body}</div>`);
}

export function driversPage(rows, flash) {
  const body = rows.length
    ? `<table><thead><tr><th>Name</th><th>Email</th><th>Telegram id</th><th>Status</th><th></th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.email)}</td><td class="muted">${esc(r.telegram_id)}</td><td>${r.active ? `<span class="pill delivered">Active</span>` : `<span class="pill assigned">Off</span>`}</td>
    <td style="text-align:right;white-space:nowrap">
      <form class="inline" method="post" action="/drivers/${r.id}/toggle"><button class="btn ghost mini">${r.active ? "Deactivate" : "Activate"}</button></form>
      <form class="inline" method="post" action="/drivers/${r.id}/delete" onsubmit="return confirm('Remove ${esc(r.name)}?')"><button class="btn ghost mini">Remove</button></form>
    </td></tr>`).join("")}
    </tbody></table>`
    : `<div class="empty">No drivers yet — add one below.</div>`;
  return layout("/drivers", "Drivers", `<h1 class="page">Drivers</h1>
  ${flash ? `<div class="flash">${esc(flash)}</div>` : ""}
  <div class="card"><form method="post" action="/drivers/add"><div class="row">
    <div class="fld"><label>Name</label><input name="name" required></div>
    <div class="fld"><label>Email</label><input name="email" type="email" required></div>
    <div class="fld"><label>Telegram id</label><input name="telegram_id" required></div>
    <button class="btn">Add driver</button>
  </div></form></div>
  <div class="card">${body}</div>`);
}

export function supervisorsPage(rows, flash) {
  const body = rows.length
    ? `<table><thead><tr><th>Name</th><th>Telegram id</th><th>Status</th><th></th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="muted">${esc(r.telegram_id)}</td><td>${r.active ? `<span class="pill delivered">Active</span>` : `<span class="pill assigned">Off</span>`}</td>
    <td style="text-align:right;white-space:nowrap">
      <form class="inline" method="post" action="/supervisors/${r.id}/toggle"><button class="btn ghost mini">${r.active ? "Deactivate" : "Activate"}</button></form>
      <form class="inline" method="post" action="/supervisors/${r.id}/delete" onsubmit="return confirm('Remove ${esc(r.name)}?')"><button class="btn ghost mini">Remove</button></form>
    </td></tr>`).join("")}
    </tbody></table>`
    : `<div class="empty">No supervisors yet — add one below.</div>`;
  return layout("/supervisors", "Supervisors", `<h1 class="page">Supervisors</h1>
  ${flash ? `<div class="flash">${esc(flash)}</div>` : ""}
  <div class="card"><form method="post" action="/supervisors/add"><div class="row" style="grid-template-columns:1fr 1fr auto">
    <div class="fld"><label>Name</label><input name="name" required></div>
    <div class="fld"><label>Telegram id</label><input name="telegram_id" required></div>
    <button class="btn">Add supervisor</button>
  </div></form></div>
  <div class="card">${body}</div>`);
}
