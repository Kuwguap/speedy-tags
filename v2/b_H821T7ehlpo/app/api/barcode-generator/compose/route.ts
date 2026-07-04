import { NextResponse, type NextRequest } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import {
  buildAamvaNyInsurancePdf417Payload,
  type AamvaNyInsurancePdf417Input,
} from '@/lib/pdf/aamva-pdf417-insurance'
import { renderPdf417Png } from '@/lib/pdf/pdf417-render'
import {
  getBarcodeStyle,
  pxToMm,
  type BarcodeStyleId,
} from '@/lib/barcode-generator/presets'

export const runtime = 'nodejs'

type BarcodePlacement = {
  /** Style preset (`card` | `fax`). */
  style?: BarcodeStyleId
  /** Pixel position on the background image (top-left origin). */
  xPx: number
  yPx: number
  /** Pixel size on the background image. */
  widthPx: number
  heightPx: number
  /** Optional override of bwip-js scale / columns. */
  scale?: number
  columns?: number
}

type ComposeRequest = {
  /** PNG / JPG background as data URL ("data:image/png;base64,..."). */
  backgroundDataUrl: string
  /** Native dimensions of the background image (matches xPx / yPx coordinate space). */
  backgroundWidthPx: number
  backgroundHeightPx: number
  /** Output container — `pdf` builds a single-page PDF, `png` flattens to PNG. */
  output: 'pdf' | 'png'
  /** Same payload shape as the render API. */
  rawPayload?: string
  aamva?: Partial<AamvaNyInsurancePdf417Input>
  /** Where to draw the rendered barcodes on the background image. */
  placements: BarcodePlacement[]
}

function buildPayload (body: ComposeRequest): string {
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

function decodeDataUrl (dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  const m = dataUrl.match(/^data:([\w/+-]+);base64,(.+)$/)
  if (!m) return null
  const bin = Buffer.from(m[2], 'base64')
  return { mime: m[1].toLowerCase(), bytes: new Uint8Array(bin) }
}

export async function POST (request: NextRequest) {
  let body: ComposeRequest
  try {
    body = (await request.json()) as ComposeRequest
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.backgroundDataUrl || !body.backgroundWidthPx || !body.backgroundHeightPx) {
    return NextResponse.json(
      { ok: false, error: 'Missing background image or dimensions.' },
      { status: 400 }
    )
  }

  const bg = decodeDataUrl(body.backgroundDataUrl)
  if (!bg) {
    return NextResponse.json(
      { ok: false, error: 'Background must be a base64 data URL (image/png or image/jpeg).' },
      { status: 400 }
    )
  }
  if (!/^image\/(png|jpe?g)$/.test(bg.mime)) {
    return NextResponse.json(
      { ok: false, error: 'Only PNG / JPG backgrounds are supported.' },
      { status: 400 }
    )
  }

  const payload = buildPayload(body)
  if (!payload) {
    return NextResponse.json(
      { ok: false, error: 'No barcode payload provided.' },
      { status: 400 }
    )
  }

  const placements = (body.placements ?? []).filter(Boolean)
  if (placements.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'Add at least one barcode placement.' },
      { status: 400 }
    )
  }

  const renderedBarcodes: Array<{ png: Buffer; placement: BarcodePlacement }> = []
  for (const p of placements) {
    const style = getBarcodeStyle(p.style ?? 'card')
    const png = await renderPdf417Png(payload, {
      scale: p.scale ?? style.scale,
      columns: p.columns ?? style.columns,
      widthMm: pxToMm(p.widthPx > 0 ? p.widthPx : style.widthPx),
      heightMm: pxToMm(p.heightPx > 0 ? p.heightPx : style.heightPx),
      eclevel: 4,
    })
    renderedBarcodes.push({ png, placement: p })
  }

  if (body.output === 'pdf') {
    const doc = await PDFDocument.create()
    const page = doc.addPage([body.backgroundWidthPx, body.backgroundHeightPx])
    const bgImg =
      bg.mime === 'image/png'
        ? await doc.embedPng(bg.bytes)
        : await doc.embedJpg(bg.bytes)
    page.drawImage(bgImg, {
      x: 0,
      y: 0,
      width: body.backgroundWidthPx,
      height: body.backgroundHeightPx,
    })
    for (const r of renderedBarcodes) {
      const img = await doc.embedPng(new Uint8Array(r.png))
      const yFromBottom = body.backgroundHeightPx - r.placement.yPx - r.placement.heightPx
      page.drawImage(img, {
        x: r.placement.xPx,
        y: yFromBottom,
        width: r.placement.widthPx,
        height: r.placement.heightPx,
      })
    }
    const pdfBytes = await doc.save()
    return new NextResponse(new Uint8Array(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="barcode-composite.pdf"',
        'Cache-Control': 'no-store',
      },
    })
  }

  // PNG output: return rendered barcodes + placement so the browser composites
  // the final flat image (avoids adding a server-side raster lib like sharp/canvas).
  return NextResponse.json({
    ok: true,
    backgroundWidthPx: body.backgroundWidthPx,
    backgroundHeightPx: body.backgroundHeightPx,
    payload,
    payloadLength: payload.length,
    barcodes: renderedBarcodes.map(r => ({
      style: r.placement.style ?? 'card',
      xPx: r.placement.xPx,
      yPx: r.placement.yPx,
      widthPx: r.placement.widthPx,
      heightPx: r.placement.heightPx,
      base64: r.png.toString('base64'),
    })),
  })
}
