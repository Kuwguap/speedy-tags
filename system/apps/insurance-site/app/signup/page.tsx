'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, SignupError, type SignupErrorCode } from '@/lib/auth-context'
import Link from 'next/link'
import BrandMark from '@/components/BrandMark'

type SignupErrorState =
  | { kind: 'none' }
  | { kind: 'message'; message: string }
  | { kind: 'email_taken'; email: string }

export default function SignupPage () {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<SignupErrorState>({ kind: 'none' })
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { signup } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError({ kind: 'none' })

    if (password !== confirmPassword) {
      setError({ kind: 'message', message: 'Passwords do not match.' })
      return
    }

    if (password.length < 6) {
      setError({
        kind: 'message',
        message: 'Password must be at least 6 characters.',
      })
      return
    }

    setLoading(true)

    try {
      await signup(email, password, name)
      router.push('/dashboard')
    } catch (e) {
      if (e instanceof SignupError) {
        setError(mapSignupErrorToState(e.code, e.message, email))
      } else {
        setError({
          kind: 'message',
          message: 'Failed to create account. Please try again.',
        })
      }
    } finally {
      setLoading(false)
    }
  }

  function mapSignupErrorToState (
    code: SignupErrorCode,
    message: string,
    submittedEmail: string,
  ): SignupErrorState {
    if (code === 'email_taken') {
      return { kind: 'email_taken', email: submittedEmail.trim() }
    }
    return { kind: 'message', message }
  }

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-slate-900 outline-none ring-teal-600/0 transition placeholder:text-slate-400 focus:border-teal-500/50 focus:bg-white focus:ring-4 focus:ring-teal-600/15'

  return (
    <div className="relative flex min-h-screen flex-col bg-gradient-to-br from-slate-950 via-teal-950 to-emerald-950">
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage: `radial-gradient(at 30% 70%, rgba(45, 212, 191, 0.12) 0px, transparent 50%),
            radial-gradient(at 90% 30%, rgba(52, 211, 153, 0.1) 0px, transparent 45%)`,
        }}
      />

      <header className="relative z-10 border-b border-white/10 bg-slate-950/45 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <BrandMark href="/" invert />
          <Link
            href="/login"
            className="text-sm font-semibold text-white/90 transition hover:text-white"
          >
            Sign in
          </Link>
        </div>
      </header>

      <div className="relative flex flex-1 items-center justify-center px-4 py-12 md:py-16">
        <div className="surface-card w-full max-w-md p-8 shadow-2xl shadow-slate-900/25 md:p-10">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Create your account</h1>
          <p className="mt-2 text-slate-600">Join NJ Coverage in a few steps</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="signup-name" className="mb-2 block text-sm font-medium text-slate-700">
                Full name
              </label>
              <input
                id="signup-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="Jane Smith"
                className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="signup-email" className="mb-2 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="signup-password" className="mb-2 block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="signup-confirm" className="mb-2 block text-sm font-medium text-slate-700">
                Confirm password
              </label>
              <input
                id="signup-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                placeholder="••••••••"
                className={inputCls}
              />
            </div>

            {error.kind === 'email_taken' ? (
              <div
                role="alert"
                aria-live="polite"
                className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              >
                <p className="font-semibold">An account with this email already exists.</p>
                <p className="mt-1 text-amber-900/90">
                  <span className="font-mono">{error.email}</span> is already registered.{' '}
                  <Link
                    href={`/login?email=${encodeURIComponent(error.email)}`}
                    className="font-semibold text-amber-950 underline decoration-amber-700 underline-offset-2 hover:text-amber-700"
                  >
                    Sign in instead
                  </Link>
                  , or use a different email above.
                </p>
              </div>
            ) : error.kind === 'message' ? (
              <div
                role="alert"
                aria-live="polite"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {error.message}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary-brand mt-2 w-full py-3.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-600">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-teal-700 hover:text-teal-600">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
