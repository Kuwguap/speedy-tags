'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ImageIcon,
  Loader2Icon,
  SparklesIcon,
  TextCursorInputIcon,
  XIcon,
} from 'lucide-react'
import BrandMark from '@/components/BrandMark'
import type { DecodedVinPayload } from '@/lib/vin/decode-vin'

type SessionOk = {
  ok: true
  sessionId: string
  planKey: string
  planLabel: string
}

type Props = {
  /** “Back to plans” link */
  backHref?: string
}

interface ParsedInfoFields {
  fullName?: string
  addressLine1?: string
  addressLine2?: string
  cityStateZip?: string
  phone?: string
  email?: string
  vin?: string
  vehicleColor?: string
  daq?: string
}

/** Read a File as a `data:image/...;base64,...` URL — needed by the OpenAI vision payload. */
function fileToDataUrl (file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const r = reader.result
      if (typeof r === 'string') resolve(r)
      else reject(new Error('Could not read file.'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Read failed.'))
    reader.readAsDataURL(file)
  })
}

/**
 * Resize + JPEG-recompress a photo client-side so a 5-image batch fits inside
 * Vercel's 4.5 MB body limit. Defaults to a 1800px long-edge / 0.85 quality
 * profile — enough resolution for reliable OCR on driver licenses while keeping
 * each photo well under a megabyte.
 *
 * Falls back to a raw FileReader read if the image cannot be decoded by canvas
 * (e.g. HEIC on browsers without native support).
 */
async function compressImageToDataUrl (
  file: File,
  maxDim = 1800,
  quality = 0.85,
): Promise<string> {
  try {
    const objectUrl = URL.createObjectURL(file)
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image()
        im.onload = () => resolve(im)
        im.onerror = () => reject(new Error('decode'))
        im.src = objectUrl
      })
      const longest = Math.max(img.naturalWidth, img.naturalHeight)
      const ratio = longest > maxDim ? maxDim / longest : 1
      const w = Math.max(1, Math.round(img.naturalWidth * ratio))
      const h = Math.max(1, Math.round(img.naturalHeight * ratio))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas-2d')
      ctx.drawImage(img, 0, 0, w, h)
      return canvas.toDataURL('image/jpeg', quality)
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } catch {
    // HEIC or other formats canvas can't decode — fall back to raw bytes.
    return fileToDataUrl(file)
  }
}

const MAX_CLIENT_PHOTOS = 5

interface SelectedPhoto {
  id: string
  fileName: string
  dataUrl: string
  /** Approximate post-compression byte size, used for the strip's footer total. */
  bytes: number
}

export default function PurchaseSuccessClient ({ backHref = '/purchase' }: Props) {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id') ?? ''
  const testToken = searchParams.get('token') ?? ''

  const [sessionInfo, setSessionInfo] = useState<SessionOk | null>(null)
  const [sessionErr, setSessionErr] = useState('')
  const [loadingSession, setLoadingSession] = useState(true)

  const [fullName, setFullName] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [cityStateZip, setCityStateZip] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [vin, setVin] = useState('')
  const [vehicleColor, setVehicleColor] = useState('')
  const [licenseNumber, setLicenseNumber] = useState('')
  const [vinHint, setVinHint] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<{ policyNumber: string; email: string } | null>(
    null
  )
  const [formErr, setFormErr] = useState('')

  /* AI auto-fill state — text paste + photo upload. */
  const [pasteText, setPasteText] = useState('')
  const [parsing, setParsing] = useState<'idle' | 'text' | 'images'>('idle')
  const [parseInfoMsg, setParseInfoMsg] = useState('')
  const [parseErr, setParseErr] = useState('')
  const [photos, setPhotos] = useState<SelectedPhoto[]>([])
  const [addingPhotos, setAddingPhotos] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  /* VIN auto-decode: cache the last successfully decoded value so we don't fire a
   * fresh request for every keystroke after the 17th. */
  const lastDecodedVinRef = useRef<string>('')

  useEffect(() => {
    if (!sessionId && !testToken) {
      setSessionErr('Missing checkout session. Return to purchase and try again.')
      setLoadingSession(false)
      return
    }
    let cancelled = false
    ;(async () => {
      const q = testToken
        ? `test_token=${encodeURIComponent(testToken)}`
        : `session_id=${encodeURIComponent(sessionId)}`
      const r = await fetch(`/api/purchase/session?${q}`)
      const j = (await r.json()) as SessionOk | { ok: false; error?: string }
      if (cancelled) return
      if (!r.ok || j.ok !== true) {
        const errMsg =
          j.ok === false ? (j.error ?? 'Could not verify payment.') : 'Could not verify payment.'
        setSessionErr(errMsg)
        setLoadingSession(false)
        return
      }
      setSessionInfo(j)
      setLoadingSession(false)
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId, testToken])

  /**
   * Apply AI-parsed fields into the form, but only fill slots the user has
   * NOT typed into yet — so a smart paste / photo never overwrites something
   * the user already corrected by hand.
   */
  function applyParsedFields (fields: ParsedInfoFields): number {
    let filled = 0
    const trySet = (
      value: string | undefined,
      current: string,
      setter: (v: string) => void,
      transform: (v: string) => string = v => v,
    ) => {
      if (!value) return
      if (current.trim() !== '') return
      const next = transform(value.trim())
      if (!next) return
      setter(next)
      filled += 1
    }
    trySet(fields.fullName, fullName, setFullName)
    trySet(fields.addressLine1, addressLine1, setAddressLine1)
    trySet(fields.addressLine2, addressLine2, setAddressLine2)
    trySet(fields.cityStateZip, cityStateZip, setCityStateZip)
    trySet(fields.phone, phone, setPhone, v => v.replace(/\D/g, '').slice(0, 10))
    trySet(fields.email, email, setEmail, v => v.toLowerCase())
    trySet(fields.vin, vin, setVin, v => v.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '').slice(0, 17))
    trySet(fields.vehicleColor, vehicleColor, setVehicleColor)
    trySet(fields.daq, licenseNumber, setLicenseNumber, v =>
      v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 25),
    )
    return filled
  }

  async function parseFromText () {
    setParseErr('')
    setParseInfoMsg('')
    const raw = pasteText.trim()
    if (!raw) {
      setParseErr('Paste some text first.')
      return
    }
    setParsing('text')
    try {
      const r = await fetch('/api/purchase/parse-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
      })
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean
        fields?: ParsedInfoFields
        error?: string
      }
      if (!r.ok || !j.ok || !j.fields) {
        throw new Error(j.error ?? `Parse failed (${r.status}).`)
      }
      const filled = applyParsedFields(j.fields)
      setParseInfoMsg(
        filled > 0
          ? `Filled ${filled} field${filled === 1 ? '' : 's'} from your pasted text.`
          : 'No new fields detected. Already-filled fields were left untouched.',
      )
    } catch (e) {
      setParseErr(e instanceof Error ? e.message : 'Parse failed.')
    } finally {
      setParsing('idle')
    }
  }

  async function addPhotos (files: FileList | File[]) {
    setParseErr('')
    setParseInfoMsg('')
    const incoming = Array.from(files).filter(f => /^image\//.test(f.type))
    if (incoming.length === 0) {
      setParseErr('Choose at least one PNG / JPG / HEIC image.')
      return
    }
    if (photos.length + incoming.length > MAX_CLIENT_PHOTOS) {
      setParseErr(`You can attach at most ${MAX_CLIENT_PHOTOS} photos per parse.`)
      return
    }
    setAddingPhotos(true)
    try {
      const compressed = await Promise.all(
        incoming.map(async file => {
          const dataUrl = await compressImageToDataUrl(file)
          return {
            id:
              typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            fileName: file.name || 'photo.jpg',
            dataUrl,
            bytes: dataUrl.length,
          }
        }),
      )
      setPhotos(prev => [...prev, ...compressed])
    } catch (e) {
      setParseErr(e instanceof Error ? e.message : 'Could not read one of the photos.')
    } finally {
      setAddingPhotos(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function removePhoto (id: string) {
    setPhotos(prev => prev.filter(p => p.id !== id))
    setParseErr('')
  }

  async function parseFromPhotos () {
    setParseErr('')
    setParseInfoMsg('')
    if (photos.length === 0) {
      setParseErr('Add at least one photo first.')
      return
    }
    setParsing('images')
    try {
      const r = await fetch('/api/purchase/parse-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrls: photos.map(p => p.dataUrl) }),
      })
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean
        fields?: ParsedInfoFields
        imageCount?: number
        error?: string
      }
      if (!r.ok || !j.ok || !j.fields) {
        throw new Error(j.error ?? `Parse failed (${r.status}).`)
      }
      const filled = applyParsedFields(j.fields)
      const count = j.imageCount ?? photos.length
      setParseInfoMsg(
        filled > 0
          ? `Filled ${filled} field${filled === 1 ? '' : 's'} from ${count} photo${count === 1 ? '' : 's'}.`
          : 'Nothing readable — try a clearer photo or paste the text instead.',
      )
    } catch (e) {
      setParseErr(e instanceof Error ? e.message : 'Parse failed.')
    } finally {
      setParsing('idle')
    }
  }

  /** True when the string is exactly 17 chars and every char is a valid VIN char. */
  function isFullValidVin (v: string): boolean {
    return /^[A-HJ-NPR-Z0-9]{17}$/.test(v)
  }

  async function decodeVin (target: string) {
    const v = target.trim().toUpperCase()
    if (!isFullValidVin(v)) return
    lastDecodedVinRef.current = v
    setVinHint('Decoding…')
    try {
      const r = await fetch(`/api/vin/decode?vin=${encodeURIComponent(v)}`)
      const j = (await r.json()) as {
        ok?: boolean
        data?: DecodedVinPayload
        error?: string
      }
      if (!r.ok || !j.ok || !j.data) {
        setVinHint(j.error ?? 'Decode failed.')
        return
      }
      setVinHint(`Decoded: ${j.data.suggestedVehicleName}`)
    } catch {
      setVinHint('Network error decoding VIN.')
    }
  }

  /**
   * Auto-decode the moment the VIN field hits a complete 17-char value — works
   * for typing, pasting, and AI-autofill alike (they all flow through `setVin`).
   * Debounced 250 ms so typing the 17th char doesn't race with a backspace.
   */
  useEffect(() => {
    const v = vin.trim().toUpperCase()
    if (!isFullValidVin(v)) {
      // Reset the "last decoded" tracker so editing a complete VIN and re-typing it
      // back to the same value triggers a fresh decode if the user wants one.
      if (v.length < 17) lastDecodedVinRef.current = ''
      return
    }
    if (lastDecodedVinRef.current === v) return
    const timer = setTimeout(() => {
      void decodeVin(v)
    }, 250)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vin])

  async function onSubmit (e: React.FormEvent) {
    e.preventDefault()
    setFormErr('')
    if (!sessionInfo) return
    setSubmitting(true)
    try {
      const r = await fetch('/api/purchase/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionInfo.sessionId,
          fullName,
          addressLine1,
          addressLine2: addressLine2 || undefined,
          cityStateZip,
          phone,
          email,
          vin,
          vehicleColor,
          daq: licenseNumber.trim(),
        }),
      })
      const j = (await r.json()) as {
        ok?: boolean
        policyNumber?: string
        email?: string
        error?: unknown
      }
      if (!r.ok || !j.ok) {
        const msg =
          typeof j.error === 'string'
            ? j.error
            : JSON.stringify(j.error ?? 'Request failed')
        setFormErr(msg)
        return
      }
      setDone({
        policyNumber: j.policyNumber ?? '',
        email: j.email ?? email,
      })
    } catch {
      setFormErr('Network error. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <BrandMark href="/" />
          <Link href={backHref} className="text-sm font-semibold text-teal-800">
            ← Plans
          </Link>
        </div>
      </nav>

      <div className="mx-auto max-w-lg px-4 py-10">
        {loadingSession && (
          <p className="text-center text-slate-600">Verifying payment…</p>
        )}
        {sessionErr && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900">
            <p className="font-semibold">Payment verification failed</p>
            <p className="mt-2 text-sm">{sessionErr}</p>
            <Link
              href={backHref}
              className="mt-4 inline-block text-sm font-semibold text-teal-800 underline"
            >
              Back to purchase
            </Link>
          </div>
        )}

        {done && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950">
            <h1 className="text-xl font-bold">You&apos;re insured</h1>
            <p className="mt-3 text-sm leading-relaxed">
              Policy <strong>{done.policyNumber}</strong> — your NY FS-20 insurance ID card PDF was sent
              to <strong>{done.email}</strong>. Check your inbox (and spam).
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white"
            >
              Back to home
            </Link>
          </div>
        )}

        {!loadingSession && !sessionErr && sessionInfo && !done && (
          <>
            <h1 className="text-2xl font-bold text-slate-900">Driver &amp; vehicle</h1>
            <p className="mt-2 text-sm text-slate-600">
              Payment received. Complete the details below — we&apos;ll email your proof of
              insurance PDF immediately.
            </p>
            <p className="mt-3 rounded-lg border border-teal-100 bg-teal-50/80 px-3 py-2 text-xs font-medium text-teal-900">
              Policy period: {sessionInfo.planLabel}
            </p>

            {/* ── AI auto-fill (text paste + photo) ──────────────────────────── */}
            <section className="mt-6 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-violet-900">
                <SparklesIcon className="size-4" />
                Auto-fill with AI
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-violet-900/80">
                Paste text from your driver&apos;s license, insurance card, or vehicle registration —
                or upload a clear photo of it — and we&apos;ll fill the form. Filled fields are
                never overwritten, so you can mix and match.
              </p>

              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                rows={4}
                placeholder={
                  'Joseph C Mcrae JR\n18 Woodshore E\nKeyport, NJ 07735\n201-555-0199\nVIN WBAJA7C59JG909541\nGray\nDL 437366609'
                }
                className="mt-3 w-full rounded-md border border-violet-300 bg-white px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-800 shadow-inner focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"
              />

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void parseFromText()}
                  disabled={parsing !== 'idle' || !pasteText.trim()}
                  className="inline-flex items-center gap-2 rounded-md border border-violet-300 bg-white px-3 py-2 text-sm font-medium text-violet-900 hover:bg-violet-50 disabled:opacity-50"
                >
                  {parsing === 'text' ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <TextCursorInputIcon className="size-4" />
                  )}
                  {parsing === 'text' ? 'Parsing…' : 'Smart fill from text'}
                </button>

                <label
                  className={[
                    'inline-flex items-center gap-2 rounded-md border border-violet-300 bg-white px-3 py-2 text-sm font-medium text-violet-900 transition',
                    parsing !== 'idle' || addingPhotos || photos.length >= MAX_CLIENT_PHOTOS
                      ? 'cursor-not-allowed opacity-50'
                      : 'cursor-pointer hover:bg-violet-50',
                  ].join(' ')}
                  title={
                    photos.length >= MAX_CLIENT_PHOTOS
                      ? `Up to ${MAX_CLIENT_PHOTOS} photos per parse.`
                      : 'Add one or more photos (license front/back, insurance card, registration).'
                  }
                >
                  {addingPhotos ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <ImageIcon className="size-4" />
                  )}
                  {addingPhotos
                    ? 'Compressing…'
                    : photos.length === 0
                      ? 'Add photo(s)'
                      : `Add more (${photos.length}/${MAX_CLIENT_PHOTOS})`}
                  {/* No `capture` attribute — iOS would otherwise jump straight
                   * to the camera. Omitting it lets the OS show its native
                   * action sheet: Take Photo / Photo Library / Choose Files. */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    disabled={parsing !== 'idle' || addingPhotos || photos.length >= MAX_CLIENT_PHOTOS}
                    onChange={e => {
                      const list = e.target.files
                      if (list && list.length > 0) void addPhotos(list)
                    }}
                  />
                </label>

                {pasteText.trim() ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPasteText('')
                      setParseInfoMsg('')
                      setParseErr('')
                    }}
                    className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-violet-900/70 hover:bg-violet-100 hover:text-violet-900"
                    title="Clear pasted text"
                  >
                    <XIcon className="size-3.5" />
                    Clear
                  </button>
                ) : null}
              </div>

              {photos.length > 0 ? (
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {photos.map(p => (
                      <div
                        key={p.id}
                        className="group relative aspect-square overflow-hidden rounded-md border border-violet-200 bg-white shadow-sm"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.dataUrl}
                          alt={p.fileName}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removePhoto(p.id)}
                          disabled={parsing !== 'idle'}
                          aria-label={`Remove ${p.fileName}`}
                          className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-full bg-slate-900/70 text-white opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <XIcon className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void parseFromPhotos()}
                      disabled={parsing !== 'idle' || addingPhotos}
                      className="inline-flex items-center gap-2 rounded-md bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50"
                    >
                      {parsing === 'images' ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        <SparklesIcon className="size-4" />
                      )}
                      {parsing === 'images'
                        ? `Reading ${photos.length} photo${photos.length === 1 ? '' : 's'}…`
                        : `Auto-fill from ${photos.length} photo${photos.length === 1 ? '' : 's'}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPhotos([])
                        setParseErr('')
                        setParseInfoMsg('')
                      }}
                      disabled={parsing !== 'idle'}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-violet-900/70 hover:bg-violet-100 hover:text-violet-900 disabled:opacity-50"
                    >
                      <XIcon className="size-3.5" />
                      Clear photos
                    </button>
                  </div>
                </div>
              ) : null}

              {parseInfoMsg && (
                <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  {parseInfoMsg}
                </p>
              )}
              {parseErr && (
                <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                  {parseErr}
                </p>
              )}
            </section>

            <form onSubmit={e => void onSubmit(e)} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500">
                  Full name
                </label>
                <input
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500">
                  Street address
                </label>
                <input
                  required
                  value={addressLine1}
                  onChange={e => setAddressLine1(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500">
                  Apt / suite (optional)
                </label>
                <input
                  value={addressLine2}
                  onChange={e => setAddressLine2(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500">
                  City, ST ZIP
                </label>
                <input
                  required
                  value={cityStateZip}
                  onChange={e => setCityStateZip(e.target.value)}
                  placeholder="Jersey City, NJ 07304"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500">
                  Phone
                </label>
                <input
                  required
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500">
                  Email (PDF sent here)
                </label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500">
                  Driver license number
                </label>
                <input
                  required
                  value={licenseNumber}
                  onChange={e =>
                    setLicenseNumber(
                      e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                    )
                  }
                  placeholder="e.g. 437366609"
                  maxLength={25}
                  inputMode="text"
                  autoComplete="off"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Encoded as AAMVA <code className="font-mono">DAQ</code> in the
                  PDF417 on your NY FS-20 card. Not your policy number.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500">
                  VIN (17 characters)
                </label>
                <input
                  required
                  value={vin}
                  onChange={e =>
                    setVin(
                      e.target.value
                        .toUpperCase()
                        .replace(/[^A-HJ-NPR-Z0-9]/g, '')
                        .slice(0, 17),
                    )
                  }
                  maxLength={17}
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="17-character VIN (auto-decodes)"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase"
                />
                {vinHint && (
                  <p className="mt-1 text-xs text-slate-600">{vinHint}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500">
                  Vehicle color
                </label>
                <input
                  required
                  value={vehicleColor}
                  onChange={e => setVehicleColor(e.target.value)}
                  placeholder="e.g. Red"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>

              {formErr && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {formErr}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-teal-700 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-sm hover:bg-teal-600 disabled:opacity-60"
              >
                {submitting ? 'Sending…' : 'GET INSURED'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
