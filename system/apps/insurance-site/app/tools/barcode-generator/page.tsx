import type { Metadata } from 'next'
import BarcodeGeneratorClient from './BarcodeGeneratorClient'

export const metadata: Metadata = {
  title: 'AAMVA PDF417 Barcode Generator — Tri State Coverage',
  description:
    'Generate AAMVA-compliant PDF417 barcodes (NY FS-20 card and fax styles), preview them on an uploaded document, and export a composite PDF or PNG.',
}

export default function BarcodeGeneratorPage () {
  return <BarcodeGeneratorClient />
}
