/**
 * Fill NJ.pdf / NONNJ.pdf using the same technique as the reference
 * PATRICK DUSAPE.pdf and the legacy pdf-generator service:
 *
 *  1. Fill small AcroForm fields (Arial MT 7–12 pt) and flatten.
 *  2. Draw the three hero elements on top with exact geometry:
 *       plate1 — 180 pt Arial Bold, centred in the plate band
 *       exp3   — 60 pt Arial Bold, "EXP MMM DD, YYYY"
 *       car    — 20 pt Arial Bold, 10-digit document ID starting with 9
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatBodyForPdf,
  formatMakeForPdf,
  formatModelForPdf,
  normalizeColorHeuristic,
} from "./normalize-pdf-fields.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.join(__dirname, "templates");
const FONTS_DIR = path.join(__dirname, "fonts");

export const NJ_TEMPLATE_PATH = path.join(TEMPLATES_DIR, "NJ.pdf");
export const NON_NJ_TEMPLATE_PATH = path.join(TEMPLATES_DIR, "NONNJ.pdf");

/** Fields drawn manually after flatten — never filled via AcroForm. */
const DRAWN_FIELDS = new Set(["plate1", "exp3", "car"]);

// Bundled fonts (in ./fonts) are searched first so Render/Vercel Linux hosts
// render identically to a Windows dev box. Drop Arial-metric-compatible TTFs
// (e.g. Arial or Liberation Sans, named exactly as below) into
// packages/shared/pdf/fonts/ — otherwise we fall back to OS fonts, then
// Helvetica. See README "Fonts" note.
const FONT_PATHS = {
  bold: [
    path.join(FONTS_DIR, "ARIALBD.TTF"),
    path.join(FONTS_DIR, "Arial-Bold.ttf"),
    "C:/Windows/Fonts/ARIALBD.TTF",
    "C:/Windows/Fonts/arialbd.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  ],
  regular: [
    path.join(FONTS_DIR, "ARIAL.TTF"),
    path.join(FONTS_DIR, "Arial.ttf"),
    "C:/Windows/Fonts/ARIAL.TTF",
    "C:/Windows/Fonts/arial.ttf",
    "/Library/Fonts/Arial.ttf",
    "/usr/share/fonts/truetype/msttcorefonts/Arial.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  ],
};

/** Measured from NJ.pdf / PATRICK DUSAPE.pdf AcroForm widgets (792×612). */
const LAYOUT = {
  /** Large plate1 widget — baseline sits in lower half of this band. */
  plate: { left: 38.6, bottom: 341.9, width: 707.5, height: 156.3, fontSize: 180 },
  /** exp3 widget — "EXP MMM DD, YYYY" banner. */
  exp: { left: 120.8, bottom: 292.1, width: 512.4, height: 54.9, fontSize: 60 },
  /** car widget area — 10-digit document ID. */
  car: { left: 37.1, bottom: 234.1, width: 712.98, height: 40, fontSize: 20 },
  /** Small plate under “Temporary Vehicle Registration” — left column (matches year x). */
  plateLeft: { left: 33.7, bottom: 138.0, width: 72, height: 8, fontSize: 7.5 },
};

const templateCache = new Map();
async function readTemplate(templatePath) {
  if (templateCache.has(templatePath)) return templateCache.get(templatePath);
  const bytes = await fs.readFile(templatePath);
  templateCache.set(templatePath, bytes);
  return bytes;
}

async function loadBoldFont(pdf) {
  const boldPath = FONT_PATHS.bold.find(existsSync);
  if (boldPath) {
    try {
      pdf.registerFontkit(fontkit);
      return pdf.embedFont(await fs.readFile(boldPath), { subset: true });
    } catch {
      /* fall through */
    }
  }
  return pdf.embedFont(StandardFonts.HelveticaBold);
}

async function loadRegularFont(pdf) {
  const regularPath = FONT_PATHS.regular.find(existsSync);
  if (regularPath) {
    try {
      pdf.registerFontkit(fontkit);
      return pdf.embedFont(await fs.readFile(regularPath), { subset: true });
    } catch {
      /* fall through */
    }
  }
  return pdf.embedFont(StandardFonts.Helvetica);
}

/** `Date` → `"MM/DD/YYYY"`. */
function formatMdy(d) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

/** `Date` → `"EXP JUL 08, 2026"` (matches PATRICK DUSAPE.pdf). */
function formatExpBanner(d) {
  const mon = d
    .toLocaleDateString("en-US", { month: "short" })
    .toUpperCase();
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `EXP ${mon} ${dd}, ${yyyy}`;
}

export function generatePlateNumber(seed) {
  const seedStr = String(seed || Date.now());
  let hash = 0;
  for (const ch of seedStr) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `H${String(hash % 1000000).padStart(6, "0")}`;
}

/** 10-digit ID under the plate header, always starts with 9 (e.g. `9123456789`). */
export function generateCarNumber(seed) {
  const seedStr = String(seed || Date.now());
  let hash = 0;
  for (const ch of seedStr) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `9${String(hash % 1_000_000_000).padStart(9, "0")}`;
}

function up(v) {
  return v == null ? "" : String(v).toUpperCase().trim();
}

function drawCentredBold(page, text, area, font) {
  if (!text) return;
  const fontSize = area.fontSize;
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const x = area.left + (area.width - textWidth) / 2;
  const y = area.bottom + (area.height / 2) - fontSize * 0.32;
  page.drawText(text, { x, y, size: fontSize, font, color: rgb(0, 0, 0) });
}

function drawLeftText(page, text, area, font) {
  if (!text) return;
  const fontSize = area.fontSize;
  const y = area.bottom + (area.height / 2) - fontSize * 0.35;
  page.drawText(text, { x: area.left, y, size: fontSize, font, color: rgb(0, 0, 0) });
}

/**
 * @param {import('pdf-lib').PDFForm} form
 * @param {Record<string, string>} values
 */
function fillFormFields(form, values) {
  for (const [name, value] of Object.entries(values)) {
    if (!value || DRAWN_FIELDS.has(name)) continue;
    try {
      const field = form.getTextField(name);
      field.setText(value);
      if (name === "first" || name === "last") field.setFontSize(12);
    } catch {
      /* field absent on this template revision */
    }
  }
}

/**
 * Generate a filled NJ temporary tag PDF as a Uint8Array.
 * @param {object} input
 * @returns {Promise<Uint8Array>}
 */
export async function buildNjTempTagPdf(input) {
  const templatePath = input.templatePath || NJ_TEMPLATE_PATH;
  const templateBytes = await readTemplate(templatePath);
  const pdf = await PDFDocument.load(templateBytes);
  const boldFont = await loadBoldFont(pdf);
  const regularFont = await loadRegularFont(pdf);
  const form = pdf.getForm();
  const page = pdf.getPages()[0];

  const issued = input.issuedAt ? new Date(input.issuedAt) : new Date();
  const expiry = input.expiresAt
    ? new Date(input.expiresAt)
    : new Date(issued.getTime() + 30 * 86400000);

  const plate = up(input.plate || generatePlateNumber(input.reference || issued.toISOString()));
  const carNumber =
    input.carNumber ||
    generateCarNumber(input.reference || input.orderId || issued.toISOString());

  const make = formatMakeForPdf(input.make);
  const model = formatModelForPdf(input.model);
  const body = formatBodyForPdf(input.body);
  const color = normalizeColorHeuristic(input.color) || up(input.color);

  const vehicleParts = [input.year, make, model].filter(Boolean).join(" ").trim();
  const vehicleName = color ? `${vehicleParts},${color}` : vehicleParts;

  const issuedStr = formatMdy(issued);
  const expiryStr = formatMdy(expiry);
  const expBanner = formatExpBanner(expiry);

  fillFormFields(
    form,
    {
      plate2: plate,
      plate3: plate,
      vin1: up(input.vin),
      vin3: up(input.vin),
      year: String(input.year || ""),
      make1: make,
      make2: make,
      model1: model,
      model2: model,
      color,
      body,
      vehiclename: vehicleName,
      first: up(input.firstName),
      last: up(input.lastName),
      address: up(input.address),
      city: up(input.city),
      state: up(input.state || "NJ"),
      zip: up(input.zip),
      date1: issuedStr,
      date2: issuedStr,
      exp1: expiryStr,
      ins: up(input.insuranceCompany),
      policy: up(input.insurancePolicy),
    },
  );

  form.flatten();

  drawCentredBold(page, plate, LAYOUT.plate, boldFont);
  drawCentredBold(page, expBanner, LAYOUT.exp, boldFont);
  drawCentredBold(page, carNumber, LAYOUT.car, boldFont);
  drawLeftText(page, plate, LAYOUT.plateLeft, regularFont);

  return pdf.save({ useObjectStreams: false });
}
