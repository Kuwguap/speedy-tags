/**
 * Track current transformation matrix (CTM) so we can resolve relative
 * coordinates in `constructPath` to absolute page coordinates.
 */
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs')

const opNameByCode = {}
for (const [name, code] of Object.entries(pdfjs.OPS)) opNameByCode[code] = name

const data = await fs.readFile('C:\\Users\\tatia\\Downloads\\b_H821T7ehlpo\\Policy #_ 2035252790.pdf')
const doc = await pdfjs.getDocument({ data: new Uint8Array(data), disableFontFace: true }).promise
const page = await doc.getPage(1)
const ops = await page.getOperatorList()

// CTM stack
let ctm = [1, 0, 0, 1, 0, 0] // identity
const stack = []

function mul (m1, m2) {
  // PDF ctm convention: 6-element [a, b, c, d, e, f]; new = m2 * m1
  const [a1, b1, c1, d1, e1, f1] = m1
  const [a2, b2, c2, d2, e2, f2] = m2
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ]
}

function transform (ctm, x, y) {
  const [a, b, c, d, e, f] = ctm
  return [a * x + c * y + e, b * x + d * y + f]
}

const interesting = []

for (let i = 0; i < ops.fnArray.length; i++) {
  const code = ops.fnArray[i]
  const name = opNameByCode[code] || String(code)
  const args = ops.argsArray[i]
  if (name === 'save') stack.push(ctm.slice())
  else if (name === 'restore') ctm = stack.pop() ?? ctm
  else if (name === 'transform') ctm = mul(ctm, args)
  else if (name === 'constructPath') {
    // args = [opCodes[], coords[], minMaxBBox[]]
    const subOps = args[0]
    const coords = args[1]
    let nextAction = null
    for (let j = i + 1; j < Math.min(i + 6, ops.fnArray.length); j++) {
      const n = opNameByCode[ops.fnArray[j]] || String(ops.fnArray[j])
      if (['fill', 'stroke', 'fillStroke', 'closeStroke', 'closeFillStroke', 'eoFill'].includes(n)) {
        nextAction = n
        break
      }
    }
    if (!nextAction) continue
    // walk path operators to extract points; subOps are pdfjs OPS codes
    let cx = 0, cy = 0
    let pts = []
    let k = 0
    for (const sub of subOps) {
      const opName = opNameByCode[sub] || String(sub)
      if (opName === 'rectangle') {
        const x = coords[k++]
        const y = coords[k++]
        const w = coords[k++]
        const h = coords[k++]
        const [tx, ty] = transform(ctm, x, y)
        const [tw, th] = transform(ctm, x + w, y + h)
        pts.push({ kind: 'rect', x: tx, y: ty, w: tw - tx, h: th - ty })
        cx = x + w
        cy = y + h
      } else if (opName === 'moveTo') {
        cx = coords[k++]; cy = coords[k++]
        const [tx, ty] = transform(ctm, cx, cy)
        pts.push({ kind: 'move', x: tx, y: ty })
      } else if (opName === 'lineTo') {
        cx = coords[k++]; cy = coords[k++]
        const [tx, ty] = transform(ctm, cx, cy)
        pts.push({ kind: 'line', x: tx, y: ty })
      } else if (opName === 'curveTo') {
        k += 6
      } else if (opName === 'closePath') {
        // no coords
      }
    }
    interesting.push({ i, action: nextAction, pts })
  }
}

// Print non-text rectangles & line segments (likely card borders, value-box corners, underlines)
for (const item of interesting) {
  if (item.pts.length === 0) continue
  // Compute bbox
  const xs = item.pts.flatMap(p => p.x != null ? [p.x] : [])
  const ys = item.pts.flatMap(p => p.y != null ? [p.y] : [])
  if (xs.length === 0) continue
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const w = maxX - minX
  const h = maxY - minY
  // Skip noisy single-point text-fill rects (those are tiny per-text fills already known)
  const isStroke = item.action === 'stroke' || item.action === 'fillStroke' || item.action === 'closeStroke'
  const isLargeRect = item.pts[0]?.kind === 'rect' && (item.pts[0].w > 100 || item.pts[0].h > 30)
  if (!isStroke && !isLargeRect) continue
  console.log(
    `op=${item.i.toString().padStart(4)} ${item.action.padEnd(11)} ` +
    `bbox=(${minX.toFixed(2)},${minY.toFixed(2)})→(${maxX.toFixed(2)},${maxY.toFixed(2)}) ` +
    `w=${w.toFixed(2)} h=${h.toFixed(2)}  pts=${item.pts.length}`
  )
  if (item.pts.length <= 6) {
    for (const p of item.pts) {
      console.log(`     ${p.kind} (${(p.x ?? 0).toFixed(2)}, ${(p.y ?? 0).toFixed(2)}) ${p.w != null ? `w=${p.w.toFixed(2)} h=${p.h.toFixed(2)}` : ''}`)
    }
  }
}
