import bwipjs from 'bwip-js'
import { buildAamvaNyInsurancePdf417Payload } from '@/lib/pdf/aamva-pdf417-insurance'

/** Convert layout pixels (CSS px @ 96 DPI) to millimeters for BWIPP `width` / `height`. */
export function layoutPxToMm (px: number): number {
  return (px * 25.4) / 96
}

/** Convert layout pixels (CSS px @ 96 DPI) to PDF points (72 pt / inch). */
export function layoutPxToPdfPt (px: number): number {
  return (px * 72) / 96
}

export type RenderPdf417Options = {
  /** Module scale; multiplied with BWIPP mm sizing per bwip-js docs */
  scale?: number
  columns?: number
  eclevel?: number
  /**
   * Optional max symbol size in mm — BWIPP fits PDF417 within these bounds while
   * keeping square modules (better than stretching PNG to arbitrary aspect).
   */
  widthMm?: number
  heightMm?: number
}

/**
 * Renders PDF417 for NY FS-20 scan areas. Payload is AAMVA Annex D structured data
 * (LF / RS / CR separators, ANSI header, subfiles); not encrypted.
 * Error correction ≥ 3 per AAMVA (bwip-js eclevel 4).
 */
export async function renderPdf417Png (
  text: string,
  options: RenderPdf417Options = {}
): Promise<Buffer> {
  const payload = text.length > 1800 ? text.slice(0, 1800) : text
  const scale = options.scale ?? 3
  return await new Promise((resolve, reject) => {
    bwipjs.toBuffer(
      {
        bcid: 'pdf417',
        text: payload,
        scale,
        includetext: false,
        eclevel: options.eclevel ?? 4,
        ...(options.columns != null ? { columns: options.columns } : {}),
        ...(options.widthMm != null ? { width: options.widthMm } : {}),
        ...(options.heightMm != null ? { height: options.heightMm } : {}),
      },
      (err: Error | null, png: Buffer) => {
        if (err) reject(err)
        else resolve(png as Buffer)
      }
    )
  })
}

/** AAMVA PDF417 message for insurance ID card (ID + ZN subfiles, VIN in VAD + ZNB). */
export function buildFs20BarcodePayload (p: {
  policyNumber: string
  effectiveMmDdYyyy: string
  expirationMmDdYyyy: string
  vin: string
  vehicleYear: string
  vehicleMake5: string
  /** Full name in uppercase — split into DCS/DAC for AAMVA ID subfile */
  insuredNameUpper: string
  insuredAddressLines: string[]
  /** AAMVA DAQ — customer / document ID (not policy #). */
  daq?: string
  /** Optional 6-digit AAMVA IIN (default New York 636001) */
  iin?: string
}): string {
  return buildAamvaNyInsurancePdf417Payload({
    policyNumber: p.policyNumber,
    effectiveMmDdYyyy: p.effectiveMmDdYyyy,
    expirationMmDdYyyy: p.expirationMmDdYyyy,
    vin: p.vin,
    vehicleYear: p.vehicleYear,
    vehicleMake5: p.vehicleMake5,
    insuredNameUpper: p.insuredNameUpper,
    insuredAddressLines: p.insuredAddressLines,
    daq: p.daq,
    iin: p.iin,
  })
}
