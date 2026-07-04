import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { buildAamvaNyInsurancePdf417Payload } from '@/lib/pdf/aamva-pdf417-insurance'
import { layoutPxToMm, renderPdf417Png } from '@/lib/pdf/pdf417-render'

/**
 * NY State Insurance Identification Card (FS-20) — pixel-exact port of the
 * reference policy PDF (Letter portrait, 612 × 792 pt).
 *
 * All x / y coordinates below are taken straight from the reference page's
 * text and path operators, then re-anchored to a `cardTopY` for each card
 * so the same template draws both duplicate cards.
 */

export interface NyInsuranceCardInput {
  /** Policy number (e.g. "2035252790"). */
  policyNumber: string
  /** MM/dd/yyyy. */
  effectiveMmDdYyyy: string
  /** MM/dd/yyyy. */
  expirationMmDdYyyy: string
  /** 4-digit year on FS-20. */
  vehicleYearFull: string
  /** Make column — typically first 5 letters, uppercase (e.g. NISSA). */
  vehicleMakeShort: string
  /** 17-character VIN. */
  vin: string
  /** Uppercase full insured name (used for AAMVA PDF417 and optional card print). */
  insuredNameUpper: string
  /** 1–3 lines of insured address (street, city/state/zip). */
  insuredAddressLines: string[]
  /** Optional explicit FS-20 short name on the printed card (e.g. DOE,J). */
  insuredFs20Name?: string

  /** Issuer line (NAIC + insurer name), e.g. "484 NEW SOUTH INS.CO.". */
  issuerCompanyLine?: string
  /** Issuer phone (numeric). */
  issuerPhone?: string
  /** Producing agency name (large bold). */
  agencyName?: string
  /** Producing agency address lines (2 lines typical). */
  agencyAddressLines?: string[]

  /** AAMVA IIN to embed in the barcode header (default 636001 = NY). */
  iin?: string

  /**
   * AAMVA DAQ — **driver license number** of the insured / registrant.
   * Goes in the RG subfile of the NY FS-20 PDF417. Not the policy number.
   * Omit / empty → `'000000000'` in the PDF417.
   */
  daq?: string

  /**
   * Insurer NAIC / issuer code embedded in the FR subfile (FAA + ZZC).
   * If omitted, derived from the leading numeric token of `issuerCompanyLine`
   * (e.g. `"02 TRI-STATE COVERAGE INC"` → `'02'`), falling back to `'000'`.
   */
  issuerCode?: string
}

/** Pull leading numeric token from an issuer line (e.g. "02 TRI-STATE …" → "02"). */
function issuerCodeFromIssuerLine (line: string | undefined): string {
  const m = (line ?? '').trim().match(/^(\d{1,6})\b/)
  return m ? m[1] : ''
}

/** FS-20 style short name: LAST,FIRSTINITIAL from an uppercase full name. */
export function formatInsuredNameFs20 (insuredNameUpper: string): string {
  const p = insuredNameUpper.trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return ''
  if (p.length === 1) return p[0]
  const last = p[p.length - 1]
  const firstInitial = p[0].charAt(0) || ''
  return `${last},${firstInitial}`
}

const PAGE_W = 612
const PAGE_H = 792

const CARD_TOP_1 = 777.6
const CARD_LEFT = 3.6
const CARD_W = 561.6
const CARD_H = 254.16
const CARD_PITCH = 264.24
const CARD_TOP_2 = CARD_TOP_1 - CARD_PITCH

const STROKE_THICK = 0.6

const CARD_DIVIDER_Y = 518.4

const BARCODE_X = 18.03
const BARCODE_Y_FROM_CARD_BOTTOM = 532.83 - (CARD_TOP_1 - CARD_H)
const BARCODE_W = 294.42
const BARCODE_H = 57.54

const FAX_BARCODE_X = 1.47
const FAX_BARCODE_Y = 57.63
const FAX_BARCODE_W = 287.94
const FAX_BARCODE_H = 107.94

const INSURED_BOX_LEFT = 7.2
const INSURED_BOX_RIGHT = 219.6
const INSURED_BOX_TOP = 669.6
const INSURED_BOX_BOTTOM = 604.8
const INSURED_CORNER_H = 18
const INSURED_CORNER_W_L = 46.8
const INSURED_CORNER_W_R = 57.6

const VALUE_UNDERLINES: Array<{ x: number; y: number; w: number }> = [
  { x: 255.6, y: 742.32, w: 133.20 },
  { x: 255.6, y: 714.96, w: 43.20 },
  { x: 327.6, y: 714.96, w: 43.20 },
  { x: 255.6, y: 658.80, w: 36.00 },
  { x: 314.64, y: 658.80, w: 56.16 },
  { x: 255.6, y: 637.20, w: 115.20 },
]

interface TxItem {
  x: number
  y: number
  size: number
  bold?: boolean
  text: string | ((d: NyInsuranceCardInput) => string)
}

const WARN_TEXT: Array<[number, string]> = [
  [763.3, 'THIS ID CARD MUST BE CARRIED'],
  [754.7, 'IN THE INSURED VEHICLE FOR'],
  [746.0, 'PRODUCTION UPON DEMAND'],
  [728.8, 'WARNING: Any person who issues'],
  [720.1, 'or produces an ID card knowing that'],
  [711.5, "an Owner's Policy of insurance is not in"],
  [702.8, 'effect may be committing a misdemeanor.'],
  [694.2, 'In addition, a person who presents'],
  [685.6, 'an ID card if insurance is not in'],
  [676.9, 'effect may be committing a'],
  [668.3, 'misdemeanor.'],
  [651.0, 'The name of the registrant and the'],
  [642.4, 'name of the insured must coincide.'],
  [625.1, 'REPLACEMENT VEHICLE NOTATION:'],
  [616.4, 'DMV WILL ONLY PROCESS A VEHICLE'],
  [607.8, 'CHANGE (RE-REGISTRATION) USING'],
  [599.2, "THE REPLACED VEHICLE'S CURRENT"],
  [590.5, 'REGISTRATION.'],
]

const TEXT_ITEMS: TxItem[] = [
  { x: 61.9, y: 766.1, size: 10.8, bold: true, text: 'NEW YORK STATE INSURANCE IDENTIFICATION CARD' },

  { x: 10.8, y: 748.0, size: 8.64, bold: true, text: d => firstWord(d.issuerCompanyLine ?? '169') },
  { x: 32.4, y: 748.0, size: 8.64, bold: true, text: d => restAfterFirstWord(d.issuerCompanyLine ?? '169 NATIONAL SPECIALTY INSURANCE COMPANY') },
  { x: 7.2, y: 730.9, size: 7.2, text: 'Name & Address of Issuer' },
  { x: 97.2, y: 729.2, size: 8.64, bold: true, text: d => d.agencyName ?? 'SERVICED BY AIPSO-SAIP' },
  { x: 7.2, y: 719.8, size: 7.2, bold: true, text: d => (d.issuerPhone ?? '').trim() },
  { x: 97.2, y: 719.2, size: 8.64, bold: true, text: d => d.agencyAddressLines?.[0] ?? 'PO BOX 6400' },
  { x: 97.2, y: 709.1, size: 8.64, bold: true, text: d => d.agencyAddressLines?.[1] ?? 'PROVIDENCE, RI 02940-6200' },

  { x: 255.6, y: 754.0, size: 8.64, text: 'Policy Number' },
  { x: 255.6, y: 743.6, size: 8.64, bold: true, text: d => d.policyNumber },
  { x: 255.6, y: 728.8, size: 8.64, text: 'Effective Date' },
  { x: 327.6, y: 728.8, size: 8.64, text: 'Expiration Date' },
  { x: 255.6, y: 716.3, size: 8.64, bold: true, text: d => d.effectiveMmDdYyyy },
  { x: 327.6, y: 716.3, size: 8.64, bold: true, text: d => d.expirationMmDdYyyy },
  { x: 255.6, y: 706.4, size: 7.2, text: '12:01 a.m.' },
  { x: 327.6, y: 706.4, size: 7.2, text: '12:01 a.m.' },
  { x: 255.6, y: 697.0, size: 7.2, text: '(Not acceptable to obtain registration' },
  { x: 255.6, y: 689.8, size: 7.2, text: 'after 45 days from effective date.)' },
  { x: 255.6, y: 680.5, size: 7.2, text: 'Applicable with respect to the following' },
  { x: 255.6, y: 673.3, size: 7.2, text: 'Motor Vehicle:' },
  { x: 262.8, y: 661.6, size: 8.64, bold: true, text: d => d.vehicleYearFull },
  { x: 331.2, y: 661.6, size: 8.64, bold: true, text: d => d.vehicleMakeShort.toUpperCase().slice(0, 5) },
  { x: 266.4, y: 650.9, size: 7.2, text: 'Year' },
  { x: 335.5, y: 650.9, size: 7.2, text: 'Make' },
  { x: 255.6, y: 639.2, size: 7.92, bold: true, text: d => d.vin },
  { x: 266.4, y: 628.6, size: 7.2, text: 'Vehicle Identification Number' },

  { x: 7.2, y: 690.5, size: 7.2, text: "An authorized NEW YORK insurer has issued an Owner's Policy of" },
  { x: 7.2, y: 682.6, size: 7.2, text: 'Liability Insurance complying with Article 6 (Motor Vehicle Financial' },
  { x: 7.2, y: 674.7, size: 7.2, text: 'Security Act) of the NEW YORK Vehicle and Traffic Law to:' },
  { x: 28.8, y: 640.7, size: 8.64, bold: true, text: d => d.insuredFs20Name?.toUpperCase().trim() || d.insuredNameUpper },
  { x: 28.8, y: 630.6, size: 8.64, bold: true, text: d => d.insuredAddressLines[0]?.toUpperCase() ?? '' },
  { x: 28.8, y: 620.5, size: 8.64, bold: true, text: d => d.insuredAddressLines[1]?.toUpperCase() ?? '' },
  { x: 28.8, y: 610.4, size: 8.64, bold: true, text: d => d.insuredAddressLines[2]?.toUpperCase() ?? '' },

  { x: 532.8, y: 526.8, size: 7.2, bold: true, text: 'FS-20' },
]

function resolveText (text: TxItem['text'], data: NyInsuranceCardInput): string {
  return typeof text === 'function' ? text(data) : text
}

function firstWord (s: string): string {
  const parts = s.trim().split(/\s+/)
  return parts[0] ?? ''
}

function restAfterFirstWord (s: string): string {
  const parts = s.trim().split(/\s+/)
  return parts.slice(1).join(' ')
}

function drawCornerMarks (page: import('pdf-lib').PDFPage, dy: number) {
  const yTop = INSURED_BOX_TOP + dy
  const yBot = INSURED_BOX_BOTTOM + dy
  const xL = INSURED_BOX_LEFT
  const xR = INSURED_BOX_RIGHT
  const stroke = { thickness: STROKE_THICK, color: rgb(0, 0, 0) }

  page.drawLine({ start: { x: xL, y: yTop - INSURED_CORNER_H }, end: { x: xL, y: yTop }, ...stroke })
  page.drawLine({ start: { x: xL, y: yTop }, end: { x: xL + INSURED_CORNER_W_L, y: yTop }, ...stroke })

  page.drawLine({ start: { x: xL, y: yBot + INSURED_CORNER_H }, end: { x: xL, y: yBot }, ...stroke })
  page.drawLine({ start: { x: xL, y: yBot }, end: { x: xL + INSURED_CORNER_W_L, y: yBot }, ...stroke })

  page.drawLine({ start: { x: xR - INSURED_CORNER_W_R, y: yTop }, end: { x: xR, y: yTop }, ...stroke })
  page.drawLine({ start: { x: xR, y: yTop }, end: { x: xR, y: yTop - INSURED_CORNER_H }, ...stroke })

  page.drawLine({ start: { x: xR - INSURED_CORNER_W_R, y: yBot }, end: { x: xR, y: yBot }, ...stroke })
  page.drawLine({ start: { x: xR, y: yBot }, end: { x: xR, y: yBot + INSURED_CORNER_H }, ...stroke })
}

export async function buildNyInsuranceIdCardPdf (
  input: NyInsuranceCardInput,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([PAGE_W, PAGE_H])
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const data: NyInsuranceCardInput = {
    ...input,
    insuredAddressLines: (input.insuredAddressLines ?? []).map(l => l.trim()).filter(Boolean),
  }

  const legalNameUpper = data.insuredNameUpper.trim().toUpperCase()

  const payload = buildAamvaNyInsurancePdf417Payload({
    policyNumber: data.policyNumber,
    effectiveMmDdYyyy: data.effectiveMmDdYyyy,
    expirationMmDdYyyy: data.expirationMmDdYyyy,
    vin: data.vin,
    vehicleYear: data.vehicleYearFull,
    vehicleMake5: data.vehicleMakeShort.toUpperCase().slice(0, 5),
    insuredNameUpper: legalNameUpper,
    insuredAddressLines: data.insuredAddressLines.map(l => l.toUpperCase()),
    daq: data.daq,
    iin: data.iin,
    issuerCode:
      data.issuerCode ?? issuerCodeFromIssuerLine(data.issuerCompanyLine),
  })

  const cardBcPng = await renderPdf417Png(payload, {
    columns: 10,
    scale: 2,
    widthMm: layoutPxToMm((BARCODE_W * 96) / 72),
    heightMm: layoutPxToMm((BARCODE_H * 96) / 72),
  })
  const cardBcImg = await doc.embedPng(cardBcPng)

  const faxBcPng = await renderPdf417Png(payload, {
    columns: 12,
    scale: 3,
    widthMm: layoutPxToMm((FAX_BARCODE_W * 96) / 72),
    heightMm: layoutPxToMm((FAX_BARCODE_H * 96) / 72),
  })
  const faxBcImg = await doc.embedPng(faxBcPng)

  const drawCard = (cardTop: number) => {
    const dy = cardTop - CARD_TOP_1

    page.drawRectangle({
      x: CARD_LEFT,
      y: cardTop - CARD_H,
      width: CARD_W,
      height: CARD_H,
      borderColor: rgb(0, 0, 0),
      borderWidth: STROKE_THICK,
    })

    drawCornerMarks(page, dy)

    for (const [refY, line] of WARN_TEXT) {
      page.drawText(line, {
        x: 414,
        y: refY + dy,
        size: 7.92,
        font: regular,
        color: rgb(0, 0, 0),
      })
    }

    for (const it of TEXT_ITEMS) {
      const t = resolveText(it.text, data)
      if (!t) continue
      page.drawText(t, {
        x: it.x,
        y: it.y + dy,
        size: it.size,
        font: it.bold ? bold : regular,
        color: rgb(0, 0, 0),
      })
    }

    for (const ul of VALUE_UNDERLINES) {
      page.drawLine({
        start: { x: ul.x, y: ul.y + dy },
        end: { x: ul.x + ul.w, y: ul.y + dy },
        thickness: STROKE_THICK,
        color: rgb(0, 0, 0),
      })
    }

    page.drawImage(cardBcImg, {
      x: BARCODE_X,
      y: (cardTop - CARD_H) + BARCODE_Y_FROM_CARD_BOTTOM,
      width: BARCODE_W,
      height: BARCODE_H,
    })
  }

  drawCard(CARD_TOP_1)
  drawCard(CARD_TOP_2)

  page.drawLine({
    start: { x: 0, y: CARD_DIVIDER_Y },
    end: { x: PAGE_W, y: CARD_DIVIDER_Y },
    thickness: STROKE_THICK,
    color: rgb(0, 0, 0),
  })

  page.drawText('FAX: Scanable Bar Code', {
    x: 14.4,
    y: 170.5,
    size: 12.96,
    font: regular,
    color: rgb(0, 0, 0),
  })

  page.drawImage(faxBcImg, {
    x: FAX_BARCODE_X,
    y: FAX_BARCODE_Y,
    width: FAX_BARCODE_W,
    height: FAX_BARCODE_H,
  })

  page.drawText('FAX INSTRUCTIONS:', {
    x: 331.2,
    y: 160.1,
    size: 10.08,
    font: regular,
    color: rgb(0, 0, 0),
  })

  const FAX_INSTRUCTIONS: Array<[number, number, string]> = [
    [316.8, 144.1, '1. The entire page must be faxed.'],
    [316.8, 126.8, '2. If submitted to DMV, either the entire page or the second'],
    [323.3, 118.2, 'ID card and large scanable bar code will be retained'],
    [316.8, 100.9, '3. A faxed ID card must be replaced with a scanable'],
    [323.3, 92.3, 'ID card within 14 days of the effective date.'],
    [316.8, 75.0, '4. DMV will not accept a faxed ID card without a'],
    [323.3, 66.4, 'scanable barcode'],
  ]
  for (const [x, y, line] of FAX_INSTRUCTIONS) {
    page.drawText(line, {
      x,
      y,
      size: 7.92,
      font: regular,
      color: rgb(0, 0, 0),
    })
  }

  return doc.save()
}
