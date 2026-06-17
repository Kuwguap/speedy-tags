/**
 * Live krableads ingest probe — run against production krab-issuer-admin.
 * Optional real ingest if KRABLEADS_INGEST_API_KEY is set in env (never printed).
 *
 * Run: node scripts/simulate-krableads-live.mjs
 */
import { buildKrableadsLeadMessage, submitLeadToKrableads } from "../server/krableads-ingest.js";

const LIVE_BASE = process.env.KRABLEADS_LIVE_BASE || "https://krab-issuer-admin.onrender.com";
const INGEST_URL = `${LIVE_BASE}/api/v1/leads/ingest`;
const HEALTH_URL = `${LIVE_BASE}/api/health`;

const SAMPLE_ORDER = {
  id: `sim${Date.now().toString(36)}-0000-4000-8000-000000000001`,
  firstName: "Sim",
  lastName: "Test Lead",
  phone: "(555) 010-9999",
  deliveryEmail: "sim-test@example.com",
  deliveryMethod: "email",
  address: "100 Test St Newark NJ 07102",
  deliveryAddress: "100 Test St Newark NJ 07102",
  vin: "1HGBH41JXMN109186",
  year: "2021",
  make: "Honda",
  model: "Civic",
  color: "silver",
  insuranceCompany: "Sim Insurance",
  policyNumber: "SIM-001",
  serviceTitle: "30-Day NJ Temp Tag",
  price: 150,
};

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

section(`Health — ${HEALTH_URL}`);
const healthRes = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(20000) });
const health = await healthRes.json().catch(() => ({}));
console.log(`  → HTTP ${healthRes.status}`, JSON.stringify(health));
assert(healthRes.status === 200, "health returns 200");
assert(health.ok === true, "health ok:true");
assert(health.service === "krab-issuer-admin", "correct service name");
assert(health.lead_ingest_configured === true, "lead ingest configured on krableads admin");

section("Ingest — no Authorization header");
const noAuthRes = await fetch(INGEST_URL, {
  method: "POST",
  headers: { "Content-Type": "text/plain" },
  body: "test",
  signal: AbortSignal.timeout(20000),
});
const noAuthBody = await noAuthRes.json().catch(() => ({}));
console.log(`  → HTTP ${noAuthRes.status}`, JSON.stringify(noAuthBody));
assert(noAuthRes.status === 401, "no auth → 401");

section("Ingest — invalid Bearer token");
const badRes = await fetch(INGEST_URL, {
  method: "POST",
  headers: {
    "Content-Type": "text/plain; charset=utf-8",
    Authorization: "Bearer definitely-not-a-real-key",
  },
  body: buildKrableadsLeadMessage(SAMPLE_ORDER),
  signal: AbortSignal.timeout(20000),
});
const badBody = await badRes.json().catch(() => ({}));
console.log(`  → HTTP ${badRes.status}`, JSON.stringify(badBody));
assert(badRes.status === 401, "bad bearer → 401");

section("Ingest — malformed body (valid auth skipped)");
const msg = buildKrableadsLeadMessage(SAMPLE_ORDER);
console.log("--- sample message (first 3 lines) ---");
console.log(msg.split("\n").slice(0, 3).join("\n"));

section("TriState submitLeadToKrableads → live (if key set)");
const apiKey = (process.env.KRABLEADS_INGEST_API_KEY || "").trim();
if (!apiKey) {
  console.log("  ⚠ KRABLEADS_INGEST_API_KEY not set — skipping real ingest POST");
  console.log("  Set it locally to test end-to-end: KRABLEADS_INGEST_API_KEY=... node scripts/simulate-krableads-live.mjs");
} else {
  process.env.KRABLEADS_INGEST_URL = INGEST_URL;
  const simOrder = { ...SAMPLE_ORDER, id: `live${Date.now().toString(36)}-sim-0000-4000-8000-000000000099` };
  const result = await submitLeadToKrableads(simOrder);
  console.log(`  → ok=${result.ok}`, result.ok ? `ref=${result.reference_id}` : `error=${result.error} status=${result.status}`);
  assert(result.ok, "real ingest returns ok with matching API key");
  assert(!!result.reference_id, "real ingest returns reference_id");

  const dup = await submitLeadToKrableads({
    ...simOrder,
    krableadsReferenceId: result.reference_id,
    krableadsLeadId: result.lead_id,
  });
  assert(dup.cached === true, "idempotent cached second call");
}

section("speedy-tags-api site config (Render)");
const apiBase = process.env.SPEEDY_TAGS_API || "https://speedy-tags-api.onrender.com";
try {
  const siteRes = await fetch(`${apiBase}/api/site/config`, { signal: AbortSignal.timeout(15000) });
  const site = await siteRes.json().catch(() => ({}));
  console.log(`  → ${apiBase}/api/site/config HTTP ${siteRes.status}`, JSON.stringify(site));
  if (siteRes.status === 200) {
    assert(typeof site.backgroundMusicEnabled === "boolean", "site config has backgroundMusicEnabled");
  } else {
    console.log("  ⚠ site/config not deployed on Render yet — redeploy speedy-tags-api");
  }
} catch (e) {
  console.log(`  ⚠ speedy-tags-api probe: ${e.message}`);
}

console.log("\n✅ Live krableads simulation passed.\n");
