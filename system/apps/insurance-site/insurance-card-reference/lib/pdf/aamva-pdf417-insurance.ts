/**
 * AAMVA-compliant PDF417 payload for NY FS-20–style insurance ID cards.
 *
 * Follows AAMVA DL/ID Card Design Standard (Annex D) header + subfile designators:
 * - Data Element Separator: LF (0x0A)
 * - Record Separator (header byte 3): ASCII RS (0x1E), not CR
 * - Segment Terminator: CR (0x0D)
 *
 * Subfiles: mandatory "ID" (non-driver) plus NY jurisdiction "ZN" for policy/vehicle.
 * VIN is encoded as element VAD (vehicle / VIN tag per common AAMVA D20 usage).
 */

/** Data element separator — Line Feed */
export const AAMVA_DES = '\x0A'
/** Record separator in header — ASCII RS */
export const AAMVA_RS = '\x1E'
/** Segment terminator — Carriage Return */
export const AAMVA_ST = '\x0D'

/** New York DMV IIN (example / common value; set explicitly for production). */
export const AAMVA_IIN_NY = '636001'

const HEADER_LEN = 21
const SUBFILE_DESIGNATOR_LEN = 10

function pad4 (n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(4, '0').slice(-4)
}

function sanitizeField (value: string): string {
  return value
    .replace(/\r|\n|\x1E/g, ' ')
    .trim()
}

/** AAMVA DAQ (max 25) — alphanumeric; default nine zeros when unknown / none. */
export function normalizeAamvaDaq (value: string | undefined | null): string {
  const t = sanitizeField(value ?? '')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase()
  if (!t) return '000000000'
  return t.slice(0, 25)
}

/** MM/dd/yyyy → MMDDCCYY (U.S. AAMVA date). */
export function mmDdYyyyToAamva (mmDdYyyy: string): string {
  const m = mmDdYyyy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return ''
  const mm = m[1].padStart(2, '0')
  const dd = m[2].padStart(2, '0')
  const yyyy = m[3]
  return `${mm}${dd}${yyyy}`
}

function parseCityStateZip (line: string): { city: string; state: string; zip: string } {
  const t = line.trim().toUpperCase()
  const re = /^(.+?)\s+([A-Z]{2})\s+(\d{5})(?:-?(\d{4}))?\s*$/
  const m = t.match(re)
  if (!m) {
    return {
      city: sanitizeField(t).slice(0, 20) || 'UNKNOWN',
      state: 'NY',
      zip: '000000000',
    }
  }
  const zip9 =
    m[4] != null && m[4] !== ''
      ? `${m[3]}${m[4]}`
      : `${m[3]}0000`
  return {
    city: sanitizeField(m[1]).slice(0, 20),
    state: m[2],
    zip: zip9.slice(0, 9),
  }
}

function splitInsuredName (insuredNameUpper: string): {
  dcs: string
  dac: string
  dad: string
} {
  const parts = insuredNameUpper.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return { dcs: 'NONE', dac: 'NONE', dad: '' }
  }
  if (parts.length === 1) {
    return { dcs: parts[0].slice(0, 40), dac: 'NONE', dad: '' }
  }
  const last = parts[parts.length - 1].slice(0, 40)
  const first = parts[0].slice(0, 40)
  const middle =
    parts.length > 2 ? parts.slice(1, -1).join(' ').slice(0, 40) : ''
  return { dcs: last, dac: first, dad: middle }
}

function buildAddressParts (lines: string[]): {
  dag: string
  dah: string
  dai: string
  daj: string
  dak: string
} {
  const trimmed = lines.map(l => sanitizeField(l).toUpperCase()).filter(Boolean)
  if (trimmed.length === 0) {
    return {
      dag: 'NONE',
      dah: '',
      dai: 'NONE',
      daj: 'NY',
      dak: '000000000',
    }
  }
  const last = trimmed[trimmed.length - 1]
  const { city, state, zip } = parseCityStateZip(last)
  if (trimmed.length === 1) {
    return { dag: trimmed[0].slice(0, 35), dah: '', dai: city, daj: state, dak: zip }
  }
  if (trimmed.length === 2) {
    return {
      dag: trimmed[0].slice(0, 35),
      dah: '',
      dai: city,
      daj: state,
      dak: zip,
    }
  }
  return {
    dag: trimmed[0].slice(0, 35),
    dah: trimmed[1].slice(0, 35),
    dai: city,
    daj: state,
    dak: zip,
  }
}

function encodeSubfile (subfileType: string, pairs: Array<[string, string]>): string {
  if (pairs.length === 0) {
    return `${subfileType}${AAMVA_ST}`
  }
  let s = subfileType
  for (let i = 0; i < pairs.length; i++) {
    const [id, val] = pairs[i]
    const isLast = i === pairs.length - 1
    s += id + sanitizeField(val) + (isLast ? AAMVA_ST : AAMVA_DES)
  }
  return s
}

export type AamvaNyInsurancePdf417Input = {
  policyNumber: string
  effectiveMmDdYyyy: string
  expirationMmDdYyyy: string
  vin: string
  vehicleYear: string
  vehicleMake5: string
  insuredNameUpper: string
  insuredAddressLines: string[]
  /**
   * AAMVA data element DAQ — customer / document discriminator (e.g. DL document number).
   * Not the policy number; policy stays in ZNA / DCF. Omit or empty → `000000000`.
   */
  daq?: string
  /** 6-digit AAMVA IIN */
  iin?: string
  /** AAMVA PDF417 format version (e.g. "10") */
  aamvaVersion?: string
  /** Jurisdiction barcode revision "00"–"99" */
  jurisdictionVersion?: string
}

/**
 * Full AAMVA PDF417 message: fixed header, subfile designators (ID + ZN), then subfile bodies.
 */
export function buildAamvaNyInsurancePdf417Payload (
  p: AamvaNyInsurancePdf417Input
): string {
  const iin = (p.iin ?? AAMVA_IIN_NY).replace(/\D/g, '').padStart(6, '0').slice(0, 6)
  const aamvaVer = (p.aamvaVersion ?? '10').replace(/\D/g, '').padStart(2, '0').slice(-2)
  const jurisVer = (p.jurisdictionVersion ?? '00').replace(/\D/g, '').padStart(2, '0').slice(-2)
  const numEntries = '02'

  const header =
    '@' +
    AAMVA_DES +
    AAMVA_RS +
    AAMVA_ST +
    'ANSI ' +
    iin +
    aamvaVer +
    jurisVer +
    numEntries

  const dbd = mmDdYyyyToAamva(p.effectiveMmDdYyyy)
  const dba = mmDdYyyyToAamva(p.expirationMmDdYyyy)
  const { dcs, dac, dad } = splitInsuredName(p.insuredNameUpper)
  const addr = buildAddressParts(p.insuredAddressLines)

  const vinClean = sanitizeField(p.vin).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17)
  const policy = sanitizeField(p.policyNumber).slice(0, 25)
  const dcfBase = `${policy}|${vinClean}`.slice(0, 25)
  const daq = normalizeAamvaDaq(p.daq)

  const idPairs: Array<[string, string]> = [
    ['DCS', dcs],
    ['DAC', dac],
    ['DAD', dad || 'NONE'],
    ['DBD', dbd || 'unavl'],
    ['DBB', 'unavl'],
    ['DBA', dba || 'unavl'],
    ['DBC', '9'],
    ['DAY', 'UNK'],
    ['DAU', '000 in'],
    ['DAG', addr.dag],
    ...(addr.dah ? ([['DAH', addr.dah]] as Array<[string, string]>) : []),
    ['DAI', addr.dai],
    ['DAJ', addr.daj],
    ['DAK', addr.dak],
    ['DAQ', daq],
    ['DCF', dcfBase],
    ['DCG', 'USA'],
    ['DDE', 'N'],
    ['DDF', 'N'],
    ['DDG', 'N'],
    ['VAD', vinClean || 'NONE'],
  ]

  const znPairs: Array<[string, string]> = [
    ['ZNA', policy],
    ['ZNB', vinClean || 'NONE'],
    [
      'ZNC',
      (() => {
        const d = sanitizeField(p.vehicleYear).replace(/\D/g, '')
        if (d.length >= 4) return d.slice(-4)
        return d.padStart(4, '0').slice(-4) || '0000'
      })(),
    ],
    ['ZND', sanitizeField(p.vehicleMake5).toUpperCase().slice(0, 5)],
    ['ZNE', dbd || 'unavl'],
    ['ZNF', dba || 'unavl'],
  ]

  const idBody = encodeSubfile('ID', idPairs)
  const znBody = encodeSubfile('ZN', znPairs)

  const offsetId = HEADER_LEN + 2 * SUBFILE_DESIGNATOR_LEN
  const lenId = idBody.length
  const offsetZn = offsetId + lenId
  const lenZn = znBody.length

  const designators =
    `ID${pad4(offsetId)}${pad4(lenId)}` + `ZN${pad4(offsetZn)}${pad4(lenZn)}`

  return header + designators + idBody + znBody
}
