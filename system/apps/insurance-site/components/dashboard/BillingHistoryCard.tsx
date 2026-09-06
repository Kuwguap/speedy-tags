'use client'

import type { DashboardInvoice } from '@/lib/supabase/dashboard-data'

function dollarLabel (cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`
}

function dateLabel (iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function statusChip (status: DashboardInvoice['status']) {
  switch (status) {
    case 'paid':
      return { label: 'Paid', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: '✓' }
    case 'due':
      return { label: 'Due', cls: 'bg-amber-50 text-amber-800 ring-amber-200', icon: '•' }
    case 'pending':
      return { label: 'Processing', cls: 'bg-sky-50 text-sky-800 ring-sky-200', icon: '…' }
    case 'failed':
      return { label: 'Failed', cls: 'bg-red-50 text-red-700 ring-red-200', icon: '!' }
    case 'refunded':
      return { label: 'Refunded', cls: 'bg-slate-100 text-slate-700 ring-slate-200', icon: '↺' }
    case 'void':
      return { label: 'Void', cls: 'bg-slate-100 text-slate-600 ring-slate-200', icon: '-' }
  }
}

export default function BillingHistoryCard ({ invoices }: { invoices: DashboardInvoice[] }) {
  return (
    <section className="surface-card p-6 md:p-8">
      <h2 className="text-lg font-semibold text-slate-900">Billing history</h2>
      <p className="mt-1 text-sm text-slate-500">
        Every charge attempt against your policy — synced from Stripe.
      </p>

      {invoices.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          No invoices yet. Your billing history will appear here once your first payment posts.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-100">
          {invoices.map(inv => {
            const chip = statusChip(inv.status)
            return (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-4 py-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{inv.periodLabel}</p>
                  <p className="text-xs text-slate-500">
                    {inv.status === 'paid' && inv.paidAtIso
                      ? `Paid ${dateLabel(inv.paidAtIso)}`
                      : `Due ${dateLabel(inv.dueDateIso)}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${chip.cls}`}
                  >
                    <span aria-hidden>{chip.icon}</span>
                    {chip.label}
                  </span>
                  <span className="font-semibold text-slate-900">
                    {dollarLabel(inv.amountCents)}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
