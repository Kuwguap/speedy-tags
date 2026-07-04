import fs from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs')

const opNameByCode = {}
for (const [name, code] of Object.entries(pdfjs.OPS)) opNameByCode[code] = name

const file = process.argv[2]
if (!file) { console.error('usage: node extract-paths-of.mjs <file>'); process.exit(1) }

const data = await fs.readFile(file)
const doc = await pdfjs.getDocument({ data: new Uint8Array(data), disableFontFace: true }).promise
const page = await doc.getPage(1)
const ops = await page.getOperatorList()

let ctm = [1,0,0,1,0,0]; const stack = []
function mul(m1,m2){const[a1,b1,c1,d1,e1,f1]=m1;const[a2,b2,c2,d2,e2,f2]=m2;return[a1*a2+b1*c2,a1*b2+b1*d2,c1*a2+d1*c2,c1*b2+d1*d2,e1*a2+f1*c2+e2,e1*b2+f1*d2+f2]}
function tr(c,x,y){const[a,b,d,e,f,g]=c;return[a*x+d*y+f,b*x+e*y+g]}

for (let i=0;i<ops.fnArray.length;i++) {
  const code=ops.fnArray[i]; const name=opNameByCode[code]||String(code); const args=ops.argsArray[i]
  if (name==='save') stack.push(ctm.slice())
  else if (name==='restore') ctm = stack.pop() ?? ctm
  else if (name==='transform') ctm = mul(ctm, args)
  else if (name==='constructPath') {
    const subOps=args[0]; const coords=args[1]
    let act=null
    for (let j=i+1;j<Math.min(i+6,ops.fnArray.length);j++){const n=opNameByCode[ops.fnArray[j]]||String(ops.fnArray[j]);if(['fill','stroke','fillStroke','closeStroke','closeFillStroke','eoFill'].includes(n)){act=n;break}}
    if (act!=='stroke' && act!=='fillStroke' && act!=='closeStroke') continue
    let pts=[]; let k=0
    for (const sub of subOps) {
      const opName=opNameByCode[sub]||String(sub)
      if (opName==='rectangle') { const x=coords[k++],y=coords[k++],w=coords[k++],h=coords[k++]; const[tx,ty]=tr(ctm,x,y); const[tx2,ty2]=tr(ctm,x+w,y+h); pts.push({x:tx,y:ty}); pts.push({x:tx2,y:ty2}) }
      else if (opName==='moveTo'||opName==='lineTo'){ const x=coords[k++],y=coords[k++]; const[tx,ty]=tr(ctm,x,y); pts.push({x:tx,y:ty}) }
      else if (opName==='curveTo') k+=6
    }
    if (pts.length===0) continue
    const xs=pts.map(p=>p.x); const ys=pts.map(p=>p.y)
    console.log(`${act.padEnd(10)} bbox=(${Math.min(...xs).toFixed(2)},${Math.min(...ys).toFixed(2)})→(${Math.max(...xs).toFixed(2)},${Math.max(...ys).toFixed(2)})  pts=${pts.length}`)
  }
}
