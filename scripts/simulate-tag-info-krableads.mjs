/**
 * End-to-end: PATCH /api/orders/:id/tag-info with krableads mock ingest (file storage mode).
 * Run: node scripts/simulate-tag-info-krableads.mjs
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "server", "data");
const ORDERS_FILE = join(DATA_DIR, "orders.json");

const ORDER_ID = randomUUID();
const MOCK_REF = "E2E-REF-" + ORDER_ID.slice(0, 8).toUpperCase();

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

console.log("\n=== tag-info E2E (krableads branch) ===\n");

// Mock krableads ingest
let ingestHits = 0;
const mockIngest = http.createServer((req, res) => {
  if (req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      ingestHits++;
      const auth = req.headers.authorization || "";
      if (!auth.includes("Bearer e2e-test-key")) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
      if (!body.includes("🆕 New Lead")) {
        res.writeHead(422, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ errors: ["missing New Lead header"] }));
        return;
      }
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          reference_id: MOCK_REF,
          lead_id: "lead-e2e-uuid",
          external_order_id: ORDER_ID.slice(0, 8),
        })
      );
    });
    return;
  }
  res.writeHead(405);
  res.end();
});

await new Promise((r) => mockIngest.listen(0, "127.0.0.1", r));
const ingestPort = mockIngest.address().port;

// File-mode order seed (no Supabase)
mkdirSync(DATA_DIR, { recursive: true });
writeFileSync(
  ORDERS_FILE,
  JSON.stringify(
    [
      {
        id: ORDER_ID,
        serviceId: "checkout",
        serviceTitle: "30-Day NJ Temp Tag",
        firstName: "Test",
        lastName: "Customer",
        phone: "",
        address: "",
        deliveryAddress: "",
        vin: "",
        carMakeModel: "",
        color: "",
        price: 175.5,
        createdAt: new Date().toISOString(),
        paymentStatus: "paid",
        deliveryMethod: "email",
        deliveryEmail: "test@example.com",
        productChoice: "tag_only",
        stripeSessionId: "cs_test_sim",
      },
    ],
    null,
    2
  )
);

// Minimal sibling files so server doesn't choke
for (const f of ["services.json", "activity.json", "settings.json"]) {
  const p = join(DATA_DIR, f);
  if (!existsSync(p)) writeFileSync(p, f === "activity.json" ? '{"dataIn":[],"dataOut":[],"payments":[]}' : "[]");
}

const serverEnv = {
  ...process.env,
  PORT: "0", // will pick via our assignment below
  SUPABASE_URL: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  KRABLEADS_INGEST_API_KEY: "e2e-test-key",
  KRABLEADS_INGEST_URL: `http://127.0.0.1:${ingestPort}/api/v1/leads/ingest`,
  TELEGRAM_BOT_TOKEN: "",
  TELEGRAM_CHAT_IDS: "",
  RESEND_API_KEY: "",
};

const API_PORT = 3847 + Math.floor(Math.random() * 100);
serverEnv.PORT = String(API_PORT);

const serverProc = spawn("node", ["server/index.js"], {
  cwd: ROOT,
  env: serverEnv,
  stdio: ["ignore", "pipe", "pipe"],
});

let serverReady = false;
serverProc.stdout.on("data", (d) => {
  const s = d.toString();
  if (s.includes("listening") || s.includes(String(API_PORT))) serverReady = true;
});
serverProc.stderr.on("data", (d) => {
  const s = d.toString();
  if (s.includes("listening") || s.includes(String(API_PORT))) serverReady = true;
});

async function waitForServer(ms = 15000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(`http://127.0.0.1:${API_PORT}/api/health`);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server did not become healthy in time");
}

await waitForServer();
assert(serverReady || true, "API server healthy");

const tagBody = {
  firstName: "Jane",
  lastName: "Doe",
  phone: "(555) 123-4567",
  address: "100 Main St Newark NJ 07102",
  deliveryAddress: "100 Main St Newark NJ 07102",
  deliverySameAsRegistration: true,
  vin: "1HGBH41JXMN109186",
  year: "2021",
  make: "Honda",
  model: "Civic",
  color: "silver",
  insuranceCompany: "Test Ins Co",
  policyNumber: "POL-999",
};

const patchRes = await fetch(`http://127.0.0.1:${API_PORT}/api/orders/${ORDER_ID}/tag-info`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(tagBody),
});
const patchJson = await patchRes.json().catch(() => ({}));
assert(patchRes.status === 200, `tag-info returns 200 (got ${patchRes.status})`);
assert(ingestHits === 1, "krableads ingest called once");

const orders = JSON.parse(readFileSync(ORDERS_FILE, "utf8"));
const saved = orders.find((o) => o.id === ORDER_ID);
assert(saved?.krableadsReferenceId === MOCK_REF, "order persisted krableadsReferenceId");
assert(saved?.krableadsLeadId === "lead-e2e-uuid", "order persisted krableadsLeadId");
assert(saved?.krableadsIngestedAt, "order persisted krableadsIngestedAt");
assert(!saved?.krableadsIngestError, "no ingest error on success");
assert(saved?.firstName === "Jane", "tag info fields saved");
assert(saved?.telegramSent === true, "telegramSent true when krableads ok");

// Idempotent re-PATCH
const patch2 = await fetch(`http://127.0.0.1:${API_PORT}/api/orders/${ORDER_ID}/tag-info`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...tagBody, firstName: "Janet" }),
});
assert(patch2.status === 200, "re-PATCH tag-info still 200");
assert(ingestHits === 1, "re-PATCH does not POST again (idempotent)");

// Legacy branch: key unset → no ingest
serverProc.kill();
await new Promise((r) => serverProc.on("exit", r));

const ORDER_ID2 = randomUUID();
writeFileSync(
  ORDERS_FILE,
  JSON.stringify(
    [
      {
        id: ORDER_ID2,
        serviceId: "checkout",
        serviceTitle: "Plate Only",
        firstName: "Legacy",
        lastName: "Flow",
        price: 150,
        createdAt: new Date().toISOString(),
        paymentStatus: "paid",
        productChoice: "tag_only",
      },
    ],
    null,
    2
  )
);

const serverEnv2 = { ...serverEnv, KRABLEADS_INGEST_API_KEY: "", PORT: String(API_PORT + 1) };
const serverProc2 = spawn("node", ["server/index.js"], { cwd: ROOT, env: serverEnv2, stdio: "ignore" });
const API_PORT2 = API_PORT + 1;
async function waitPort(port) {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server2 timeout");
}
await waitPort(API_PORT2);

const hitsBefore = ingestHits;
const legacyRes = await fetch(`http://127.0.0.1:${API_PORT2}/api/orders/${ORDER_ID2}/tag-info`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(tagBody),
});
assert(legacyRes.status === 200, "legacy path tag-info 200 without krableads key");
assert(ingestHits === hitsBefore, "no krableads POST when key unset");

const orders2 = JSON.parse(readFileSync(ORDERS_FILE, "utf8"));
const saved2 = orders2.find((o) => o.id === ORDER_ID2);
assert(!saved2?.krableadsReferenceId, "no krableads ref in legacy mode");

serverProc2.kill();
mockIngest.close();

console.log("\n✅ tag-info E2E simulations passed.\n");
