/**
 * Barcode-generator presets shared by API + UI.
 *
 * Two PDF417 styles match the NY FS-20 insurance card output:
 * - `card`: ~3 in × 0.75 in (4:1 aspect, scale 2). Used for the duplicate ID strips.
 * - `fax`: taller "fax-friendly" symbol (~4.4 in × 1.7 in, scale 3). Same data, more redundancy.
 *
 * What scanners actually care about is the X-dimension (narrowest module width). The
 * pixel/point sizes here are layout targets at 96 DPI; bwip-js fits the symbol with
 * square modules inside the requested mm box.
 */

export type BarcodeStyleId = 'card' | 'fax'

export interface BarcodeStylePreset {
  id: BarcodeStyleId
  label: string
  /** Layout width (CSS px @ 96 DPI). */
  widthPx: number
  /** Layout height (CSS px @ 96 DPI). */
  heightPx: number
  /** Suggested module scale passed to bwip-js. */
  scale: number
  /** Suggested PDF417 column count. */
  columns: number
  /** Short description shown in UI. */
  description: string
}

export const BARCODE_STYLES: Record<BarcodeStyleId, BarcodeStylePreset> = {
  card: {
    id: 'card',
    label: 'Card (3:1, ~3in × 0.75in)',
    widthPx: 288,
    heightPx: 72,
    scale: 2,
    columns: 10,
    description:
      'Standard FS-20 ID card strip. Used for the two duplicate barcodes printed on each insurance card.',
  },
  fax: {
    id: 'fax',
    label: 'Fax (taller, ~4.4in × 1.7in)',
    widthPx: 422,
    heightPx: 162,
    scale: 3,
    columns: 12,
    description:
      'Fax-friendly larger symbol with extra row height for low-quality scans (same data as card barcodes).',
  },
}

export function getBarcodeStyle (id: string | null | undefined): BarcodeStylePreset {
  if (id === 'fax') return BARCODE_STYLES.fax
  return BARCODE_STYLES.card
}

/** CSS px @ 96 DPI → millimeters (BWIPP `width`/`height`). */
export function pxToMm (px: number): number {
  return (px * 25.4) / 96
}

/** CSS px @ 96 DPI → PDF points (72 dpi). */
export function pxToPt (px: number): number {
  return (px * 72) / 96
}
