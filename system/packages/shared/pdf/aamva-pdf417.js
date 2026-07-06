/**
 * AAMVA-compliant PDF417 payload builder for NY State Insurance ID Cards.
 * Ported to plain ESM JS from b_H821T7ehlpo/barcode-generator-app/lib/aamva-pdf417.ts.
 *
 * Header bytes follow the AAMVA Card Design Standard (Annex D); four subfiles
 * are emitted in order: RG (registered owner), VH (vehicle), FR (financial
 * responsibility), SI (signature).
 */

import { createHash } from "node:crypto";

export const AAMVA_DES = "\x0A";
export const AAMVA_RS = "\x1E";
export const AAMVA_ST = "\x0D";
export const AAMVA_IIN_NY = "636001";

const HEADER_CONTROL = "@" + AAMVA_DES + AAMVA_RS + AAMVA_ST;
const HEADER_LEN = 4 + 5 + 6 + 2 + 2;
const SUBFILE_DESIGNATOR_LEN = 10;
const SUBFILE_COUNT = 4;

function pad4(n) {
  return String(Math.max(0, Math.floor(n))).padStart(4, "0").slice(-4);
}

function sanitizeField(value) {
  return String(value ?? "").replace(/\r|\n|\x1E/g, " ").trim();
}

function normalizeAamvaDaq(value) {
  const t = sanitizeField(value).replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (!t) return "000000000";
  return t.slice(0, 25);
}

export function mmDdYyyyToYyyyMmDd(mmDdYyyy) {
  const m = String(mmDdYyyy).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  return `${m[3]}${m[1].padStart(2, "0")}${m[2].padStart(2, "0")}`;
}

export function carrierCodeFromName(name) {
  if (!name) return "";
  const m = String(name).trim().match(/^\s*(\d{2,5})\b/);
  return m ? m[1] : "";
}

function parseCityStateZip(line) {
  const t = String(line).trim().toUpperCase();
  const m = t.match(/^(.+?)\s+([A-Z]{2})\s+(\d{5})(?:-?(\d{4}))?\s*$/);
  if (!m) return { city: sanitizeField(t).slice(0, 20), state: "", zip: "" };
  const zip9 = m[4] != null && m[4] !== "" ? `${m[3]}${m[4]}` : m[3];
  return {
    city: sanitizeField(m[1]).slice(0, 20),
    state: m[2],
    zip: zip9.slice(0, 9),
  };
}

function splitInsuredName(insuredNameUpper) {
  const raw = sanitizeField(insuredNameUpper).toUpperCase();
  if (!raw) return { last: "", first: "", middle: "", suffix: "" };
  if (raw.includes(",")) {
    const [lastPart, restPart = ""] = raw.split(/\s*,\s*/, 2);
    const restTokens = restPart.split(/\s+/).filter(Boolean);
    return {
      last: lastPart.slice(0, 40),
      first: (restTokens[0] ?? "").slice(0, 40),
      middle: restTokens.slice(1).join(" ").slice(0, 40),
      suffix: "",
    };
  }
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { last: "", first: "", middle: "", suffix: "" };
  if (parts.length === 1) return { last: parts[0].slice(0, 40), first: "", middle: "", suffix: "" };
  return {
    last: parts[parts.length - 1].slice(0, 40),
    first: parts[0].slice(0, 40),
    middle: parts.length > 2 ? parts.slice(1, -1).join(" ").slice(0, 40) : "",
    suffix: "",
  };
}

function buildAddressParts(lines) {
  const trimmed = (lines || []).map((l) => sanitizeField(l).toUpperCase()).filter(Boolean);
  if (trimmed.length === 0) return { street: "", city: "", state: "", zip: "" };
  const last = trimmed[trimmed.length - 1];
  const { city, state, zip } = parseCityStateZip(last);
  const street = trimmed.length > 1 ? trimmed.slice(0, -1).join(" ").slice(0, 35) : "";
  return { street, city, state, zip };
}

function encodeSubfile(subfileType, pairs) {
  if (pairs.length === 0) return `${subfileType}${AAMVA_ST}`;
  let s = subfileType;
  for (let i = 0; i < pairs.length; i++) {
    const [id, val] = pairs[i];
    const isLast = i === pairs.length - 1;
    s += id + sanitizeField(val) + (isLast ? AAMVA_ST : AAMVA_DES);
  }
  return s;
}

export function buildAamvaPdf417Payload(p) {
  const iin = (p.iin ?? AAMVA_IIN_NY).replace(/\D/g, "").padStart(6, "0").slice(0, 6);
  const version = "03";
  const numEntries = "04";
  const header = HEADER_CONTROL + "AAMVA" + iin + version + numEntries;

  const effDate = mmDdYyyyToYyyyMmDd(p.effectiveMmDdYyyy);
  const expDate = mmDdYyyyToYyyyMmDd(p.expirationMmDdYyyy);
  const issDate = mmDdYyyyToYyyyMmDd(p.issueMmDdYyyy ?? p.effectiveMmDdYyyy);

  const name = splitInsuredName(p.insuredNameUpper);
  const addr = buildAddressParts(p.insuredAddressLines);
  const daq = normalizeAamvaDaq(p.daq);
  const combinedName = sanitizeField(p.insuredNameUpper).toUpperCase().slice(0, 40);

  const vinClean = sanitizeField(p.vin).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
  const policy = sanitizeField(p.policyNumber).slice(0, 25);
  const yearClean = sanitizeField(p.vehicleYear).replace(/\D/g, "").slice(-4).padStart(4, "0").slice(-4);
  const makeClean = sanitizeField(p.vehicleMake5).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  const carrierCode = carrierCodeFromName(p.carrierName).slice(0, 5);
  const agentLicense = sanitizeField(p.agentLicense ?? "").toUpperCase().slice(0, 25);

  const rgPairs = [
    ["RBD", name.last], ["RBE", name.first], ["RBF", name.middle], ["RBG", name.suffix],
    ["RBC", combinedName], ["DAQ", daq],
    ["RBD", ""], ["RBE", ""], ["RBF", ""], ["RBG", ""], ["RBC", ""], ["DAQ", ""],
    ["ZBC", ""], ["ZBD", ""], ["ZBE", ""], ["RAP", ""],
    ["RBN", addr.street], ["RBP", addr.city], ["RBQ", addr.state], ["RBR", addr.zip],
  ];
  const vhPairs = [
    ["VAD", vinClean], ["VAL", yearClean], ["VAK", makeClean],
    ["ZZD", ""], ["ZZE", ""], ["ZZF", ""],
  ];
  const frPairs = [
    ["FAA", agentLicense], ["ZZC", carrierCode],
    ["FAB", issDate], ["FAC", effDate], ["FAD", expDate], ["ZZB", policy],
  ];

  const rgBody = encodeSubfile("RG", rgPairs);
  const vhBody = encodeSubfile("VH", vhPairs);
  const frBody = encodeSubfile("FR", frPairs);

  const md5 = createHash("md5").update(rgBody + vhBody + frBody, "utf8").digest("hex").toUpperCase();
  const siBody = encodeSubfile("SI", [
    ["ZZZ", "IC200010"],
    ["SAA", "001"],
    ["SAB", md5],
  ]);

  const baseOffset = HEADER_LEN + SUBFILE_COUNT * SUBFILE_DESIGNATOR_LEN;
  const offRg = baseOffset;
  const offVh = offRg + rgBody.length;
  const offFr = offVh + vhBody.length;
  const offSi = offFr + frBody.length;

  const designators =
    `RG${pad4(offRg)}${pad4(rgBody.length)}` +
    `VH${pad4(offVh)}${pad4(vhBody.length)}` +
    `FR${pad4(offFr)}${pad4(frBody.length)}` +
    `SI${pad4(offSi)}${pad4(siBody.length)}`;

  return header + designators + rgBody + vhBody + frBody + siBody;
}

export function pxToMm(px) {
  return (px * 25.4) / 96;
}
