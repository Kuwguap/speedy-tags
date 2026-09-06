import fs from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs')

const data = await fs.readFile('C:\\Users\\tatia\\Downloads\\b_H821T7ehlpo\\Policy #_ 2035252790.pdf')
const loadingTask = pdfjs.getDocument({
  data: new Uint8Array(data),
  useSystemFonts: false,
  disableFontFace: true,
})
const doc = await loadingTask.promise
console.log(`pages: ${doc.numPages}`)

for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p)
  const viewport = page.getViewport({ scale: 1 })
  console.log(`\n=== PAGE ${p}  size: ${viewport.width.toFixed(1)} x ${viewport.height.toFixed(1)} pts ===`)
  const text = await page.getTextContent()
  for (const item of text.items) {
    const tx = item.transform
    const x = tx[4]
    const y = tx[5]
    const fontSize = Math.hypot(tx[0], tx[1])
    const w = item.width
    const h = item.height
    const fname = item.fontName || ''
    const t = item.str.replace(/\n/g, '\\n')
    console.log(
      `x=${x.toFixed(1).padStart(6)} y=${y.toFixed(1).padStart(6)} ` +
      `w=${w.toFixed(1).padStart(5)} h=${h.toFixed(1).padStart(5)} ` +
      `size=${fontSize.toFixed(2).padStart(5)} font=${fname.padEnd(8)} | ${t}`
    )
  }
}
