/**
 * AAMVA-compliant PDF417 payload for NY FS-20 auto insurance ID cards.
 *
 * This is the **AAMVA Insurance Identification Card** variant (not the DL/ID
 * Card Design Standard) — the format actually produced by NY insurers and
 * parsed by DMV scanners. Sample reference (a real BUSTAMANTE NY FS-20 card):
 *
 *   @\n\x1E\rAAMVA636001 03 04
 *   RG0059 0310 VH0369 0064 FR0433 0094 SI0527 0058
 *   RG\nRBDBUSTAMANTE\nRBEMIGUEL\nRBF\nRBG\nRBCBUSTAMANTE@MIGUEL\nDAQ437366609\n…
 *   VH\nVAD2C3CCAAG4FH815512\nVAL2015\nVAKCHRYS\nZZDN\nZZEN\nZZFN\r
 *   FR\nFAA639\nZZC639\nFAB20260422\nFAC20260411\nFAD20260708\nZZB4047221025\r
 *   SI\nZZZIC200010\nSAA001\nSAB<32-hex>\r
 *
 * Header bytes (19 total):
 *   '@'        compliance indicator               (1)
 *   LF  0x0A   data element separator             (1)
 *   RS  0x1E   record separator                   (1)
 *   CR  0x0D   segment terminator                 (1)
 *   'AAMVA'    file type (insurance card variant) (5)
 *   IIN        6-digit issuer id (NY = 636001)    (6)
 *   AAMVAver   '03'                               (2)
 *   numEntries '04' (4 subfiles below)            (2)
 *
 * Four subfiles, in this order:
 *   RG  Registrant            — driver / insured (name + license# + address)
 *   VH  Vehicle               — VIN, year, make
 *   FR  Financial Responsibility — insurer code + dates + policy number
 *   SI  Supplemental Info     — spec version + slot + signature
 *
 * Field IDs (3-char each, LF-separated, CR-terminated per subfile):
 *   RG: RBD last, RBE first, RBF middle, RBG suffix, RBC combined,
 *       DAQ DRIVER LICENSE NUMBER, RBN street, RBP city, RBQ state, RBR zip
 *   VH: VAD VIN, VAL year, VAK make
 *   FR: FAA insurer NAIC, ZZC issuer code, FAB issue date,
 *       FAC effective date, FAD expiration date, ZZB POLICY NUMBER
 *   SI: ZZZ spec ver (e.g. IC200010), SAA slot, SAB signature
 *
 * **Important:** DAQ holds the driver license number. The policy number goes
 * in ZZB (FR subfile), never in DAQ.
 */

/** Data Element Separator — Line Feed. */
export const AAMVA_DES = '\x0A'
/** Record Separator — header byte 3. */
export const AAMVA_RS = '\x1E'
/** Segment Terminator — Carriage Return. */
export const AAMVA_ST = '\x0D'

/** New York DMV IIN. */
export const AAMVA_IIN_NY = '636001'

/**
 * AAMVA Insurance Card header length:
 *   '@' + LF + RS + CR + 'AAMVA' + IIN(6) + ver(2) + numEntries(2) = 19.
 *
 * (Note: the DL/ID Annex D header is 21 bytes because it also carries a
 * jurisdiction version. The insurance card variant omits it.)
 */
const HEADER_LEN = 19
const SUBFILE_DESIGNATOR_LEN = 10

function pad4 (n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(4, '0').slice(-4)
}

function sanitizeField (value: string): string {
  return value
    .replace(/\r|\n|\x1E/g, ' ')
    .trim()
}

/**
 * AAMVA DAQ — **driver license number** (RG subfile).
 *
 * Alphanumeric, max 25 chars. Empty / missing input becomes nine zeros
 * (`000000000`) so scanners still see a syntactically valid element.
 */
export function normalizeAamvaDaq (value: string | undefined | null): string {
  const t = sanitizeField(value ?? '')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase()
  if (!t) return '000000000'
  return t.slice(0, 25)
}

/** MM/dd/yyyy → YYYYMMDD (NY FS-20 insurance card date format, e.g. FAC/FAD). */
export function mmDdYyyyToAamvaInsuranceDate (mmDdYyyy: string): string {
  const m = mmDdYyyy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return ''
  const mm = m[1].padStart(2, '0')
  const dd = m[2].padStart(2, '0')
  const yyyy = m[3]
  return `${yyyy}${mm}${dd}`
}

/**
 * MM/dd/yyyy → MMDDCCYY (AAMVA DL/ID Annex D date format).
 * Kept for backward compatibility with any caller that still wants DL dates.
 */
export function mmDdYyyyToAamva (mmDdYyyy: string): string {
  const m = mmDdYyyy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return ''
  return `${m[1].padStart(2, '0')}${m[2].padStart(2, '0')}${m[3]}`
}

function parseCityStateZip (line: string): { city: string; state: string; zip: string } {
  const t = line.trim().toUpperCase()
  const re = /^(.+?)\s+([A-Z]{2})\s+(\d{5})(?:-?(\d{4}))?\s*$/
  const m = t.match(re)
  if (!m) {
    return {
      city: sanitizeField(t).slice(0, 20) || 'UNKNOWN',
      state: 'NY',
      zip: '00000',
    }
  }
  return {
    city: sanitizeField(m[1]).slice(0, 20),
    state: m[2],
    zip: m[3],
  }
}

interface RegistrantName {
  last: string
  first: string
  middle: string
  suffix: string
  combined: string
}

function splitInsuredName (insuredNameUpper: string): RegistrantName {
  const parts = insuredNameUpper.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return { last: '', first: '', middle: '', suffix: '', combined: '' }
  }
  if (parts.length === 1) {
    return {
      last: parts[0].slice(0, 40),
      first: '',
      middle: '',
      suffix: '',
      combined: parts[0].slice(0, 40),
    }
  }
  const last = parts[parts.length - 1].slice(0, 40)
  const first = parts[0].slice(0, 40)
  const middle = parts.length > 2 ? parts.slice(1, -1).join(' ').slice(0, 40) : ''
  const combined = `${last}@${first}`.slice(0, 60)
  return { last, first, middle, suffix: '', combined }
}

interface RegistrantAddress {
  street: string
  city: string
  state: string
  zip: string
}

function buildRegistrantAddress (lines: string[]): RegistrantAddress {
  const trimmed = lines.map(l => sanitizeField(l).toUpperCase()).filter(Boolean)
  if (trimmed.length === 0) {
    return { street: '', city: '', state: 'NY', zip: '00000' }
  }
  const csz = parseCityStateZip(trimmed[trimmed.length - 1])
  const streetParts = trimmed.slice(0, -1)
  const street = streetParts.length > 0
    ? streetParts.join(' ').slice(0, 35)
    : ''
  return { street, city: csz.city, state: csz.state, zip: csz.zip }
}

/**
 * Encode one NY FS-20 insurance subfile body:
 *   `{subfileType}{LF}{ID1}{val1}{LF}…{IDn}{valn}{CR}`.
 * Empty values are allowed (real cards reserve slot fields with no value).
 */
function encodeFs20Subfile (
  subfileType: string,
  pairs: Array<[string, string]>
): string {
  if (pairs.length === 0) {
    return subfileType + AAMVA_ST
  }
  let s = subfileType + AAMVA_DES
  for (let i = 0; i < pairs.length; i++) {
    const [id, val] = pairs[i]
    const isLast = i === pairs.length - 1
    s += id + sanitizeField(val) + (isLast ? AAMVA_ST : AAMVA_DES)
  }
  return s
}

/** Deterministic 32-hex placeholder for SAB (issuer signature) — content-derived. */
function computeSabSignature (
  ...subfiles: Array<Array<[string, string]>>
): string {
  const joined = subfiles
    .flat()
    .map(([k, v]) => k + v)
    .join('|')
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < joined.length; i++) {
    const ch = joined.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761) >>> 0
    h2 = Math.imul(h2 ^ ch, 1597334677) >>> 0
  }
  const a = h1.toString(16).padStart(8, '0').toUpperCase()
  const b = h2.toString(16).padStart(8, '0').toUpperCase()
  const c = (Math.imul(h1, h2) >>> 0).toString(16).padStart(8, '0').toUpperCase()
  const d = (Math.imul(h1 ^ h2, 0xabcd1234) >>> 0)
    .toString(16)
    .padStart(8, '0')
    .toUpperCase()
  return (a + b + c + d).slice(0, 32)
}

function normalizeIssuerCode (raw: string | undefined | null, fallback = '000'): string {
  const t = sanitizeField(raw ?? '').replace(/\D/g, '')
  return (t || fallback).slice(0, 6)
}

export type AamvaNyInsurancePdf417Input = {
  /** Policy number — goes in FR/ZZB (NEVER in DAQ). */
  policyNumber: string
  /** MM/dd/yyyy — emitted as YYYYMMDD in FR/FAC. */
  effectiveMmDdYyyy: string
  /** MM/dd/yyyy — emitted as YYYYMMDD in FR/FAD. */
  expirationMmDdYyyy: string
  /** MM/dd/yyyy issue date — emitted as YYYYMMDD in FR/FAB. Defaults to effective. */
  issueMmDdYyyy?: string
  /** 17-char VIN — VH/VAD. */
  vin: string
  /** 4-digit vehicle year — VH/VAL. */
  vehicleYear: string
  /** Short vehicle make (≤5) — VH/VAK. */
  vehicleMake5: string
  /** Uppercase full insured name — split into RG/RBD (last), RBE (first), RBF (middle). */
  insuredNameUpper: string
  /** 1–3 lines: [street, optional apt, "CITY ST ZIP"] — split into RG/RBN/RBP/RBQ/RBR. */
  insuredAddressLines: string[]
  /**
   * AAMVA DAQ — **driver license number**. Goes in RG subfile.
   * Empty/invalid → `'000000000'` via `normalizeAamvaDaq`.
   */
  daq?: string
  /** 6-digit AAMVA IIN (default NY 636001). */
  iin?: string
  /** AAMVA version (default '03' — insurance card spec). */
  aamvaVersion?: string
  /** Insurer NAIC / issuer code — FR/FAA + FR/ZZC. Default '000'. */
  issuerCode?: string
  /** SI/ZZZ spec / template version — default 'IC200010'. */
  specVersion?: string
}

/**
 * Build the full AAMVA NY FS-20 insurance card PDF417 payload.
 *
 * Output structure (exact byte order):
 *   header(19) | 4×designator(10) | RG body | VH body | FR body | SI body
 *
 * Offsets in the designator block are 0-indexed absolute byte positions of
 * each subfile body within the returned string.
 */
export function buildAamvaNyInsurancePdf417Payload (
  p: AamvaNyInsurancePdf417Input
): string {
  const iin = (p.iin ?? AAMVA_IIN_NY).replace(/\D/g, '').padStart(6, '0').slice(0, 6)
  const aamvaVer = (p.aamvaVersion ?? '03')
    .replace(/\D/g, '')
    .padStart(2, '0')
    .slice(-2)
  const numEntries = '04'

  const header =
    '@' +
    AAMVA_DES +
    AAMVA_RS +
    AAMVA_ST +
    'AAMVA' +
    iin +
    aamvaVer +
    numEntries

  const name = splitInsuredName(p.insuredNameUpper)
  const addr = buildRegistrantAddress(p.insuredAddressLines)
  const daq = normalizeAamvaDaq(p.daq)

  /**
   * RG — Registrant. Includes a second empty "slot" of name/license fields
   * plus reserved ZBC/ZBD/ZBE/RAP markers, matching the layout produced by
   * real NY issuers (see reference card decode in the file header).
   */
  const rgPairs: Array<[string, string]> = [
    ['RBD', name.last],
    ['RBE', name.first],
    ['RBF', name.middle],
    ['RBG', name.suffix],
    ['RBC', name.combined],
    ['DAQ', daq],
    ['RBD', ''],
    ['RBE', ''],
    ['RBF', ''],
    ['RBG', ''],
    ['RBC', ''],
    ['DAQ', ''],
    ['ZBC', ''],
    ['ZBD', ''],
    ['ZBE', ''],
    ['RAP', ''],
    ['RBN', addr.street],
    ['RBP', addr.city],
    ['RBQ', addr.state],
    ['RBR', addr.zip],
  ]

  const vinClean = sanitizeField(p.vin)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 17)
  const yearDigits = (() => {
    const d = sanitizeField(p.vehicleYear).replace(/\D/g, '')
    if (d.length >= 4) return d.slice(-4)
    return d.padStart(4, '0').slice(-4) || '0000'
  })()
  const makeShort = sanitizeField(p.vehicleMake5).toUpperCase().slice(0, 5)

  const vhPairs: Array<[string, string]> = [
    ['VAD', vinClean],
    ['VAL', yearDigits],
    ['VAK', makeShort],
    ['ZZD', 'N'],
    ['ZZE', 'N'],
    ['ZZF', 'N'],
  ]

  const issuer = normalizeIssuerCode(p.issuerCode)
  const eff = mmDdYyyyToAamvaInsuranceDate(p.effectiveMmDdYyyy)
  const exp = mmDdYyyyToAamvaInsuranceDate(p.expirationMmDdYyyy)
  const iss = mmDdYyyyToAamvaInsuranceDate(
    p.issueMmDdYyyy ?? p.effectiveMmDdYyyy
  )
  const policy = sanitizeField(p.policyNumber).slice(0, 25)

  const frPairs: Array<[string, string]> = [
    ['FAA', issuer],
    ['ZZC', issuer],
    ['FAB', iss],
    ['FAC', eff],
    ['FAD', exp],
    ['ZZB', policy],
  ]

  const spec = sanitizeField(p.specVersion ?? 'IC200010')
    .toUpperCase()
    .slice(0, 25)
  const sig = computeSabSignature(rgPairs, vhPairs, frPairs)
  const siPairs: Array<[string, string]> = [
    ['ZZZ', spec],
    ['SAA', '001'],
    ['SAB', sig],
  ]

  const rgBody = encodeFs20Subfile('RG', rgPairs)
  const vhBody = encodeFs20Subfile('VH', vhPairs)
  const frBody = encodeFs20Subfile('FR', frPairs)
  const siBody = encodeFs20Subfile('SI', siPairs)

  const offRg = HEADER_LEN + 4 * SUBFILE_DESIGNATOR_LEN
  const offVh = offRg + rgBody.length
  const offFr = offVh + vhBody.length
  const offSi = offFr + frBody.length

  const designators =
    `RG${pad4(offRg)}${pad4(rgBody.length)}` +
    `VH${pad4(offVh)}${pad4(vhBody.length)}` +
    `FR${pad4(offFr)}${pad4(frBody.length)}` +
    `SI${pad4(offSi)}${pad4(siBody.length)}`

  return header + designators + rgBody + vhBody + frBody + siBody
}
