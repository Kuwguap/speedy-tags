/**
 * Per-state document generation entry point.
 *
 *   NJ → fills NJ.pdf temp tag + optionally an NJ Temporary Evidence of Insurance.
 *   NY → no auto-tag (state isn't supported for instant issue); optionally generates
 *        an NY State Insurance ID Card (FS-20) with PDF417 barcode.
 *   *  → no auto-tag; no auto-insurance.
 *
 * Returns an object describing which artefacts were generated and the absolute
 * paths they were written to. The web layer surfaces these as download URLs.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildNjTempTagPdf, generatePlateNumber } from "./nj-temp-tag.js";
import { buildNjInsuranceCardPdf } from "./nj-insurance-card.js";
import { buildNyInsuranceCardPdf } from "./ny-insurance-card.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.join(__dirname, "..", "..", "..", "data", "documents");

async function ensureOrderDir(orderId) {
  const dir = path.join(DOCS_DIR, orderId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function ymd(d) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function fullName(user) {
  return `${user.firstName || ""} ${user.lastName || ""}`.trim().toUpperCase() || "INSURED PARTY";
}

function makePolicyNumber(orderId) {
  const base = String(orderId || Date.now()).replace(/[^a-z0-9]/gi, "").toUpperCase();
  return `KT-${base.slice(0, 8).padStart(8, "0")}`;
}

/**
 * @param {object} args
 * @param {object} args.user
 * @param {object} args.order — must include id, reference, state, address, city,
 *                              zip, vin, year, make, model, color, body,
 *                              insuranceCompany, insurancePolicy, insuranceOptIn.
 * @returns {Promise<{
 *   state: string,
 *   tagPath?: string,
 *   insurancePath?: string,
 *   plate?: string,
 *   policyNumber?: string,
 *   instructions?: string,
 * }>}
 */
export async function generateDocumentsForOrder({ user, order }) {
  const state = String(order.state || "").toUpperCase();
  const result = { state };
  const issued = order.paidAt ? new Date(order.paidAt) : new Date();
  const expiry = new Date(issued.getTime() + 30 * 86400000);
  const effDate = ymd(issued);
  const expDate = ymd(expiry);

  const dir = await ensureOrderDir(order.id);

  const policyNumber = order.insurancePolicy || makePolicyNumber(order.id);
  const insuranceCompany = order.insuranceCompany || (order.insuranceOptIn ? "Kingsman Tags 30-Day Coverage" : "");
  const wantInsuranceCard = !!order.insuranceOptIn;

  // ── NJ: full auto-tag flow ─────────────────────────────────────────────
  if (state === "NJ") {
    const plate = generatePlateNumber(order.reference || order.id);
    const tagBytes = await buildNjTempTagPdf({
      reference: order.reference,
      plate,
      vin: order.vin,
      year: order.year,
      make: order.make,
      model: order.model,
      color: order.color,
      body: order.body,
      firstName: user.firstName,
      lastName: user.lastName,
      address: order.address,
      city: order.city,
      state: "NJ",
      zip: order.zip,
      insuranceCompany,
      insurancePolicy: policyNumber,
      issuedAt: issued,
      expiresAt: expiry,
    });
    const tagPath = path.join(dir, "tag.pdf");
    await fs.writeFile(tagPath, tagBytes);
    result.tagPath = tagPath;
    result.plate = plate;

    if (wantInsuranceCard) {
      const insBytes = await buildNjInsuranceCardPdf({
        policyNumber,
        effectiveMmDdYyyy: effDate,
        expirationMmDdYyyy: expDate,
        issuedMmDdYyyy: effDate,
        vehicleYear: String(order.year || ""),
        vehicleMake: String(order.make || ""),
        vehicleModel: String(order.model || ""),
        vin: String(order.vin || ""),
        insuredNameUpper: fullName(user),
        insuredAddressLines: [
          String(order.address || "").toUpperCase(),
          `${String(order.city || "").toUpperCase()}, ${state} ${order.zip || ""}`.trim(),
        ],
        carrierName: "Kingsman Tags 30-Day Coverage",
        carrierAddressLines: ["c/o Kingsman Tags", "PO Box — Service Address", "Newark, NJ 07101"],
        formRevision: "Kingsman Tags 1-Month Plan",
      });
      const insPath = path.join(dir, "insurance.pdf");
      await fs.writeFile(insPath, insBytes);
      result.insurancePath = insPath;
      result.policyNumber = policyNumber;
    }
    return result;
  }

  // ── NY: instructions only for the tag; optional NY FS-20 insurance card ──
  if (state === "NY") {
    result.instructions =
      "New York issues physical temporary plates through the DMV directly. You'll need to visit your local NY DMV office with proof of insurance, your title, and your bill of sale. We can email you a printable insurance card if you opted in.";
    if (wantInsuranceCard) {
      const insBytes = await buildNyInsuranceCardPdf({
        policyNumber,
        effectiveMmDdYyyy: effDate,
        expirationMmDdYyyy: expDate,
        issueMmDdYyyy: effDate,
        vehicleYearFull: String(order.year || ""),
        vehicleMakeShort: String(order.make || "").toUpperCase().slice(0, 5),
        vin: String(order.vin || ""),
        insuredNameUpper: fullName(user),
        insuredAddressLines: [
          String(order.address || "").toUpperCase(),
          `${String(order.city || "").toUpperCase()}, ${state} ${order.zip || ""}`.trim(),
        ],
        carrierName: "169 KINGSMAN TAGS COVERAGE",
        agencyName: "KINGSMAN TAGS INSURANCE",
        agencyAddressLines: ["PO BOX 6400", "PROVIDENCE, RI 02940-6200"],
        issuerCompanyLine: "169 KINGSMAN COVERAGE GROUP",
        issuerPhone: "",
        daq: order.reference || order.id,
        agentLicense: "",
      });
      const insPath = path.join(dir, "insurance.pdf");
      await fs.writeFile(insPath, insBytes);
      result.insurancePath = insPath;
      result.policyNumber = policyNumber;
    }
    return result;
  }

  // ── Other states: just instructions ────────────────────────────────────
  result.instructions = `Auto-issue isn't available in ${state || "your state"} yet. We'll email you instructions covering the documents you'll need at your local DMV; if you opted into the 1-month coverage, your insurance card will be attached.`;
  if (wantInsuranceCard) {
    const insBytes = await buildNjInsuranceCardPdf({
      policyNumber,
      effectiveMmDdYyyy: effDate,
      expirationMmDdYyyy: expDate,
      issuedMmDdYyyy: effDate,
      vehicleYear: String(order.year || ""),
      vehicleMake: String(order.make || ""),
      vehicleModel: String(order.model || ""),
      vin: String(order.vin || ""),
      insuredNameUpper: fullName(user),
      insuredAddressLines: [
        String(order.address || "").toUpperCase(),
        `${String(order.city || "").toUpperCase()}, ${state} ${order.zip || ""}`.trim(),
      ],
      carrierName: "Kingsman Tags 30-Day Coverage",
      formRevision: "Kingsman Tags 1-Month Plan",
      includeInfoPanel: false,
    });
    const insPath = path.join(dir, "insurance.pdf");
    await fs.writeFile(insPath, insBytes);
    result.insurancePath = insPath;
    result.policyNumber = policyNumber;
  }
  return result;
}

export { buildNjTempTagPdf, generatePlateNumber };
