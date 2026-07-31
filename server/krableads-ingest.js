/**
 * POST completed TriState Tags orders to krableadsV2 /api/v1/leads/ingest.
 * See krableadsV2/LEAD_INGEST.md for message format and ops setup.
 */

const DEFAULT_INGEST_URL = "https://krab-issuer-admin.onrender.com/api/v1/leads/ingest";

export function isKrableadsIngestEnabled() {
  return Boolean(process.env.KRABLEADS_INGEST_API_KEY?.trim());
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

function normalizeUsPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length === 10) return digits;
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

function formatPriceLine(order) {
  const n = typeof order.price === "number" ? order.price : parseFloat(String(order.price ?? ""));
  const amount = Number.isFinite(n) ? n : 0;
  const hasCents = Math.abs(amount - Math.round(amount)) > 0.0001;
  return `$${amount.toFixed(hasCents ? 2 : 0)}`;
}

function vehicleLine(order) {
  if (order.year && order.make && order.model) {
    const base = `${order.year} ${order.make} ${order.model}`;
    return order.color ? `${base}, ${order.color}` : base;
  }
  if (order.carMakeModel && order.color) return `${order.carMakeModel}, ${order.color}`;
  return order.carMakeModel || order.vehicleInfo || "";
}

function serviceLine(order) {
  const title = String(order.serviceTitle || "").trim();
  if (title) return title;
  return productChoiceTitle(order.productChoice);
}

/** Plain-text New Lead message matching krableads external_lead_parser labels. */
export function buildKrableadsLeadMessage(order) {
  const o = order || {};
  const shortId = String(o.id || "").slice(0, 8);
  const name = `${String(o.firstName || "").trim()} ${String(o.lastName || "").trim()}`.trim();
  const phone = normalizeUsPhone(o.phone || o.deliveryPhone);
  const regAddr = String(o.address || "").trim();
  const delAddr = String(o.deliveryAddress || o.delivery_address || regAddr).trim();
  const lines = [
    "🆕 New Lead",
    shortId ? `Order #${shortId}` : null,
    name ? `Customer: ${name}` : null,
    phone ? `Phone: ${phone}` : null,
    o.deliveryEmail ? `Delivery email: ${String(o.deliveryEmail).trim()}` : null,
    `Delivery method: ${deliveryMethodLabel(o.deliveryMethod)}`,
    regAddr ? `Registration address: ${regAddr}` : null,
    delAddr ? `Delivery address: ${delAddr}` : null,
    o.vin ? `VIN: ${String(o.vin).trim().toUpperCase()}` : null,
    vehicleLine(o) ? `Vehicle: ${vehicleLine(o)}` : null,
    o.insuranceCompany ? `Insurance: ${String(o.insuranceCompany).trim()}` : null,
    o.policyNumber ? `Policy #: ${String(o.policyNumber).trim()}` : null,
    `Service: ${serviceLine(o)}`,
    `Price: ${formatPriceLine(o)}`,
  ];
  return lines.filter(Boolean).join("\n");
}

/**
 * @returns {Promise<{ ok: true, reference_id: string, lead_id?: string, external_order_id?: string, cached?: boolean } | { ok: false, error: string, status?: number }>}
 */
export async function submitLeadToKrableads(order) {
  const apiKey = (process.env.KRABLEADS_INGEST_API_KEY || "").trim();
  if (!apiKey) {
    return { ok: false, error: "KRABLEADS_INGEST_API_KEY not configured" };
  }

  const existingRef = String(order?.krableadsReferenceId || order?.krableads_reference_id || "").trim();
  if (existingRef) {
    return {
      ok: true,
      reference_id: existingRef,
      lead_id: order.krableadsLeadId || order.krableads_lead_id || undefined,
      cached: true,
    };
  }

  const url = (process.env.KRABLEADS_INGEST_URL || DEFAULT_INGEST_URL).trim();
  const message = buildKrableadsLeadMessage(order);

  try {
    // Bounded wait: the customer's checkout PATCH awaits this call, and the
    // ingest service (Render) can cold-start. On timeout the caller falls
    // back to legacy Telegram dispatch so the lead is never stranded.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 25_000);
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: message,
        signal: abort.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    let body = null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      try {
        body = await res.json();
      } catch {
        body = null;
      }
    } else {
      const text = await res.text().catch(() => "");
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = { error: text.slice(0, 500) };
        }
      }
    }

    if (!res.ok) {
      const errParts = [];
      if (Array.isArray(body?.errors)) errParts.push(...body.errors.map(String));
      if (body?.error) errParts.push(String(body.error));
      if (body?.detail) errParts.push(String(body.detail));
      const msg = errParts.filter(Boolean).join("; ") || res.statusText || `HTTP ${res.status}`;
      return { ok: false, error: msg, status: res.status };
    }

    const referenceId = String(body?.reference_id || "").trim();
    if (!referenceId) {
      return { ok: false, error: "Ingest succeeded but response missing reference_id", status: res.status };
    }

    return {
      ok: true,
      reference_id: referenceId,
      lead_id: body?.lead_id ? String(body.lead_id) : undefined,
      external_order_id: body?.external_order_id ? String(body.external_order_id) : undefined,
    };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}
