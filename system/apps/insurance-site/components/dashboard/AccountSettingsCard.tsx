'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import type { BillingAddress } from '@/lib/supabase/dashboard-data'
import { isSupabaseConfigured } from '@/lib/supabase/client'

const MIN_PWD = 6

type Modal = 'address' | 'phone' | 'password' | null

type Props = {
  billingAddress: BillingAddress
  phone: string
  onChanged?: () => void
}

export default function AccountSettingsCard ({ billingAddress, phone, onChanged }: Props) {
  const { updatePassword, refreshUserData } = useAuth()
  const [modal, setModal] = useState<Modal>(null)

  function close () {
    setModal(null)
  }

  return (
    <section className="surface-card p-6 md:p-8">
      <h2 className="text-lg font-semibold text-slate-900">Account settings</h2>
      <p className="mt-1 text-sm text-slate-500">
        Keep your contact and billing information current.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <SettingButton
          icon="✏️"
          title="Billing address"
          subtitle={
            billingAddress.line1
              ? `${billingAddress.line1}, ${billingAddress.city || ''} ${billingAddress.state || ''}`.trim()
              : 'Not set'
          }
          onClick={() => setModal('address')}
        />
        <SettingButton
          icon="📞"
          title="Phone"
          subtitle={phone || 'Not set'}
          onClick={() => setModal('phone')}
        />
        <SettingButton
          icon="🔒"
          title="Password"
          subtitle="Change your sign-in password"
          onClick={() => setModal('password')}
        />
      </div>

      {modal === 'address' && (
        <BillingAddressModal
          initial={billingAddress}
          onClose={close}
          onSaved={async () => {
            close()
            await refreshUserData()
            onChanged?.()
          }}
        />
      )}
      {modal === 'phone' && (
        <PhoneModal
          initial={phone}
          onClose={close}
          onSaved={async () => {
            close()
            await refreshUserData()
            onChanged?.()
          }}
        />
      )}
      {modal === 'password' && (
        <PasswordModal
          enabled={isSupabaseConfigured()}
          onClose={close}
          onUpdate={async pw => {
            await updatePassword(pw)
          }}
        />
      )}
    </section>
  )
}

function SettingButton ({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: string
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-teal-300 hover:bg-teal-50/40 hover:shadow-sm"
    >
      <span
        aria-hidden
        className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-teal-100 text-teal-700"
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-slate-900">{title}</span>
        <span className="block truncate text-xs text-slate-500">{subtitle}</span>
      </span>
    </button>
  )
}

function ModalShell ({
  title,
  description,
  onClose,
  children,
}: {
  title: string
  description: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="surface-card w-full max-w-md p-6 shadow-2xl md:p-8">
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
        <div className="mt-5">{children}</div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
      </div>
    </div>
  )
}

function BillingAddressModal ({
  initial,
  onClose,
  onSaved,
}: {
  initial: BillingAddress
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [line1, setLine1] = useState(initial.line1)
  const [line2, setLine2] = useState(initial.line2)
  const [city, setCity] = useState(initial.city)
  const [state, setState] = useState(initial.state)
  const [postalCode, setPostalCode] = useState(initial.postalCode)
  const [country, setCountry] = useState(initial.country || 'US')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function onSave () {
    setBusy(true)
    setErr('')
    try {
      const r = await fetch('/api/account/billing-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line1, line2, city, state, postalCode, country }),
      })
      const j = (await r.json()) as { ok?: boolean; error?: unknown }
      if (!r.ok || !j.ok) {
        const msg = typeof j.error === 'string' ? j.error : 'Could not save address.'
        setErr(msg)
        return
      }
      await onSaved()
    } catch {
      setErr('Network error.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell
      title="Update billing address"
      description="Used on receipts and your Policy Declaration."
      onClose={onClose}
    >
      <div className="space-y-3">
        <Input label="Street" value={line1} onChange={setLine1} required />
        <Input label="Apt / suite (optional)" value={line2} onChange={setLine2} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="City" value={city} onChange={setCity} required />
          <Input label="State (2 letter)" value={state} onChange={setState} maxLength={2} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="ZIP / Postal" value={postalCode} onChange={setPostalCode} required />
          <Input label="Country" value={country} onChange={setCountry} maxLength={2} required />
        </div>
        {err && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {err}
          </p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSave()}
          className="btn-primary-brand w-full py-2.5 disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save billing address'}
        </button>
      </div>
    </ModalShell>
  )
}

function PhoneModal ({
  initial,
  onClose,
  onSaved,
}: {
  initial: string
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [phone, setPhone] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function onSave () {
    setBusy(true)
    setErr('')
    try {
      const r = await fetch('/api/account/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const j = (await r.json()) as { ok?: boolean; error?: unknown }
      if (!r.ok || !j.ok) {
        const msg = typeof j.error === 'string' ? j.error : 'Could not save phone number.'
        setErr(msg)
        return
      }
      await onSaved()
    } catch {
      setErr('Network error.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell
      title="Change phone number"
      description="We'll use this to contact you about your policy."
      onClose={onClose}
    >
      <div className="space-y-3">
        <Input
          label="Phone"
          value={phone}
          onChange={setPhone}
          type="tel"
          required
        />
        {err && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {err}
          </p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSave()}
          className="btn-primary-brand w-full py-2.5 disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save phone'}
        </button>
      </div>
    </ModalShell>
  )
}

function PasswordModal ({
  enabled,
  onClose,
  onUpdate,
}: {
  enabled: boolean
  onClose: () => void
  onUpdate: (newPassword: string) => Promise<void>
}) {
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function onSave () {
    if (!enabled) {
      setErr('Password change requires the online (Supabase) account, not demo mode.')
      return
    }
    if (pw.length < MIN_PWD) {
      setErr(`Password must be at least ${MIN_PWD} characters.`)
      return
    }
    if (pw !== confirm) {
      setErr('Passwords do not match.')
      return
    }
    if (typeof window !== 'undefined' && !window.confirm('Change your password?')) {
      return
    }
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      await onUpdate(pw)
      setMsg('Password updated. Use it the next time you sign in.')
      setPw('')
      setConfirm('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not update password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell
      title="Change password"
      description={enabled ? 'Choose a new password for your account.' : 'Not available in demo mode.'}
      onClose={onClose}
    >
      <div className="space-y-3">
        <Input
          label="New password"
          type="password"
          value={pw}
          onChange={setPw}
          disabled={!enabled}
        />
        <Input
          label="Confirm new password"
          type="password"
          value={confirm}
          onChange={setConfirm}
          disabled={!enabled}
        />
        {msg && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {msg}
          </p>
        )}
        {err && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {err}
          </p>
        )}
        <button
          type="button"
          disabled={busy || !enabled}
          onClick={() => void onSave()}
          className="btn-primary-brand w-full py-2.5 disabled:opacity-60"
        >
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </div>
    </ModalShell>
  )
}

function Input ({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  disabled = false,
  maxLength,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
  disabled?: boolean
  maxLength?: number
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        maxLength={maxLength}
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 disabled:bg-slate-50 disabled:text-slate-400"
      />
    </label>
  )
}
