/**
 * OpenAI lead parsing for the dispatch bot's AI-agent chat mode.
 * Extracts structured tag-order fields from free text or an uploaded
 * document (image/PDF) so a supervisor can paste/forward a lead and get a
 * ready-to-generate order.
 *
 * Mirrors the parent server's /parse-text + /parse-document behaviour:
 * gpt-4o-mini, temperature 0, strict JSON, nulls/whitespace stripped.
 *
 * Env: OPENAI_API_KEY, OPENAI_MODEL (default gpt-4o-mini).
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const FIELDS = [
  "firstName", "lastName", "email", "phone",
  "address", "address2", "city", "state", "zip",
  "vin", "year", "make", "model", "color", "body",
  "insuranceCompany", "policyNumber", "notes",
];

const SYSTEM_PROMPT =
  "You extract US vehicle temporary-tag order details from messy text or scanned documents. " +
  "Reply with a single JSON object only. Use these keys: " +
  FIELDS.join(", ") +
  ". Use the 2-letter USPS state code for `state`. Leave a field out (or null) if not present. " +
  "Never invent data. `vin` is 17 chars; strip spaces. `year` is a 4-digit string.";

function clean(obj) {
  const out = {};
  for (const key of FIELDS) {
    let v = obj?.[key];
    if (v == null) continue;
    v = String(v).trim();
    if (!v) continue;
    if (key === "vin") v = v.replace(/\s+/g, "").toUpperCase();
    if (key === "state") v = v.toUpperCase().slice(0, 2);
    if (key === "year") v = v.replace(/\D/g, "").slice(0, 4);
    out[key] = v;
  }
  return out;
}

async function callOpenAi(messages) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content || "{}";
  return clean(JSON.parse(content));
}

/**
 * Parse a plain-text lead ("John Doe, VIN 1FT..., 2019 Ford F150 black, NJ ...").
 * @param {string} text
 * @returns {Promise<Record<string,string>>}
 */
export async function parseTagInfoText(text) {
  return callOpenAi([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Extract the order fields:\n\n${text}` },
  ]);
}

/**
 * Parse an uploaded document (image or PDF) via vision.
 * @param {Uint8Array|Buffer} bytes
 * @param {string} mimeType  e.g. "image/jpeg", "application/pdf"
 * @returns {Promise<Record<string,string>>}
 */
export async function parseTagInfoDocument(bytes, mimeType = "image/jpeg") {
  const b64 = Buffer.from(bytes).toString("base64");
  const dataUrl = `data:${mimeType};base64,${b64}`;
  return callOpenAi([
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: "Extract the tag-order fields from this document." },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    },
  ]);
}

/** True when a key is configured — lets callers show a helpful message. */
export function openAiEnabled() {
  return Boolean(OPENAI_API_KEY);
}
