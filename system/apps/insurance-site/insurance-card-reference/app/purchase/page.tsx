'use client'

import { useState } from 'react'
import Link from 'next/link'
import BrandMark from '@/components/BrandMark'
import { PURCHASE_PLANS } from '@/lib/purchase/plans'

export default function PurchasePage () {
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')

  async function startCheckout (planKey: string) {
    setErr('')
    setBusy(planKey)
    try {
      const r = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planKey }),
      })
      const j = (await r.json()) as { ok?: boolean; url?: string; error?: string }
      if (!r.ok || !j.ok || !j.url) {
        setErr(j.error ?? 'Could not start checkout. Is Stripe configured?')
        return
      }
      window.location.href = j.url
    } catch {
      setErr('Network error. Try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <BrandMark href="/" />
          <div className="flex gap-3">
            <Link href="/login" className="text-sm font-semibold text-slate-700">
              Sign in
            </Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-sm font-semibold uppercase tracking-widest text-teal-700">
          Tri State Coverage
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">
          Purchase auto insurance
        </h1>
        <p className="mt-3 text-slate-600">
          Pay securely with card, then enter your driver and vehicle details. You&apos;ll receive
          your proof-of-insurance PDF by email right away.
        </p>

        {err && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {err}
          </div>
        )}

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {PURCHASE_PLANS.map(plan => (
            <div
              key={plan.key}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold text-slate-900">{plan.label}</h2>
                <span className="text-xl font-bold text-teal-800">{plan.priceLabel}</span>
              </div>
              <p className="mt-1 text-sm text-slate-500">{plan.description}</p>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void startCheckout(plan.key)}
                className="mt-6 w-full rounded-xl bg-teal-700 py-3 text-sm font-bold text-white hover:bg-teal-600 disabled:opacity-50"
              >
                {busy === plan.key ? 'Redirecting…' : 'Buy with card'}
              </button>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-slate-500">
          After payment you&apos;ll complete name, address, phone, email, VIN, and color — then tap{' '}
          <strong>Get insured</strong> for your PDF.
        </p>
      </div>
    </div>
  )
}
