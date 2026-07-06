'use client'

import { useState } from 'react'
import type { DashboardInvoice, DashboardPolicy } from '@/lib/supabase/dashboard-data'

function dollarLabel (cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`
}

function dateLabel (iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

type Props = {
  policy: DashboardPolicy
  openInvoice: DashboardInvoice | null
  /** Sum of every unpaid invoice — shown as the balance when > 0. */
  openInvoicesTotalCents?: number
  /** How many unpaid invoices are on the account (for multi-car copy). */
  openInvoicesCount?: number
  /**
   * When no invoice rows exist yet (legacy bot accounts), fall back to this
   * estimated monthly total so the card never shows $0.00.
   */
  fallbackMonthlyPremiumCents?: number
}

export default function BalanceDueCard ({
  policy,
  openInvoice,
  openInvoicesTotalCents = 0,
  openInvoicesCount = 0,
  fallbackMonthlyPremiumCents,
}: Props) {
  const [busy, setBusy] = useState<'pay' | 'autopay' | null>(null)
  const [err, setErr] = useState('')

  const autopay = policy.autopayEnabled
  const hasInvoiceTotal = openInvoicesTotalCents > 0
  const usingFallback =
    !hasInvoiceTotal && (fallbackMonthlyPremiumCents ?? 0) > 0
  const balanceCents = hasInvoiceTotal
    ? openInvoicesTotalCents
    : usingFallback
      ? (fallbackMonthlyPremiumCents ?? 0)
      : (openInvoice?.amountCents ?? 0)
  const hasBalance = balanceCents > 0
  const multiInvoice = openInvoicesCount > 1

  async function handlePayNow () {
    setErr('')
    setBusy('pay')
    try {
      const r = await fetch('/api/billing/pay-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(openInvoice ? { invoiceId: openInvoice.id } : {}),
      })
      const j = (await r.json()) as { ok?: boolean; url?: string; error?: string }
      if (!r.ok || !j.ok || !j.url) {
        setErr(j.error ?? 'Could not start payment.')
        return
      }
      window.location.href = j.url
    } catch {
      setErr('Network error. Try again.')
    } finally {
      setBusy(null)
    }
  }

  async function handleAutopay () {
    setErr('')
    setBusy('autopay')
    try {
      const r = await fetch('/api/billing/autopay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policyId: policy.id,
          action: autopay ? 'disable' : 'enable',
        }),
      })
      const j = (await r.json()) as {
        ok?: boolean
        url?: string
        autopay?: boolean
        error?: string
      }
      if (!r.ok || !j.ok) {
        setErr(j.error ?? 'Could not update AutoPay.')
        return
      }
      if (j.url) {
        window.location.href = j.url
        return
      }
      window.location.reload()
    } catch {
      setErr('Network error. Try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="surface-card overflow-hidden p-0">
      <div className="bg-gradient-to-br from-teal-700 via-teal-800 to-slate-900 px-4 py-6 text-white sm:px-6 md:px-8 md:py-7">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-teal-200">
          {usingFallback ? 'Estimated monthly total' : 'Balance due'}
        </p>
        <p className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
          {dollarLabel(balanceCents)}
        </p>
        {hasInvoiceTotal && openInvoice && (
          <p className="mt-2 text-sm text-teal-100">
            {multiInvoice
              ? `${openInvoicesCount} invoices due · oldest: ${dateLabel(openInvoice.dueDateIso)}`
              : `Due ${dateLabel(openInvoice.dueDateIso)} · ${openInvoice.periodLabel}`}
          </p>
        )}
        {usingFallback && (
          <p className="mt-2 text-sm text-teal-100">
            Combined premium across every active policy. Pay Now will activate
            once an invoice is generated for this account.
          </p>
        )}
        {!hasBalance && (
          <p className="mt-2 text-sm text-teal-100">
            You&apos;re all caught up. {autopay ? 'AutoPay handles your next charge.' : 'No payments due right now.'}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 md:px-8">
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          <button
            type="button"
            disabled={!hasBalance || usingFallback || busy !== null}
            onClick={() => void handlePayNow()}
            className="btn-touch btn-primary-brand w-full gap-2 sm:w-auto disabled:cursor-not-allowed disabled:opacity-50"
            title={
              usingFallback
                ? 'No invoice generated yet — enable AutoPay or wait for the next billing cycle.'
                : undefined
            }
          >
            <span aria-hidden>💳</span>
            {busy === 'pay' ? 'Redirecting…' : 'Pay Now'}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void handleAutopay()}
            className={`btn-touch w-full gap-2 sm:w-auto ${
              autopay
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
            } rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <span aria-hidden>🔄</span>
            {busy === 'autopay'
              ? 'Updating…'
              : autopay
                ? 'AutoPay enabled — Disable'
                : 'Enable AutoPay'}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Payments are processed securely via Stripe.
        </p>
      </div>

      {err && (
        <div className="mx-6 mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 md:mx-8">
          {err}
        </div>
      )}
    </section>
  )
}
