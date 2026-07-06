/**
 * Per-state document generation — returns PDF *bytes* (never writes to disk).
 *
 *   NJ → fills NJ.pdf temp tag + optionally an NJ Temporary Evidence of Insurance.
 *   NY → temp tag on NONNJ.pdf; optionally an NY State Insurance ID Card (FS-20)
 *        with PDF417 barcode.
 *   *  → temp tag on NONNJ.pdf; optionally the NJ-style 30-day coverage card.
 *
 * Callers (dispatch bot, tag-site API) persist the returned bytes to Supabase
 * Storage and/or attach them to Telegram / SendGrid.
 *
 * This is the disk-free refactor of v2/server/lib/pdf/index.js: the branching,
 * field mapping, and insurance-card logic are identical; only the persistence
 * side-effects were removed.
 */

import {
  buildNjTempTagPdf,
  generatePlateNumber,
  generateCarNumber,
  NJ_TEMPLATE_PATH,
  NON_NJ_TEMPLATE_PATH,
} from "./nj-temp-tag.js";
import { buildNjInsuranceCardPdf } from "./nj-insurance-card.js";
import { buildNyInsuranceCardPdf } from "./ny-insurance-card.js";
import {
  formatMakeForPdf,
  formatModelForPdf,
  normalizePdfFields,
} from "./normalize-pdf-fields.js";

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
 * @param {object} args.user   { firstName, lastName }
 * @param {object} args.order  { id, reference, state, address, city, zip, vin,
 *                               year, make, model, color, body,
 *                               insuranceCompany, insurancePolicy, insuranceOptIn,
 *                               paidAt }
 * @param {(state:string) => Promise<{plate:string}>} [args.allocatePlate]
 *        Atomic plate allocator. When omitted, a plate is hashed from the
 *        reference (fine for previews / test mode).
 * @returns {Promise<{
 *   state: string,
 *   tagBytes: Uint8Array,
 *   insuranceBytes?: Uint8Array,
 *   plate: string,
 *   policyNumber?: string,
 *   instructions?: string,
 * }>}
 */
export async function generateDocumentsForOrder({ user, order, allocatePlate }) {
  const state = String(order.state || "").toUpperCase();
  const result = { state };
  const issued = order.paidAt ? new Date(order.paidAt) : new Date();
  const expiry = new Date(issued.getTime() + 30 * 86400000);
  const effDate = ymd(issued);
  const expDate = ymd(expiry);

  const policyNumber = order.insurancePolicy || makePolicyNumber(order.id);
  const insuranceCompany =
    order.insuranceCompany || (order.insuranceOptIn ? "Kingsman Tags 30-Day Coverage" : "");
  const wantInsuranceCard = !!order.insuranceOptIn;

  // Always issue an NJ-style temporary plate, regardless of buyer state.
  // NJ residents get NJ.pdf; everyone else gets NONNJ.pdf.
  const templatePath = state === "NJ" ? NJ_TEMPLATE_PATH : NON_NJ_TEMPLATE_PATH;

  let plate;
  if (typeof allocatePlate === "function") {
    const allocated = await allocatePlate(state);
    plate = allocated.plate;
  } else {
    plate = generatePlateNumber(order.reference || order.id);
  }

  const normalized = await normalizePdfFields(order, order.vinHints || {});

  result.tagBytes = await buildNjTempTagPdf({
    templatePath,
    reference: order.reference,
    orderId: order.id,
    plate,
    vin: order.vin,
    year: normalized.year || order.year,
    make: normalized.make || order.make,
    model: normalized.model || order.model,
    color: normalized.color || order.color,
    body: normalized.body || order.body,
    firstName: user.firstName,
    lastName: user.lastName,
    address: order.address,
    city: order.city,
    state: state || "NJ",
    zip: order.zip,
    insuranceCompany,
    insurancePolicy: policyNumber,
    issuedAt: issued,
    expiresAt: expiry,
  });
  result.plate = plate;

  if (state && state !== "NJ") {
    result.instructions =
      "This is a New Jersey 30-day Temporary Plate. Print it, place it in the rear window, and keep proof of insurance on you while driving.";
  }

  if (wantInsuranceCard) {
    if (state === "NY") {
      result.insuranceBytes = await buildNyInsuranceCardPdf({
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
    } else {
      result.insuranceBytes = await buildNjInsuranceCardPdf({
        policyNumber,
        effectiveMmDdYyyy: effDate,
        expirationMmDdYyyy: expDate,
        issuedMmDdYyyy: effDate,
        vehicleYear: String(order.year || ""),
        vehicleMake: formatMakeForPdf(order.make),
        vehicleModel: formatModelForPdf(order.model),
        vin: String(order.vin || ""),
        insuredNameUpper: fullName(user),
        insuredAddressLines: [
          String(order.address || "").toUpperCase(),
          `${String(order.city || "").toUpperCase()}, ${state || "NJ"} ${order.zip || ""}`.trim(),
        ],
        carrierName: "Kingsman Tags 30-Day Coverage",
        carrierAddressLines: ["c/o Kingsman Tags", "PO Box — Service Address", "Newark, NJ 07101"],
        formRevision: "Kingsman Tags 1-Month Plan",
        includeInfoPanel: state === "NJ",
      });
    }
    result.policyNumber = policyNumber;
  }

  return result;
}

export {
  buildNjTempTagPdf,
  generatePlateNumber,
  generateCarNumber,
  NJ_TEMPLATE_PATH,
  NON_NJ_TEMPLATE_PATH,
};
