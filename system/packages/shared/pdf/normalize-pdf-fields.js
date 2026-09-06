/**
 * Normalize checkout fields to the exact formats expected on NJ temp-tag PDFs:
 *   color → 3-letter uppercase code (BLK, RED, BLU, YLW, …)
 *   body  → "Sedan 4DR", "SUV 4DR", "Extended Cab 2DR", etc.
 *
 * Uses OpenAI when OPENAI_API_KEY is set; falls back to deterministic rules.
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_PARSE_MODEL || "gpt-4o-mini";

const COLOR_MAP = {
  black: "BLK",
  blk: "BLK",
  bk: "BLK",
  white: "WHT",
  wht: "WHT",
  red: "RED",
  blue: "BLU",
  blu: "BLU",
  yellow: "YLW",
  yel: "YLW",
  green: "GRN",
  grn: "GRN",
  gray: "GRY",
  grey: "GRY",
  gry: "GRY",
  silver: "SLV",
  sil: "SLV",
  slv: "SLV",
  brown: "BRN",
  brn: "BRN",
  orange: "ORG",
  org: "ORG",
  gold: "GLD",
  gld: "GLD",
  beige: "BGE",
  bge: "BGE",
  tan: "TAN",
  purple: "PUR",
  pur: "PUR",
  pink: "PNK",
  pnk: "PNK",
  maroon: "MRN",
  mrn: "MRN",
  navy: "NVY",
  nvy: "NVY",
  charcoal: "CHR",
  chr: "CHR",
  burgundy: "BRG",
  brg: "BRG",
  cream: "CRM",
  crm: "CRM",
  bronze: "BRZ",
  brz: "BRZ",
  copper: "CPR",
  cpr: "CPR",
};

const VALID_COLOR_CODES = new Set(Object.values(COLOR_MAP));

function titleToken(word) {
  if (!word) return "";
  const lower = word.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Title-case make/model for PDF: "Toyota", "Camry". */
export function formatMakeForPdf(raw) {
  return String(raw || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(titleToken)
    .join(" ");
}

export function formatModelForPdf(raw) {
  return formatMakeForPdf(raw);
}

const BODY_ACRONYMS = new Set(["SUV", "ATV", "RV"]);

/** Body style for PDF: "Sedan 4DR", "Crew-Cab 2DR", "SUV 4DR" — only DR suffix all-caps. */
export function formatBodyForPdf(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const m = s.match(/^(.+?)\s+(\d)\s*DR$/i);
  if (!m) {
    return s
      .split(/\s+/)
      .map((w) => {
        if (BODY_ACRONYMS.has(w.toUpperCase())) return w.toUpperCase();
        return w.split("-").map(titleToken).join("-");
      })
      .join(" ");
  }
  const style = m[1]
    .split(/\s+/)
    .map((w) => {
      if (BODY_ACRONYMS.has(w.toUpperCase())) return w.toUpperCase();
      return w.split("-").map(titleToken).join("-");
    })
    .join(" ");
  return `${style} ${m[2]}DR`;
}

/** Map NHTSA body class + door count → PDF body string. */
export function suggestBodyFromNhtsa(bodyClass, doors, bodyCabType) {
  const bc = String(bodyClass || "").trim();
  const cab = String(bodyCabType || "").trim();
  const doorNum = Number(String(doors || "").replace(/\D/g, ""));
  const dr = doorNum > 0 ? `${doorNum}DR` : guessDoorsFromText(bc, cab);

  const lower = `${bc} ${cab}`.toLowerCase();
  if (/suv|sport utility|crossover|mpv/i.test(lower)) return `SUV ${dr === "2DR" ? "4DR" : dr}`;
  if (/sedan|saloon|hatchback/i.test(lower)) return `Sedan ${dr === "2DR" ? "4DR" : dr}`;
  if (/coupe|convertible|roadster/i.test(lower)) return `Coupe ${dr === "4DR" ? "2DR" : dr}`;
  if (/cargo|van|minivan/i.test(lower)) return "Cargo 3DR";
  if (/pickup|truck/i.test(lower)) {
    if (/crew/i.test(lower)) return "Crew-Cab 2DR";
    if (/extended|double|super/i.test(lower)) return "Extended Cab 2DR";
    if (/regular|standard|single/i.test(lower)) return "Regular Cab 2DR";
    return "Extended Cab 2DR";
  }
  if (/semi|tractor|trailer/i.test(lower)) return "Semi-Trailer Truck 2DR";
  if (/wagon/i.test(lower)) return `Sedan ${dr === "2DR" ? "4DR" : dr}`;
  if (bc) return `${titleToken(bc.split(/[\s/]+/)[0])} ${dr}`;
  return "";
}

function guessDoorsFromText(...parts) {
  const text = parts.filter(Boolean).join(" ");
  const m = text.match(/(\d)\s*[- ]?\s*dr\b/i);
  if (m) return `${m[1]}DR`;
  if (/coupe|pickup|truck|roadster|convertible|2[- ]door/i.test(text)) return "2DR";
  if (/cargo|3[- ]door|3dr/i.test(text)) return "3DR";
  return "4DR";
}

function formatBodyLabel(raw) {
  return formatBodyForPdf(raw);
}

export function normalizeColorHeuristic(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const up = s.toUpperCase().replace(/[^A-Z]/g, "");
  if (/^[A-Z]{3}$/.test(up) && VALID_COLOR_CODES.has(up)) return up;
  if (/^[A-Z]{3}$/.test(up)) return up;
  const key = s.toLowerCase().replace(/[^a-z]/g, "");
  if (COLOR_MAP[key]) return COLOR_MAP[key];
  for (const [name, code] of Object.entries(COLOR_MAP)) {
    if (key.includes(name) || name.includes(key)) return code;
  }
  return up.slice(0, 3).padEnd(3, "X");
}

export function normalizeBodyHeuristic(raw, hints = {}) {
  const formatted = formatBodyForPdf(raw);
  if (formatted && /\dDR$/i.test(formatted)) return formatted;
  const fromNhtsa = suggestBodyFromNhtsa(hints.bodyClass, hints.doors, hints.bodyCabType);
  if (fromNhtsa) return formatBodyForPdf(fromNhtsa);
  const s = String(raw || "").trim();
  if (!s) return "";
  const dr = guessDoorsFromText(s);
  const first = titleToken(s.split(/\s+/)[0]);
  return formatBodyForPdf(`${first} ${dr}`);
}

async function normalizeWithOpenAi(fields) {
  const key = OPENAI_API_KEY.trim();
  if (!key) return null;

  const prompt = `Normalize vehicle tag PDF fields. Output ONLY JSON with keys:
color (exactly 3 uppercase letters, e.g. BLK RED BLU YLW WHT GRN SLV),
body (format like "Sedan 4DR", "SUV 4DR", "Coupe 2DR", "Extended Cab 2DR", "Crew-Cab 2DR", "Regular Cab 2DR", "Cargo 3DR" — title case words, only the DR suffix in caps),
make (title case brand, e.g. Toyota),
model (title case, e.g. Camry),
year (4-digit string).

Input:
${JSON.stringify(fields, null, 2)}

Rules:
- color must be a standard 3-letter vehicle color code.
- body must include door count suffix like 4DR or 2DR.
- preserve meaning; do not invent data not implied by input.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You normalize US DMV temporary tag PDF fields. Reply with JSON only.",
          },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      console.warn("[normalize-pdf-fields] OpenAI HTTP", res.status);
      return null;
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    return {
      color: String(parsed.color || "").toUpperCase().slice(0, 3),
      body: formatBodyForPdf(String(parsed.body || "")),
      make: formatMakeForPdf(parsed.make),
      model: formatModelForPdf(parsed.model),
      year: String(parsed.year || "").replace(/\D/g, "").slice(0, 4),
    };
  } catch (err) {
    console.warn("[normalize-pdf-fields] OpenAI failed:", err.message);
    return null;
  }
}

/**
 * @param {object} order  Raw order with color, body, make, model, year, vin
 * @param {object} [hints]  Optional NHTSA hints: bodyClass, doors, bodyCabType
 */
export async function normalizePdfFields(order, hints = {}) {
  const input = {
    color: order.color || "",
    body: order.body || order.bodyType || "",
    make: order.make || "",
    model: order.model || "",
    year: order.year || "",
    vin: order.vin || "",
    bodyClass: hints.bodyClass || "",
    doors: hints.doors || "",
    bodyCabType: hints.bodyCabType || "",
  };

  const heuristic = {
    color: normalizeColorHeuristic(input.color),
    body: normalizeBodyHeuristic(input.body, {
      bodyClass: input.bodyClass,
      doors: input.doors,
      bodyCabType: input.bodyCabType,
    }),
    make: formatMakeForPdf(input.make),
    model: formatModelForPdf(input.model),
    year: String(input.year || "").replace(/\D/g, "").slice(0, 4),
  };

  const ai = await normalizeWithOpenAi(input);
  if (!ai) return heuristic;

  return {
    color: ai.color && /^[A-Z]{3}$/.test(ai.color) ? ai.color : heuristic.color,
    body: ai.body || heuristic.body,
    make: ai.make || heuristic.make,
    model: ai.model || heuristic.model,
    year: ai.year || heuristic.year,
  };
}
