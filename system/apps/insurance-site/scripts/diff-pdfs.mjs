import fs from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs')

async function dump (file) {
  const data = await fs.readFile(file)
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), disableFontFace: true }).promise
  const page = await doc.getPage(1)
  const tc = await page.getTextContent()
  const items = tc.items.filter(it => it.str.trim().length > 0).map(it => ({
    x: Number(it.transform[4].toFixed(2)),
    y: Number(it.transform[5].toFixed(2)),
    s: Number(Math.hypot(it.transform[0], it.transform[1]).toFixed(2)),
    t: it.str.trim(),
  }))
  return items.sort((a, b) => b.y - a.y || a.x - b.x)
}

const ref = await dump('C:\\Users\\tatia\\Downloads\\b_H821T7ehlpo\\Policy #_ 2035252790.pdf')
const gen = await dump('C:\\Users\\tatia\\Downloads\\b_H821T7ehlpo\\barcode-generator-app\\out.pdf')

console.log(`reference items: ${ref.length}`)
console.log(`generated items: ${gen.length}\n`)

console.log('=== REFERENCE ===                            === GENERATED ===')
const max = Math.max(ref.length, gen.length)
for (let i = 0; i < max; i++) {
  const r = ref[i]
  const g = gen[i]
  const rs = r ? `${r.x.toString().padStart(6)},${r.y.toString().padStart(6)} ${('s='+r.s).padStart(7)} ${r.t.slice(0, 38).padEnd(38)}` : ' '.repeat(60)
  const gs = g ? `${g.x.toString().padStart(6)},${g.y.toString().padStart(6)} ${('s='+g.s).padStart(7)} ${g.t.slice(0, 38).padEnd(38)}` : ' '.repeat(60)
  const same = r && g && r.x === g.x && r.y === g.y && r.t === g.t ? '✓' : ' '
  console.log(`${same} ${rs} | ${gs}`)
}
