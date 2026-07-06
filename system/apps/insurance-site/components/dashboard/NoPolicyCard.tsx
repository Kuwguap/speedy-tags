'use client'

import Link from 'next/link'

export default function NoPolicyCard () {
  return (
    <section className="surface-card p-6 md:p-8">
      <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">No active policy</h2>
          <p className="mt-1 max-w-xl text-sm text-slate-600">
            You don&apos;t have coverage on file yet. Buy a policy to start tracking your billing,
            documents, and renewal date here.
          </p>
        </div>
        <Link
          href="/purchase"
          className="btn-primary-brand inline-flex items-center justify-center px-5 py-2.5 text-sm"
        >
          Buy insurance
        </Link>
      </div>
    </section>
  )
}
