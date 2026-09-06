/**
 * NJ Temporary Evidence of Insurance — pure-text reproduction of the
 * "Form 6484T NJ" layout. Letter portrait, 612 × 792 pt. Three identical
 * insurance cards on the right, with the info panel on the left.
 *
 * Ported from b_H821T7ehlpo/barcode-generator-app/lib/nj/insurance-card.ts
 * (TS → ESM JS). Coordinates and font sizes preserved verbatim.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PAGE_W = 612;
const PAGE_H = 792;

const CARD_TOP_1 = 753.4;
const CARD_TOP_2 = 498.2;
const CARD_TOP_3 = 239.6;

const DEFAULT_CLAIMS_ADDRESS =
  "National Specialty, PO Box 6400 Providence, RI 02940-620";

function resolveClaimsAddress(d) {
  if (d.claimsAddress?.trim()) {
    return String(d.claimsAddress)
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");
  }
  return DEFAULT_CLAIMS_ADDRESS;
}

function formatLongDate(mmDdYyyy) {
  const m = String(mmDdYyyy).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return String(mmDdYyyy).trim();
  const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  if (Number.isNaN(d.getTime())) return String(mmDdYyyy).trim();
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

const CARD_TEXT_ITEMS = [
  { x: 271.8, y: 753.4, size: 12, bold: true, text: "State of New Jersey Temporary Evidence of Insurance" },

  { x: 437.6, y: 741.6, size: 7.5, bold: true, text: "Policy number:" },
  { x: 494.0, y: 741.6, size: 7.5, text: (d) => d.policyNumber },
  { x: 437.6, y: 732.8, size: 7.5, bold: true, text: "Effective date:" },
  { x: 494.0, y: 732.8, size: 7.5, text: (d) => formatLongDate(d.effectiveMmDdYyyy) },
  { x: 437.6, y: 722.8, size: 7, text: "This Temporary Evidence of Insurance expires 20" },
  { x: 437.6, y: 715.8, size: 7, text: "days after the effective date shown above." },

  {
    x: 271.8, y: 742.0, size: 8.5,
    text: (d) =>
      `${(d.carrierNaicCode ?? "169").trim()} ${(d.carrierName ?? "National Specialty Insurance Company").trim()}`,
  },
  { x: 287.6, y: 733.2, size: 8.5, text: (d) => d.carrierAddressLines?.[0] ?? "Serviced by AIPSO-SAIP" },
  { x: 287.6, y: 724.6, size: 8.5, text: (d) => d.carrierAddressLines?.[1] ?? "PO Box 6400" },
  { x: 287.6, y: 716.0, size: 8.5, text: (d) => d.carrierAddressLines?.[2] ?? "Providence, RI 02940-6200" },

  { x: 271.8, y: 699.6, size: 8.5, bold: true, text: "Insured" },
  { x: 271.8, y: 690.4, size: 8, text: (d) => d.insuredNameUpper },
  { x: 271.8, y: 681.6, size: 8, text: (d) => d.insuredAddressLines[0] ?? "" },
  { x: 271.8, y: 673.0, size: 8, text: (d) => d.insuredAddressLines[1] ?? "" },

  { x: 288.0, y: 629.2, size: 8, text: "Year" },
  { x: 313.2, y: 629.2, size: 8, text: "Make" },
  { x: 405.6, y: 629.2, size: 8, text: "Model" },
  { x: 501.6, y: 629.2, size: 8, text: "VIN" },

  { x: 288.4, y: 619.2, size: 8.5, text: (d) => d.vehicleYear },
  { x: 313.2, y: 619.2, size: 8.5, text: (d) => d.vehicleMake },
  { x: 405.4, y: 619.2, size: 8.5, text: (d) => d.vehicleModel },
  { x: 502.2, y: 619.2, size: 8.5, text: (d) => d.vin },

  { x: 288.4, y: 575.6, size: 7.5, bold: true, text: "ADDRESS FOR NOTIFICATION OF COMMENCEMENT OF MEDICAL TREATMENT:" },
  { x: 288.4, y: 564.8, size: 7.5, bold: true, text: (d) => resolveClaimsAddress(d) },

  { x: 271.8, y: 549.6, size: 7, text: (d) => d.formRevision ?? "Form 6484T NJ (10/22)" },
];

const PANEL_TEXT_ITEMS = [
  { x: 28.4, y: 720.2, size: 9.5, bold: true, text: "Policy Number:" },
  { x: 102.0, y: 720.2, size: 9.5, bold: true, text: (d) => d.policyNumber },
  { x: 43.4, y: 709.4, size: 8.5, text: (d) => formatLongDate(d.issuedMmDdYyyy ?? d.effectiveMmDdYyyy) },
  {
    x: 43.4, y: 698.2, size: 8.5,
    text: (d) => `Policy Period:  ${formatLongDate(d.effectiveMmDdYyyy)} - ${formatLongDate(d.expirationMmDdYyyy)}`,
  },
  { x: 28.4, y: 645.0, size: 20, bold: true, text: "Insurance ID Cards" },
  { x: 28.4, y: 623.2, size: 20, bold: true, italic: true, text: "Keep these cards in" },
  { x: 28.4, y: 602.0, size: 20, bold: true, italic: true, text: "your vehicle" },
  { x: 31.4, y: 498.0, size: 10.5, bold: true, text: "Access your policy" },
  { x: 31.4, y: 485.8, size: 8.5, text: "\u2022" },
  { x: 53.0, y: 485.8, size: 8.5, text: "Pay your bill" },
  { x: 31.4, y: 475.2, size: 8.5, text: "\u2022" },
  { x: 53.0, y: 475.2, size: 8.5, text: "View and print your policy documents" },
  { x: 31.4, y: 464.8, size: 8.5, text: "\u2022" },
  { x: 53.0, y: 464.8, size: 8.5, text: "Check the status of a claim" },
  { x: 31.4, y: 453.4, size: 8.5, text: "\u2022" },
  { x: 53.0, y: 453.4, size: 8.5, text: "Get important information about your vehicle" },
  { x: 31.4, y: 442.6, size: 8.5, text: "\u2022" },
  { x: 53.0, y: 442.6, size: 8.5, text: "For most policies find out how much it would cost to" },
  { x: 53.0, y: 431.6, size: 8.5, text: "insure another vehicle, add a driver and more!" },
];

function resolveText(text, data) {
  return typeof text === "function" ? text(data) : text;
}

function pickFont(item, regular, bold, boldOblique) {
  if (item.italic && item.bold) return boldOblique;
  if (item.bold) return bold;
  return regular;
}

function drawTextItems(page, items, data, dy, regular, bold, boldOblique) {
  for (const it of items) {
    const t = resolveText(it.text, data);
    if (!t) continue;
    page.drawText(t, {
      x: it.x,
      y: it.y + dy,
      size: it.size,
      font: pickFont(it, regular, bold, boldOblique),
      color: rgb(0, 0, 0),
      maxWidth: it.maxWidth,
    });
  }
}

export async function buildNjInsuranceCardPdf(input) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const boldOblique = await doc.embedFont(StandardFonts.HelveticaBoldOblique);

  const data = {
    ...input,
    insuredAddressLines: (input.insuredAddressLines ?? []).map((l) => String(l).trim()).filter(Boolean),
    carrierAddressLines: (input.carrierAddressLines ?? []).map((l) => String(l).trim()).filter(Boolean),
    includeInfoPanel: input.includeInfoPanel !== false,
  };

  if (data.includeInfoPanel) {
    drawTextItems(page, PANEL_TEXT_ITEMS, data, 0, regular, bold, boldOblique);
  }
  for (const cardTop of [CARD_TOP_1, CARD_TOP_2, CARD_TOP_3]) {
    const dy = cardTop - CARD_TOP_1;
    drawTextItems(page, CARD_TEXT_ITEMS, data, dy, regular, bold, boldOblique);
  }

  return doc.save();
}
