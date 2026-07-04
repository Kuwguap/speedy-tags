import fs from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs')

const data = await fs.readFile('C:\\Users\\tatia\\Downloads\\b_H821T7ehlpo\\Policy #_ 2035252790.pdf')
const doc = await pdfjs.getDocument({ data: new Uint8Array(data), disableFontFace: true }).promise
const opNameByCode = {}
for (const [name, code] of Object.entries(pdfjs.OPS)) opNameByCode[code] = name

for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p)
  const ops = await page.getOperatorList()
  // Look at constructPath that's followed by a stroke (not just fill)
  for (let i = 0; i < ops.fnArray.length; i++) {
    const code = ops.fnArray[i]
    const name = opNameByCode[code] || String(code)
    if (name === 'constructPath') {
      // see what follows
      let j = i + 1
      let actions = []
      while (j < ops.fnArray.length && j < i + 5) {
        const ncode = ops.fnArray[j]
        const nname = opNameByCode[ncode] || String(ncode)
        if (['fill', 'stroke', 'fillStroke', 'closeStroke', 'closeFillStroke', 'eoFill'].includes(nname)) {
          actions.push(nname)
          break
        }
        j++
      }
      const args = ops.argsArray[i]
      // Filter to only stroke ops or large rects
      if (actions.includes('stroke') || actions.includes('fillStroke') || actions.includes('closeStroke')) {
        console.log(`  ${i}  path → ${actions.join(',')}  args=${JSON.stringify(args).slice(0, 220)}`)
      }
    }
  }
}
