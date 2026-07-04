import { NextResponse, type NextRequest } from 'next/server'
import {
  buildAamvaNyInsurancePdf417Payload,
  type AamvaNyInsurancePdf417Input,
} from '@/lib/pdf/aamva-pdf417-insurance'
import { renderPdf417Png } from '@/lib/pdf/pdf417-render'
import {
  BARCODE_STYLES,
  getBarcodeStyle,
  pxToMm,
  type BarcodeStyleId,
} from '@/lib/barcode-generator/presets'

export const runtime = 'nodejs'

type RenderRequest = {
  /** Raw AAMVA-encoded payload to put in the symbol; takes precedence over `aamva`. */
  rawPayload?: string
  /** Structured AAMVA inputs (NY insurance flavor) — combined into the standards header. */
  aamva?: Partial<AamvaNyInsurancePdf417Input>
  /** `card` (3:1) or `fax` (taller). */
  style?: BarcodeStyleId
  /** Encoded as base64 PNG when `format = 'json'`; defaults to `binary` PNG response. */
  format?: 'binary' | 'json'
  /** Optional override of bwip-js module scale (px per module). */
  scale?: number
  /** Optional override of PDF417 column count. */
  columns?: number
}

function buildPayload (body: RenderRequest): string {
  if (body.rawPayload && body.rawPayload.length > 0) return body.rawPayload
  const a = body.aamva ?? {}
  return buildAamvaNyInsurancePdf417Payload({
    policyNumber: a.policyNumber ?? '',
    effectiveMmDdYyyy: a.effectiveMmDdYyyy ?? '',
    expirationMmDdYyyy: a.expirationMmDdYyyy ?? '',
    vin: a.vin ?? '',
    vehicleYear: a.vehicleYear ?? '',
    vehicleMake5: a.vehicleMake5 ?? '',
    insuredNameUpper: a.insuredNameUpper ?? '',
    insuredAddressLines: a.insuredAddressLines ?? [],
    daq: a.daq,
    iin: a.iin,
    aamvaVersion: a.aamvaVersion,
    issuerCode: a.issuerCode,
    specVersion: a.specVersion,
  })
}

export async function POST (request: NextRequest) {
  let body: RenderRequest
  try {
    body = (await request.json()) as RenderRequest
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const style = getBarcodeStyle(body.style ?? 'card')
  const payload = buildPayload(body)

  if (!payload) {
    return NextResponse.json(
      { ok: false, error: 'No barcode payload (provide `rawPayload` or `aamva` fields).' },
      { status: 400 }
    )
  }

  let png: Buffer
  try {
    png = await renderPdf417Png(payload, {
      scale: body.scale ?? style.scale,
      columns: body.columns ?? style.columns,
      widthMm: pxToMm(style.widthPx),
      heightMm: pxToMm(style.heightPx),
      eclevel: 4,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Render failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }

  if (body.format === 'json') {
    return NextResponse.json({
      ok: true,
      base64: png.toString('base64'),
      style: style.id,
      widthPx: style.widthPx,
      heightPx: style.heightPx,
      payload,
      payloadLength: payload.length,
      payloadPreview: payload
        .replace(/\x0A/g, '\\n')
        .replace(/\x0D/g, '\\r')
        .replace(/\x1E/g, '\\x1E'),
    })
  }

  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store',
      'X-Barcode-Style': style.id,
      'X-Barcode-Style-Width': String(style.widthPx),
      'X-Barcode-Style-Height': String(style.heightPx),
    },
  })
}

export async function GET () {
  return NextResponse.json({
    ok: true,
    styles: Object.values(BARCODE_STYLES),
  })
}
