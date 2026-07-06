'use client'

import * as React from 'react'
import {
  DownloadIcon,
  FileImageIcon,
  ImagePlusIcon,
  PlusIcon,
  RefreshCwIcon,
  TrashIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import {
  BARCODE_STYLES,
  type BarcodeStyleId,
} from '@/lib/barcode-generator/presets'
import BarcodeOverlay, { type BarcodePlacement } from '@/components/barcode-generator/BarcodeOverlay'

interface AamvaForm {
  policyNumber: string
  effectiveMmDdYyyy: string
  expirationMmDdYyyy: string
  vin: string
  vehicleYear: string
  vehicleMake5: string
  insuredNameUpper: string
  insuredAddressLines: string
  iin: string
  daq: string
}

const DEFAULT_FORM: AamvaForm = {
  policyNumber: 'ABP6300173880',
  effectiveMmDdYyyy: '05/05/2026',
  expirationMmDdYyyy: '11/05/2026',
  vin: '3N1AB8CV2MY298179',
  vehicleYear: '2021',
  vehicleMake5: 'NISSA',
  insuredNameUpper: 'ROBOTHAM-BABB,N',
  insuredAddressLines: '26 GRANDVIEW TER\nALBANY NY 12202',
  iin: '636001',
  daq: '000000000',
}

interface RenderedSymbol {
  style: BarcodeStyleId
  base64: string
  widthPx: number
  heightPx: number
  payload: string
  payloadPreview: string
  payloadLength: number
}

function uid (): string {
  return Math.random().toString(36).slice(2, 10)
}

async function fetchBarcode (
  form: AamvaForm,
  style: BarcodeStyleId,
): Promise<RenderedSymbol> {
  const res = await fetch('/api/barcode-generator/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      style,
      format: 'json',
      aamva: {
        policyNumber: form.policyNumber,
        effectiveMmDdYyyy: form.effectiveMmDdYyyy,
        expirationMmDdYyyy: form.expirationMmDdYyyy,
        vin: form.vin,
        vehicleYear: form.vehicleYear,
        vehicleMake5: form.vehicleMake5,
        insuredNameUpper: form.insuredNameUpper,
        insuredAddressLines: form.insuredAddressLines.split(/\r?\n/),
        iin: form.iin,
        daq: form.daq,
      },
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Render failed' }))
    throw new Error(err.error ?? 'Render failed')
  }
  const data = (await res.json()) as {
    base64: string
    style: BarcodeStyleId
    widthPx: number
    heightPx: number
    payload: string
    payloadPreview: string
    payloadLength: number
  }
  return data
}

function readFileAsDataUrl (file: File): Promise<{ url: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result as string
      const img = new Image()
      img.onload = () => resolve({ url, width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => reject(new Error('Could not read image'))
      img.src = url
    }
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'))
    reader.readAsDataURL(file)
  })
}

export default function BarcodeGeneratorClient () {
  const [form, setForm] = React.useState<AamvaForm>(DEFAULT_FORM)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [info, setInfo] = React.useState('')

  const [bg, setBg] = React.useState<{ url: string; width: number; height: number } | null>(null)
  const previewRef = React.useRef<HTMLDivElement | null>(null)
  const [previewW, setPreviewW] = React.useState(0)

  const cssScale = React.useMemo(() => {
    if (!bg || previewW <= 0) return 1
    return previewW / bg.width
  }, [bg, previewW])

  React.useEffect(() => {
    if (!previewRef.current) return
    const el = previewRef.current
    const obs = new ResizeObserver(() => setPreviewW(el.clientWidth))
    obs.observe(el)
    setPreviewW(el.clientWidth)
    return () => obs.disconnect()
  }, [bg])

  const [rendered, setRendered] = React.useState<Record<BarcodeStyleId, RenderedSymbol | null>>({
    card: null,
    fax: null,
  })
  const [placements, setPlacements] = React.useState<BarcodePlacement[]>([])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [styleToAdd, setStyleToAdd] = React.useState<BarcodeStyleId>('card')

  const renderAll = React.useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const [card, fax] = await Promise.all([
        fetchBarcode(form, 'card'),
        fetchBarcode(form, 'fax'),
      ])
      setRendered({ card, fax })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Render failed')
    } finally {
      setBusy(false)
    }
  }, [form])

  React.useEffect(() => {
    void renderAll()
  }, [renderAll])

  const addBarcode = (style: BarcodeStyleId) => {
    const preset = BARCODE_STYLES[style]
    const bgW = bg?.width ?? 800
    const bgH = bg?.height ?? 1000
    const w = preset.widthPx
    const h = preset.heightPx
    const xPx = Math.max(0, Math.round((bgW - w) / 2))
    const yPx = Math.max(0, Math.round(bgH - h - Math.min(80, bgH * 0.1)))
    const next: BarcodePlacement = {
      id: uid(),
      style,
      xPx,
      yPx,
      widthPx: w,
      heightPx: h,
    }
    setPlacements(p => [...p, next])
    setSelectedId(next.id)
  }

  const exportComposite = async (output: 'pdf' | 'png') => {
    if (!bg) {
      setError('Upload a background image first.')
      return
    }
    if (placements.length === 0) {
      setError('Add at least one barcode to the canvas.')
      return
    }
    setBusy(true)
    setError('')
    setInfo('')
    try {
      const res = await fetch('/api/barcode-generator/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backgroundDataUrl: bg.url,
          backgroundWidthPx: bg.width,
          backgroundHeightPx: bg.height,
          output,
          aamva: {
            policyNumber: form.policyNumber,
            effectiveMmDdYyyy: form.effectiveMmDdYyyy,
            expirationMmDdYyyy: form.expirationMmDdYyyy,
            vin: form.vin,
            vehicleYear: form.vehicleYear,
            vehicleMake5: form.vehicleMake5,
            insuredNameUpper: form.insuredNameUpper,
            insuredAddressLines: form.insuredAddressLines.split(/\r?\n/),
            iin: form.iin,
            daq: form.daq,
          },
          placements: placements.map(p => ({
            style: p.style,
            xPx: p.xPx,
            yPx: p.yPx,
            widthPx: p.widthPx,
            heightPx: p.heightPx,
          })),
        }),
      })
      if (output === 'pdf') {
        if (!res.ok) throw new Error((await res.json()).error ?? 'Compose failed')
        const blob = await res.blob()
        const u = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = u
        a.download = 'barcode-composite.pdf'
        a.click()
        URL.revokeObjectURL(u)
        setInfo('PDF downloaded.')
      } else {
        if (!res.ok) throw new Error((await res.json()).error ?? 'Compose failed')
        const data = (await res.json()) as {
          backgroundWidthPx: number
          backgroundHeightPx: number
          barcodes: Array<{
            xPx: number
            yPx: number
            widthPx: number
            heightPx: number
            base64: string
          }>
        }
        const canvas = document.createElement('canvas')
        canvas.width = data.backgroundWidthPx
        canvas.height = data.backgroundHeightPx
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Could not get 2D canvas context')
        const bgImg = new Image()
        bgImg.src = bg.url
        await new Promise<void>((resolve, reject) => {
          bgImg.onload = () => resolve()
          bgImg.onerror = () => reject(new Error('Failed to draw background'))
        })
        ctx.drawImage(bgImg, 0, 0, data.backgroundWidthPx, data.backgroundHeightPx)
        for (const b of data.barcodes) {
          const im = new Image()
          im.src = `data:image/png;base64,${b.base64}`
          await new Promise<void>((resolve, reject) => {
            im.onload = () => resolve()
            im.onerror = () => reject(new Error('Failed to draw barcode'))
          })
          ctx.drawImage(im, b.xPx, b.yPx, b.widthPx, b.heightPx)
        }
        const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'))
        if (!blob) throw new Error('Could not export PNG')
        const u = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = u
        a.download = 'barcode-composite.png'
        a.click()
        URL.revokeObjectURL(u)
        setInfo('PNG downloaded.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  const onUpload = async (file: File | null) => {
    if (!file) return
    if (!/^image\/(png|jpe?g)$/i.test(file.type)) {
      setError('Upload a PNG or JPG image. (For PDFs, screenshot or export the page as an image first.)')
      return
    }
    try {
      const next = await readFileAsDataUrl(file)
      setBg(next)
      setPlacements([])
      setSelectedId(null)
      setError('')
      setInfo(`Loaded ${file.name} (${next.width}×${next.height}px)`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load image')
    }
  }

  const updatePlacement = (id: string, next: BarcodePlacement) => {
    setPlacements(p => p.map(it => (it.id === id ? next : it)))
  }
  const removePlacement = (id: string) => {
    setPlacements(p => p.filter(it => it.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          AAMVA PDF417 Barcode Generator
        </h1>
        <p className="text-sm text-muted-foreground">
          Generate AAMVA-compliant PDF417 symbols (card &amp; fax styles), drop them on an uploaded document, then export a composite PDF or PNG.
        </p>
      </header>

      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {info}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="space-y-4 p-4">
          <Tabs defaultValue="data" className="w-full">
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="data">Data</TabsTrigger>
              <TabsTrigger value="payload">AAMVA payload</TabsTrigger>
            </TabsList>

            <TabsContent value="data" className="space-y-3">
              <Field label="Policy Number" v={form.policyNumber} onChange={v => setForm(f => ({ ...f, policyNumber: v }))} />
              <Field
                label="DAQ (customer / document ID)"
                v={form.daq}
                onChange={v => setForm(f => ({ ...f, daq: v }))}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Effective (MM/DD/YYYY)" v={form.effectiveMmDdYyyy} onChange={v => setForm(f => ({ ...f, effectiveMmDdYyyy: v }))} />
                <Field label="Expiration (MM/DD/YYYY)" v={form.expirationMmDdYyyy} onChange={v => setForm(f => ({ ...f, expirationMmDdYyyy: v }))} />
              </div>
              <Field label="VIN (17 chars)" v={form.vin} onChange={v => setForm(f => ({ ...f, vin: v }))} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Year" v={form.vehicleYear} onChange={v => setForm(f => ({ ...f, vehicleYear: v }))} />
                <Field label="Make (5 chars)" v={form.vehicleMake5} onChange={v => setForm(f => ({ ...f, vehicleMake5: v }))} />
              </div>
              <Field label="Insured Name" v={form.insuredNameUpper} onChange={v => setForm(f => ({ ...f, insuredNameUpper: v }))} />
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Insured Address (one line per row)</Label>
                <Textarea
                  rows={3}
                  value={form.insuredAddressLines}
                  onChange={e => setForm(f => ({ ...f, insuredAddressLines: e.target.value }))}
                />
              </div>
              <Field label="IIN (6 digits)" v={form.iin} onChange={v => setForm(f => ({ ...f, iin: v }))} />

              <Button onClick={() => void renderAll()} disabled={busy} variant="outline" className="w-full gap-2">
                <RefreshCwIcon className="size-4" />
                {busy ? 'Rendering…' : 'Re-render barcodes'}
              </Button>
            </TabsContent>

            <TabsContent value="payload" className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Header bytes (LF&nbsp;0x0A · RS&nbsp;0x1E · CR&nbsp;0x0D), `ANSI ` file type, IIN, AAMVA version 10, ID + ZN subfiles, error correction level 4.
              </p>
              <div className="rounded-md border bg-muted/30 p-2 font-mono text-[10px] leading-tight max-h-64 overflow-auto whitespace-pre-wrap break-all">
                {rendered.card?.payloadPreview ?? '—'}
              </div>
              <p className="text-xs text-muted-foreground">
                Length: {rendered.card?.payloadLength ?? 0} chars
              </p>
            </TabsContent>
          </Tabs>
        </Card>

        <Card className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="bg" className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
              <ImagePlusIcon className="size-4" />
              {bg ? 'Replace background' : 'Upload background (PNG/JPG)'}
              <input
                id="bg"
                type="file"
                accept="image/png,image/jpeg"
                hidden
                onChange={e => void onUpload(e.target.files?.[0] ?? null)}
              />
            </Label>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Select value={styleToAdd} onValueChange={v => setStyleToAdd(v as BarcodeStyleId)}>
                <SelectTrigger className="h-8 w-[260px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(BARCODE_STYLES).map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => addBarcode(styleToAdd)} className="gap-1">
                <PlusIcon className="size-4" />
                Add barcode
              </Button>
            </div>
          </div>

          <div
            ref={previewRef}
            className="relative w-full overflow-hidden rounded-md border bg-[radial-gradient(circle_at_1px_1px,#cbd5e1_1px,transparent_0)] [background-size:10px_10px]"
          >
            {bg ? (
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  paddingTop: `${(bg.height / bg.width) * 100}%`,
                }}
              >
                <img
                  src={bg.url}
                  alt="Background document"
                  className="absolute inset-0 h-full w-full object-contain"
                  draggable={false}
                />
                {placements.map(p => (
                  <BarcodeOverlay
                    key={p.id}
                    placement={p}
                    imageUrl={
                      rendered[p.style]
                        ? `data:image/png;base64,${rendered[p.style]!.base64}`
                        : null
                    }
                    cssScale={cssScale}
                    selected={selectedId === p.id}
                    onSelect={() => setSelectedId(p.id)}
                    onChange={next => updatePlacement(p.id, next)}
                    onRemove={() => removePlacement(p.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex aspect-[8.5/11] w-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <FileImageIcon className="size-8 opacity-60" />
                <span>Upload a PNG or JPG to start placing barcodes.</span>
                <span className="text-xs">Tip: For a PDF, screenshot or export the page as PNG first.</span>
              </div>
            )}
          </div>

          {placements.length > 0 ? (
            <div className="rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-2 py-1 text-left">#</th>
                    <th className="px-2 py-1 text-left">Style</th>
                    <th className="px-2 py-1 text-left">X</th>
                    <th className="px-2 py-1 text-left">Y</th>
                    <th className="px-2 py-1 text-left">W</th>
                    <th className="px-2 py-1 text-left">H</th>
                    <th className="px-2 py-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {placements.map((p, i) => (
                    <tr key={p.id} className={selectedId === p.id ? 'bg-blue-50' : ''}>
                      <td className="px-2 py-1">{i + 1}</td>
                      <td className="px-2 py-1">
                        <Select value={p.style} onValueChange={v => updatePlacement(p.id, { ...p, style: v as BarcodeStyleId })}>
                          <SelectTrigger className="h-7 w-[200px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(BARCODE_STYLES).map(s => (
                              <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1"><NumberCell v={p.xPx} onChange={v => updatePlacement(p.id, { ...p, xPx: v })} /></td>
                      <td className="px-2 py-1"><NumberCell v={p.yPx} onChange={v => updatePlacement(p.id, { ...p, yPx: v })} /></td>
                      <td className="px-2 py-1"><NumberCell v={p.widthPx} onChange={v => updatePlacement(p.id, { ...p, widthPx: v })} /></td>
                      <td className="px-2 py-1"><NumberCell v={p.heightPx} onChange={v => updatePlacement(p.id, { ...p, heightPx: v })} /></td>
                      <td className="px-2 py-1 text-right">
                        <Button size="icon-sm" variant="ghost" onClick={() => removePlacement(p.id)} title="Remove">
                          <TrashIcon className="size-4 text-red-600" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button onClick={() => void exportComposite('pdf')} disabled={busy || !bg || placements.length === 0} className="gap-2">
              <DownloadIcon className="size-4" />
              Export PDF
            </Button>
            <Button onClick={() => void exportComposite('png')} disabled={busy || !bg || placements.length === 0} variant="outline" className="gap-2">
              <DownloadIcon className="size-4" />
              Export PNG
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              Drag to move · drag the corner to resize · Shift while resizing for free aspect.
            </span>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Field ({ label, v, onChange }: { label: string; v: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Input value={v} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

function NumberCell ({ v, onChange }: { v: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={Math.round(v)}
      onChange={e => onChange(Number(e.target.value))}
      className="h-7 w-20 rounded border bg-background px-1 text-xs"
    />
  )
}
