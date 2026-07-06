'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import BrandMark from '@/components/BrandMark'
import { PURCHASE_PLANS, getPlan } from '@/lib/purchase/plans'
import QuestionWizard, {
  type QuestionAnswers,
} from '@/components/purchase/QuestionWizard'
import ApprovedScreen from '@/components/purchase/ApprovedScreen'

type Stage =
  | { kind: 'plans' }
  | { kind: 'questions'; planKey: string }
  | { kind: 'approved'; planKey: string; answers: QuestionAnswers }

export default function TestPurchasePage () {
  const [stage, setStage] = useState<Stage>({ kind: 'plans' })
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const startDummyCheckout = useCallback(
    async (planKey: string, answers: QuestionAnswers) => {
      setErr('')
      setBusy(planKey)
      try {
        const r = await fetch('/api/purchase/test-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planKey, prequalAnswers: answers }),
        })
        const j = (await r.json()) as { ok?: boolean; url?: string; error?: string }
        if (!r.ok || !j.ok || !j.url) {
          setErr(
            j.error ??
              'Test checkout unavailable. Ensure STRIPE_SECRET_KEY or TEST_PURCHASE_SIGNING_SECRET is set.'
          )
          setStage({ kind: 'plans' })
          return
        }
        window.location.href = j.url
      } catch {
        setErr('Network error. Try again.')
        setStage({ kind: 'plans' })
      } finally {
        setBusy(null)
      }
    },
    []
  )

  const planLabel = (() => {
    if (stage.kind === 'plans') return ''
    return getPlan(stage.planKey)?.label ?? stage.planKey
  })()

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="sticky top-0 z-50 border-b border-amber-200/80 bg-amber-50/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <BrandMark href="/" />
          <div className="flex gap-3">
            <Link href="/purchase" className="text-sm font-semibold text-slate-700">
              Live checkout
            </Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-3xl px-4 py-12">
        {stage.kind === 'plans' ? (
          <>
            <p className="text-sm font-semibold uppercase tracking-widest text-amber-800">
              Internal test — dummy payment
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">
              Purchase auto insurance (test)
            </h1>
            <p className="mt-3 text-slate-600">
              <strong>No card charge.</strong> Same steps as production: pick a plan → driver &amp; vehicle
              form → <strong>GET INSURED</strong> sends a <strong>real</strong> email with a{' '}
              <strong>real</strong> NY FS-20 insurance ID PDF (AAMVA PDF417, Resend + NHTSA VIN decode).
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
                  className="flex flex-col rounded-2xl border border-amber-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-lg font-bold text-slate-900">{plan.label}</h2>
                    <span className="text-xl font-bold text-teal-800">{plan.priceLabel}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{plan.description}</p>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      setErr('')
                      setStage({ kind: 'questions', planKey: plan.key })
                    }}
                    className="mt-6 w-full rounded-xl bg-amber-600 py-3 text-sm font-bold text-white hover:bg-amber-500 disabled:opacity-50"
                  >
                    Continue (dummy pay)
                  </button>
                </div>
              ))}
            </div>

            <p className="mt-10 text-center text-xs text-slate-500">
              Do not link this URL from the public site. Tokens expire in about an hour.
            </p>
          </>
        ) : null}

        {stage.kind === 'questions' ? (
          <QuestionWizard
            onCancel={() => setStage({ kind: 'plans' })}
            onComplete={answers =>
              setStage({ kind: 'approved', planKey: stage.planKey, answers })
            }
          />
        ) : null}

        {stage.kind === 'approved' ? (
          <ApprovedScreen
            planLabel={planLabel}
            countdownSeconds={3}
            onCountdownComplete={() => {
              void startDummyCheckout(stage.planKey, stage.answers)
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
