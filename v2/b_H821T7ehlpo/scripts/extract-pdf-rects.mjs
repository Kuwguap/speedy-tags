import fs from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs')

const data = await fs.readFile('C:\\Users\\tatia\\Downloads\\b_H821T7ehlpo\\Policy #_ 2035252790.pdf')
const doc = await pdfjs.getDocument({
  data: new Uint8Array(data),
  useSystemFonts: false,
  disableFontFace: true,
}).promise

for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p)
  const ops = await page.getOperatorList()
  console.log(`Page ${p}: total ops = ${ops.fnArray.length}`)
  const opNameByCode = {}
  for (const [name, code] of Object.entries(pdfjs.OPS)) opNameByCode[code] = name

  let inPath = false
  for (let i = 0; i < ops.fnArray.length; i++) {
    const code = ops.fnArray[i]
    const name = opNameByCode[code] || String(code)
    const args = ops.argsArray[i]
    if (
      name.includes('Rect') ||
      name === 'rectangle' ||
      name === 'constructPath' ||
      name === 'stroke' ||
      name === 'fill' ||
      name === 'closeStroke' ||
      name === 'closeFillStroke' ||
      name === 'eoFill' ||
      name === 'fillStroke'
    ) {
      console.log(`  ${i}  ${name}  args=${JSON.stringify(args).slice(0, 240)}`)
    }
  }
}
