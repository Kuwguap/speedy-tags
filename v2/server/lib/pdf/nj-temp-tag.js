/**
 * Fill the NJ.pdf temporary-tag template (a fillable AcroForm with 25 named
 * text fields, page size 792 × 612). Field names match the ones discovered by
 * scanning the PDF: plate1/2/3, vin1/3, year, make1/2, model1/2, body, color,
 * car, vehiclename, first, last, address, city, state, zip, date1/2, exp1/3,
 * ins, policy.
 */

import { PDFDocument } from "pdf-lib";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATH = path.join(__dirname, "..", "..", "..", "NJ.pdf");

let cachedTemplate = null;
async function readTemplate() {
  if (cachedTemplate) return cachedTemplate;
  cachedTemplate = await fs.readFile(TEMPLATE_PATH);
  return cachedTemplate;
}

/** `Date` → `"MM/DD/YYYY"`. */
function formatMdy(d) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/** Build a Kingsman-flavoured temp plate number like "K-72 9931". */
export function generatePlateNumber(seed) {
  const seedStr = String(seed || Date.now());
  let hash = 0;
  for (const ch of seedStr) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const a = String(((hash >>> 8) & 0xff) % 100).padStart(2, "0");
  const b = String(hash % 10000).padStart(4, "0");
  return `K-${a} ${b}`;
}

/** Set a text field if it exists, swallowing missing-field errors. */
function safeSetText(form, name, value) {
  try {
    const field = form.getTextField(name);
    if (value != null && value !== "") field.setText(String(value));
  } catch {
    /* field missing — ignore */
  }
}

/**
 * Generate a filled NJ temporary tag PDF as a Uint8Array.
 * @param {object} input — see fields below.
 * @returns {Promise<Uint8Array>}
 */
export async function buildNjTempTagPdf(input) {
  const templateBytes = await readTemplate();
  const pdf = await PDFDocument.load(templateBytes);
  const form = pdf.getForm();

  const issued = input.issuedAt ? new Date(input.issuedAt) : new Date();
  const expiry = input.expiresAt
    ? new Date(input.expiresAt)
    : new Date(issued.getTime() + 30 * 86400000);

  const plate = input.plate || generatePlateNumber(input.reference || issued.toISOString());

  // Composite "vehiclename" field — handy for templates that show a single
  // line like "2018 HONDA CIVIC".
  const vehicleName =
    [input.year, input.make, input.model].filter(Boolean).join(" ").trim() || "";

  safeSetText(form, "plate1", plate);
  safeSetText(form, "plate2", plate);
  safeSetText(form, "plate3", plate);
  safeSetText(form, "vin1", input.vin);
  safeSetText(form, "vin3", input.vin);
  safeSetText(form, "year", input.year);
  safeSetText(form, "make1", input.make);
  safeSetText(form, "make2", input.make);
  safeSetText(form, "model1", input.model);
  safeSetText(form, "model2", input.model);
  safeSetText(form, "color", input.color);
  safeSetText(form, "body", input.body || input.car || "");
  safeSetText(form, "car", input.car || input.body || "");
  safeSetText(form, "vehiclename", vehicleName);

  safeSetText(form, "first", input.firstName);
  safeSetText(form, "last", input.lastName);
  safeSetText(form, "address", input.address);
  safeSetText(form, "city", input.city);
  safeSetText(form, "state", input.state || "NJ");
  safeSetText(form, "zip", input.zip);

  const issuedStr = formatMdy(issued);
  const expiryStr = formatMdy(expiry);
  safeSetText(form, "date1", issuedStr);
  safeSetText(form, "date2", issuedStr);
  safeSetText(form, "exp1", expiryStr);
  safeSetText(form, "exp3", expiryStr);

  safeSetText(form, "ins", input.insuranceCompany || "");
  safeSetText(form, "policy", input.insurancePolicy || "");

  // Flatten so the PDF can't be edited downstream.
  form.flatten();
  return pdf.save();
}
