/**
 * Krableads ingest simulation — message format, idempotency, mock HTTP, optional live probe.
 * Run: node scripts/simulate-krableads-ingest.mjs
 */
import http from "node:http";
import { buildKrableadsLeadMessage, submitLeadToKrableads, isKrableadsIngestEnabled } from "../server/krableads-ingest.js";

const SAMPLE_ORDER = {
  id: "bf6923ca-1234-5678-abcd-ef0123456789",
  firstName: "Zebin",
  lastName: "Fang Fang",
  phone: "+1 (213) 862-2301",
  deliveryEmail: "zebinfang1002@gmail.com",
  deliveryMethod: "email",
  address: "28 brookside rd quincy MA 02169",
  deliveryAddress: "28 brookside rd quincy MA 02169",
  vin: "SCA665C56HUX86704",
  year: "2017",
  make: "ROLLS-ROYCE",
  model: "Wraith",
  color: "black",
  insuranceCompany: "AC Insurance",
  policyNumber: "279-06071-913",
  serviceTitle: "30-Day NJ Temp Tag",
  productChoice: "tag_only",
  price: 150,
};

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

// --- 1. Message builder ---
section("buildKrableadsLeadMessage");
const msg = buildKrableadsLeadMessage(SAMPLE_ORDER);
console.log("--- sample message ---\n" + msg + "\n----------------------");
assert(msg.includes("🆕 New Lead"), "has New Lead header");
assert(msg.includes("Order #bf6923ca"), "order id first 8 chars");
assert(msg.includes("Customer: Zebin Fang Fang"), "customer name");
assert(msg.includes("Phone: 2138622301"), "normalized US phone");
assert(msg.includes("Registration address: 28 brookside"), "registration address");
assert(msg.includes("Delivery address: 28 brookside"), "delivery address");
assert(msg.includes("VIN: SCA665C56HUX86704"), "VIN uppercase");
assert(msg.includes("Vehicle: 2017 ROLLS-ROYCE Wraith, black"), "vehicle line");
assert(msg.includes("Price: $150"), "price with dollar sign");
assert(/Price: \$[\d.]+/.test(msg), "price matches parser pattern");

// --- 2. Idempotency (no API key needed) ---
section("idempotency without POST");
const origKey = process.env.KRABLEADS_INGEST_API_KEY;
process.env.KRABLEADS_INGEST_API_KEY = "test-key-sim";
const cached = await submitLeadToKrableads({
  ...SAMPLE_ORDER,
  krableadsReferenceId: "REF-EXISTING-123",
  krableadsLeadId: "lead-abc",
});
assert(cached.ok && cached.cached && cached.reference_id === "REF-EXISTING-123", "returns cached ref without fetch");

// --- 3. Mock ingest server ---
section("mock ingest server");
let mockPostCount = 0;
let lastMockBody = "";
const mockServer = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/v1/leads/ingest") {
    const auth = req.headers.authorization || "";
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      lastMockBody = body;
      mockPostCount++;
      if (!auth.includes("Bearer test-key-sim")) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          reference_id: "KRAB-REF-SIM-001",
          lead_id: "lead-sim-uuid",
          external_order_id: "bf6923ca",
        })
      );
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
const { port } = mockServer.address();
process.env.KRABLEADS_INGEST_URL = `http://127.0.0.1:${port}/api/v1/leads/ingest`;

const freshOrder = { ...SAMPLE_ORDER };
delete freshOrder.krableadsReferenceId;
const ingestOk = await submitLeadToKrableads(freshOrder);
assert(ingestOk.ok && ingestOk.reference_id === "KRAB-REF-SIM-001", "successful ingest returns reference_id");
assert(ingestOk.lead_id === "lead-sim-uuid", "returns lead_id");
assert(mockPostCount === 1, "exactly one POST on first submit");
assert(lastMockBody.includes("Order #bf6923ca"), "POST body contains order short id");

const ingestCached = await submitLeadToKrableads({
  ...freshOrder,
  krableadsReferenceId: ingestOk.reference_id,
});
assert(ingestCached.cached && mockPostCount === 1, "second submit with ref skips POST");

// Bad key
process.env.KRABLEADS_INGEST_API_KEY = "wrong-key";
const badAuth = await submitLeadToKrableads({ ...freshOrder, id: "aaaa1111-bbbb-cccc-dddd-eeeeeeeeeeee" });
assert(!badAuth.ok && badAuth.status === 401, "401 on bad API key");

// --- 4. isKrableadsIngestEnabled ---
section("isKrableadsIngestEnabled");
delete process.env.KRABLEADS_INGEST_API_KEY;
assert(!isKrableadsIngestEnabled(), "disabled when key unset");
process.env.KRABLEADS_INGEST_API_KEY = "  ";
assert(!isKrableadsIngestEnabled(), "disabled when key whitespace");
process.env.KRABLEADS_INGEST_API_KEY = "real-key";
assert(isKrableadsIngestEnabled(), "enabled when key set");

// --- 5. Optional live probe (no secret printed) ---
section("live endpoint probe (unauthenticated)");
const liveUrl = process.env.KRABLEADS_LIVE_URL || "https://krab-issuer-admin.onrender.com/api/v1/leads/ingest";
try {
  const liveRes = await fetch(liveUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "test",
    signal: AbortSignal.timeout(15000),
  });
  const liveStatus = liveRes.status;
  console.log(`  → ${liveUrl} responded HTTP ${liveStatus} (expect 401 without Bearer)`);
  assert(liveStatus === 401 || liveStatus === 403 || liveStatus === 422, "live endpoint reachable and rejects bad auth");
} catch (e) {
  console.log(`  ⚠ live probe skipped: ${e.message}`);
}

// restore env
if (origKey !== undefined) process.env.KRABLEADS_INGEST_API_KEY = origKey;
else delete process.env.KRABLEADS_INGEST_API_KEY;
delete process.env.KRABLEADS_INGEST_URL;

await new Promise((resolve) => mockServer.close(resolve));

console.log("\n✅ All krableads ingest simulations passed.\n");
