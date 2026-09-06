'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import Link from 'next/link'
import BrandMark from '@/components/BrandMark'

export default function Home() {
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (user) {
      router.push('/dashboard')
    }
  }, [user, router])

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <BrandMark href="/" />
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="btn-primary-brand px-6 py-2.5 text-sm"
            >
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-teal-900 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage: `radial-gradient(at 20% 30%, rgba(45, 212, 191, 0.25) 0px, transparent 50%),
              radial-gradient(at 80% 20%, rgba(59, 130, 246, 0.2) 0px, transparent 45%),
              radial-gradient(at 50% 80%, rgba(16, 185, 129, 0.15) 0px, transparent 50%)`,
          }}
        />
        <div className="relative mx-auto max-w-7xl px-4 py-24 md:py-32">
          <div className="max-w-2xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-teal-300/90">
              NJ Coverage
            </p>
            <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight md:text-6xl">
              Your insurance, organized in one place
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-slate-300 md:text-xl">
              View policies, coverage, and vehicle details in a clear, secure dashboard—built
              for policy holders across the tri-state region. <strong className="text-white">You can also purchase
              auto insurance online</strong> and receive your proof-of-insurance PDF by email.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
              <Link
                href="/purchase"
                className="inline-flex items-center justify-center rounded-xl bg-teal-400 px-8 py-4 text-center text-sm font-bold uppercase tracking-wide text-slate-950 shadow-lg shadow-teal-950/30 transition hover:bg-teal-300"
              >
                Purchase auto insurance
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl bg-white px-8 py-4 text-center text-sm font-semibold text-slate-900 shadow-lg shadow-slate-900/20 transition hover:bg-teal-50"
              >
                Sign in to your account
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 px-8 py-4 text-center text-sm font-semibold text-white backdrop-blur transition hover:bg-white/10"
              >
                Create an account
              </Link>
            </div>
            <p className="mt-6 max-w-xl text-sm text-slate-400">
              Plans: <span className="text-slate-200">1 mo $100</span> ·{' '}
              <span className="text-slate-200">6 mo $500</span> ·{' '}
              <span className="text-slate-200">12 mo $900</span> ·{' '}
              <span className="text-slate-200">$100/mo recurring</span>
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200/80 bg-white py-16">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">
            Buy auto insurance online
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-600">
            Pay by card, add your driver and vehicle details, and get your insurance ID card PDF
            emailed instantly — same layout as a New York insurance identification card.
          </p>
          <Link
            href="/purchase"
            className="mt-8 inline-flex rounded-xl bg-teal-700 px-10 py-4 text-sm font-bold uppercase tracking-wide text-white shadow-md hover:bg-teal-600"
          >
            Purchase auto insurance
          </Link>
        </div>
      </section>

      <section className="border-b border-slate-200/80 py-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              Everything in one dashboard
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-600">
              Less paperwork, more clarity—see what matters at a glance.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                title: 'Personal profile',
                desc: 'Your contact details, member status, and account information in one place.',
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                ),
              },
              {
                title: 'Vehicle & policy',
                desc: 'VIN, policy number, and premium details—always up to date.',
                icon: (
                  <>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                    />
                  </>
                ),
              },
              {
                title: 'Coverage clarity',
                desc: 'Understand liability, collision, comprehensive, and add-ons without the jargon.',
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                ),
              },
            ].map((item, i) => (
              <div
                key={i}
                className="surface-card group p-8 transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-900/10"
              >
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500/15 to-emerald-600/10 ring-1 ring-teal-600/10">
                  <svg
                    className="h-7 w-7 text-teal-700"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    {item.icon}
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-3 leading-relaxed text-slate-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              Coverage options we support
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-600">
              From liability to roadside assistance—track what&apos;s included on your policy.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                title: 'Liability coverage',
                desc: 'Damages you cause to others’ vehicles and property.',
              },
              {
                title: 'Collision coverage',
                desc: 'Damage to your vehicle from collisions.',
              },
              {
                title: 'Comprehensive coverage',
                desc: 'Theft, weather, vandalism, and non-collision losses.',
              },
              {
                title: 'Uninsured motorist',
                desc: 'Protection when the other driver has little or no insurance.',
              },
              {
                title: 'Medical payments',
                desc: 'Medical expenses for you and your passengers.',
              },
              {
                title: 'Roadside assistance',
                desc: 'Help when you’re stranded—towing, lockouts, jumps, and more.',
              },
            ].map((item, idx) => (
              <div key={idx} className="surface-card flex gap-4 p-6 transition hover:bg-slate-50/80">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                  <svg className="h-5 w-5 text-emerald-700" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-teal-800/50 bg-gradient-to-br from-teal-700 via-teal-800 to-slate-900 py-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold text-white md:text-4xl">Ready when you are</h2>
          <p className="mt-4 text-lg text-teal-100">
            Sign in to open your NJ Coverage dashboard, create a new account in minutes, or buy a policy now.
          </p>
          <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl bg-white px-8 py-4 text-sm font-semibold text-teal-900 shadow-lg transition hover:bg-teal-50"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-xl border border-white/25 bg-white/10 px-8 py-4 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15"
            >
              Create account
            </Link>
            <Link
              href="/purchase"
              className="inline-flex items-center justify-center rounded-xl bg-teal-400 px-8 py-4 text-sm font-bold uppercase tracking-wide text-slate-950 shadow-lg shadow-teal-950/30 transition hover:bg-teal-300"
            >
              Buy auto insurance
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800 bg-slate-950 py-12 text-slate-400">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 md:flex-row">
          <BrandMark href="/" size="sm" invert />
          <p className="max-w-md text-center text-sm leading-relaxed md:text-right">
            NJ Coverage — clear coverage for the tri-state region. Auto insurance made
            easier to understand.
          </p>
        </div>
      </footer>
    </div>
  )
}
