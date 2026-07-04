'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
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
  const [daq, setDaq] = useState('000000000')
  const [vinHint, setVinHint] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<{ policyNumber: string; email: string } | null>(
    null
  )
  const [formErr, setFormErr] = useState('')

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

  async function decodeVin () {
    setVinHint('')
    const v = vin.trim()
    if (v.length < 17) {
      setVinHint('Enter a 17-character VIN to decode.')
      return
    }
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
          daq: daq.trim() || undefined,
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

            <form onSubmit={e => void onSubmit(e)} className="mt-8 space-y-4">
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
                  DAQ (AAMVA customer / document ID)
                </label>
                <input
                  value={daq}
                  onChange={e => setDaq(e.target.value)}
                  placeholder="e.g. NY driver license number"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Not your policy number. Leave as zeros if unknown — barcode still encodes a valid placeholder.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500">
                  VIN (17 characters)
                </label>
                <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                  <input
                    required
                    value={vin}
                    onChange={e => setVin(e.target.value.toUpperCase())}
                    maxLength={17}
                    className="w-full flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase"
                  />
                  <button
                    type="button"
                    onClick={() => void decodeVin()}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800"
                  >
                    Decode VIN
                  </button>
                </div>
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
