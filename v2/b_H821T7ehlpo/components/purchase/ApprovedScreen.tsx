'use client'

import { useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import { CheckCircle2 } from 'lucide-react'

/**
 * Full-bleed celebration screen shown after the QuestionWizard. Fires a
 * `canvas-confetti` shower from the top of the viewport while a 3-second
 * countdown ticks down, then calls `onCountdownComplete` so the parent can
 * kick off the Stripe redirect.
 */

interface ApprovedScreenProps {
  planLabel: string
  countdownSeconds?: number
  onCountdownComplete: () => void
}

export default function ApprovedScreen ({
  planLabel,
  countdownSeconds = 3,
  onCountdownComplete,
}: ApprovedScreenProps) {
  const [remaining, setRemaining] = useState(countdownSeconds)
  const firedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    /* ── confetti shower ─────────────────────────────────────────────── */
    const duration = countdownSeconds * 1000
    const animationEnd = Date.now() + duration
    const defaults: confetti.Options = {
      startVelocity: 38,
      spread: 360,
      ticks: 90,
      zIndex: 60,
      gravity: 0.95,
      scalar: 1,
    }

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now()
      if (timeLeft <= 0) {
        clearInterval(interval)
        return
      }
      const particleCount = 50 * (timeLeft / duration)
      confetti({
        ...defaults,
        particleCount,
        origin: { x: Math.random() * 0.6 + 0.1, y: -0.05 },
        colors: ['#0d9488', '#14b8a6', '#5eead4', '#fde68a', '#f59e0b', '#fbbf24'],
      })
      confetti({
        ...defaults,
        particleCount,
        origin: { x: Math.random() * 0.6 + 0.3, y: -0.05 },
        colors: ['#0d9488', '#14b8a6', '#5eead4', '#fde68a', '#f59e0b', '#fbbf24'],
      })
    }, 200)

    /* ── countdown tick ──────────────────────────────────────────────── */
    const tick = setInterval(() => {
      setRemaining(prev => {
        if (cancelled) return prev
        if (prev <= 1) {
          clearInterval(tick)
          if (!firedRef.current) {
            firedRef.current = true
            onCountdownComplete()
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      cancelled = true
      clearInterval(interval)
      clearInterval(tick)
    }
  }, [countdownSeconds, onCountdownComplete])

  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center px-4 py-12">
      <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-teal-200 bg-gradient-to-b from-white to-teal-50/60 p-10 text-center shadow-xl shadow-teal-900/10">
        <div className="mx-auto inline-flex size-20 items-center justify-center rounded-full bg-teal-100 text-teal-700 ring-4 ring-teal-200/70">
          <CheckCircle2 className="size-12" strokeWidth={2.25} />
        </div>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Congratulations <span aria-hidden>🎉</span>
        </h1>
        <p className="mt-2 text-lg font-semibold text-teal-800">You’re approved!</p>

        <p className="mt-6 text-sm text-slate-600">
          We’ve approved your <span className="font-semibold text-slate-900">{planLabel}</span> auto
          policy. Routing you to secure payment in…
        </p>

        <div
          aria-live="polite"
          className="mx-auto mt-4 flex size-24 items-center justify-center rounded-full bg-white text-5xl font-bold text-teal-700 shadow-lg shadow-teal-900/10 ring-1 ring-teal-200"
        >
          {remaining > 0 ? remaining : 'Go!'}
        </div>

        <p className="mt-6 text-xs text-slate-500">
          Do not refresh — Stripe Checkout will open automatically.
        </p>
      </div>
    </div>
  )
}
