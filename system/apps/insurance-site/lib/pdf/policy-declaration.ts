import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

/**
 * Auto-insurance Policy Declaration PDF — a single-page Letter document
 * mirroring the data a real declarations page carries:
 *
 *   - Issuer + policyholder
 *   - Policy number, effective + expiration dates, term
 *   - Insured vehicle (year / make / model / trim / VIN)
 *   - Coverage summary + monthly premium
 *   - Billing address
 *   - Signature line + generation timestamp
 *
 * Everything below is drawn deterministically from the input object; no
 * external assets needed (uses Helvetica + Helvetica-Bold).
 */

export type CoverageDeclLine = {
  label: string
  /** Free-form value: "Included", "$50,000 / $100,000", "Not selected", etc. */
  value: string
}

export type PolicyDeclarationVehicle = {
  policyNumber: string
  termLabel: string
  monthlyPremiumLabel: string
  effectiveLabel: string
  expirationLabel: string
  year: string
  make: string
  model: string
  trim?: string
  vin: string
  bodyClass?: string
}

export interface PolicyDeclarationInput {
  /** Combined monthly premium across every insured vehicle on the account. */
  accountMonthlyPremiumLabel: string
  accountTotalForTermLabel?: string

  insuredName: string
  insuredEmail: string
  insuredPhone: string

  billingAddress: {
    line1: string
    line2?: string
    city: string
    state: string
    postalCode: string
    country?: string
  }

  /** One entry per vehicle on the account (oldest first). */
  vehicles: PolicyDeclarationVehicle[]

  coverages: CoverageDeclLine[]

  issuer: {
    name: string
    address: string[]
    phone: string
  }

  generatedAtIso: string

  /** @deprecated Single-vehicle fields — kept for internal migration only. */
  policyNumber?: string
  effectiveLabel?: string
  expirationLabel?: string
  termLabel?: string
  monthlyPremiumLabel?: string
  totalForTermLabel?: string
  vehicle?: PolicyDeclarationVehicle
}

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 48

interface Ctx {
  page: PDFPage
  regular: PDFFont
  bold: PDFFont
  y: number
}

function drawText (
  ctx: Ctx,
  text: string,
  opts: { x?: number; size?: number; bold?: boolean; color?: [number, number, number] } = {}
) {
  const size = opts.size ?? 10
  const x = opts.x ?? MARGIN
  ctx.page.drawText(text, {
    x,
    y: ctx.y,
    size,
    font: opts.bold ? ctx.bold : ctx.regular,
    color: rgb(...(opts.color ?? [0.07, 0.09, 0.12])),
  })
}

function moveDown (ctx: Ctx, n: number) {
  ctx.y -= n
}

function hr (ctx: Ctx, color: [number, number, number] = [0.85, 0.88, 0.92]) {
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_W - MARGIN, y: ctx.y },
    thickness: 0.7,
    color: rgb(...color),
  })
  moveDown(ctx, 14)
}

function sectionHeader (ctx: Ctx, title: string) {
  drawText(ctx, title.toUpperCase(), { size: 9.5, bold: true, color: [0.18, 0.52, 0.5] })
  moveDown(ctx, 16)
}

function row (ctx: Ctx, label: string, value: string) {
  drawText(ctx, label, { size: 9, color: [0.35, 0.41, 0.48] })
  drawText(ctx, value || '—', { x: MARGIN + 180, size: 10, bold: true })
  moveDown(ctx, 16)
}

function formatBillingAddress (a: PolicyDeclarationInput['billingAddress']): string[] {
  const parts: string[] = []
  if (a.line1) parts.push(a.line1)
  if (a.line2) parts.push(a.line2)
  const cityLine = [a.city, a.state, a.postalCode].filter(Boolean).join(', ')
  if (cityLine) parts.push(cityLine)
  if (a.country && a.country.toUpperCase() !== 'US') parts.push(a.country)
  return parts.length > 0 ? parts : ['—']
}

export async function buildPolicyDeclarationPdf (
  input: PolicyDeclarationInput
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([PAGE_W, PAGE_H])
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ctx: Ctx = { page, regular, bold, y: PAGE_H - MARGIN }

  // === Header band ============================================================
  page.drawRectangle({
    x: 0,
    y: PAGE_H - 76,
    width: PAGE_W,
    height: 76,
    color: rgb(0.05, 0.32, 0.34),
  })
  page.drawText('AUTO INSURANCE POLICY DECLARATION', {
    x: MARGIN,
    y: PAGE_H - 38,
    size: 14,
    font: bold,
    color: rgb(1, 1, 1),
  })
  page.drawText(input.issuer.name, {
    x: MARGIN,
    y: PAGE_H - 58,
    size: 10,
    font: regular,
    color: rgb(0.85, 0.95, 0.93),
  })
  page.drawText(`Generated ${new Date(input.generatedAtIso).toLocaleString('en-US')}`, {
    x: PAGE_W - MARGIN - 175,
    y: PAGE_H - 58,
    size: 8.5,
    font: regular,
    color: rgb(0.78, 0.92, 0.9),
  })

  ctx.y = PAGE_H - 110

  // === Issuer + Insured ======================================================
  sectionHeader(ctx, 'Issued by')
  for (const line of [input.issuer.name, ...input.issuer.address, input.issuer.phone]) {
    drawText(ctx, line, { size: 10 })
    moveDown(ctx, 13)
  }
  moveDown(ctx, 4)
  hr(ctx)

  sectionHeader(ctx, 'Insured')
  drawText(ctx, input.insuredName, { size: 11, bold: true })
  moveDown(ctx, 14)
  drawText(ctx, input.insuredEmail, { size: 9.5, color: [0.35, 0.41, 0.48] })
  moveDown(ctx, 13)
  drawText(ctx, input.insuredPhone, { size: 9.5, color: [0.35, 0.41, 0.48] })
  moveDown(ctx, 13)
  for (const ln of formatBillingAddress(input.billingAddress)) {
    drawText(ctx, ln, { size: 9.5, color: [0.35, 0.41, 0.48] })
    moveDown(ctx, 13)
  }
  moveDown(ctx, 4)
  hr(ctx)

  // === Account premium summary ===============================================
  sectionHeader(ctx, 'Account summary')
  row(ctx, 'Vehicles insured', String(input.vehicles.length))
  row(ctx, 'Total monthly premium', input.accountMonthlyPremiumLabel)
  if (input.accountTotalForTermLabel) {
    row(ctx, 'Estimated term total', input.accountTotalForTermLabel)
  }
  hr(ctx)

  // === Each insured vehicle ====================================================
  for (let i = 0; i < input.vehicles.length; i += 1) {
    const v = input.vehicles[i]
    const heading =
      input.vehicles.length > 1
        ? `Insured vehicle ${i + 1}`
        : 'Insured vehicle'
    sectionHeader(ctx, heading)
    row(ctx, 'Policy number', v.policyNumber)
    row(ctx, 'Effective', v.effectiveLabel)
    row(ctx, 'Expiration', v.expirationLabel)
    row(ctx, 'Term', v.termLabel)
    row(ctx, 'Monthly premium', v.monthlyPremiumLabel)
    const yearMakeModel = [v.year, v.make, v.model].filter(Boolean).join(' ').trim()
    row(ctx, 'Year / Make / Model', yearMakeModel || '—')
    if (v.trim) row(ctx, 'Trim', v.trim)
    if (v.bodyClass) row(ctx, 'Body class', v.bodyClass)
    row(ctx, 'VIN', v.vin)
    if (i < input.vehicles.length - 1) {
      moveDown(ctx, 2)
      hr(ctx)
    }
  }
  hr(ctx)

  // === Coverage ==============================================================
  sectionHeader(ctx, 'Coverage')
  for (const c of input.coverages) {
    row(ctx, c.label, c.value)
  }
  hr(ctx)

  // === Footer ================================================================
  moveDown(ctx, 4)
  drawText(
    ctx,
    'This document summarizes coverage in force as of the generation date.',
    { size: 8.5, color: [0.45, 0.5, 0.57] }
  )
  moveDown(ctx, 12)
  drawText(
    ctx,
    'Retain with your records. The official insurance identification card is filed separately.',
    { size: 8.5, color: [0.45, 0.5, 0.57] }
  )

  return doc.save()
}
