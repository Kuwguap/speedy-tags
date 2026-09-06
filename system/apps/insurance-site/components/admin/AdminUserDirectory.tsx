'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  listAllUsersAction,
  updateUserByAdminAction,
  type AdminUserRow,
} from '@/app/actions/admin-users'
import { uploadInsuranceCardPdfAdminAction } from '@/app/actions/admin-insurance-card'
import VinDecodeTrigger from '@/components/VinDecodeTrigger'
import type { DecodedVinPayload } from '@/lib/vin/decode-vin'

type EditState = {
  userId: string
  email: string
  name: string
  phone: string
  memberSince: string
  vehicleName: string
  vin: string
  modelYear: string
  vehicleMake: string
  vehicleModel: string
  trimLevel: string
  bodyClass: string
  policyNumber: string
  policyEffectiveDate: string
  policyExpirationDate: string
  policyAddress: string
  annualPremium: string
  liability: boolean
  collision: boolean
  comprehensive: boolean
  uninsuredMotorist: boolean
  medicalPayments: boolean
  roadsideAssistance: boolean
  newPassword: string
  insuranceCardPdfPath: string | null
}

const emptyEdit = (u: AdminUserRow): EditState => ({
  userId: u.id,
  email: u.email,
  name: u.name,
  phone: u.phone,
  memberSince: u.member_since,
  vehicleName: u.vehicle_name,
  vin: u.vin,
  modelYear: u.model_year,
  vehicleMake: u.vehicle_make,
  vehicleModel: u.vehicle_model,
  trimLevel: u.trim_level,
  bodyClass: u.body_class,
  policyNumber: u.policy_number,
  policyEffectiveDate: u.policy_effective_date,
  policyExpirationDate: u.policy_expiration_date,
  policyAddress: u.policy_address,
  annualPremium: String(u.annual_premium ?? 0),
  liability: u.liability,
  collision: u.collision,
  comprehensive: u.comprehensive,
  uninsuredMotorist: u.uninsured_motorist,
  medicalPayments: u.medical_payments,
  roadsideAssistance: u.roadside_assistance,
  newPassword: '',
  insuranceCardPdfPath: u.insurance_card_pdf_path,
})

type Props = {
  /**
   * When set, "Edit" loads the user into the parent form instead of opening this modal.
   */
  onSelectUserForEdit?: (user: AdminUserRow) => void
  /** Increment to refetch the user table (e.g. after save) */
  refreshSignal?: number
}

export default function AdminUserDirectory ({ onSelectUserForEdit, refreshSignal }: Props) {
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [saveMsg, setSaveMsg] = useState('')
  const [saveErr, setSaveErr] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfUploading, setPdfUploading] = useState(false)
  const [pdfErr, setPdfErr] = useState('')
  const [pdfOk, setPdfOk] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const res = await listAllUsersAction()
    setLoading(false)
    if (!res.ok) {
      setLoadError(res.message)
      setUsers([])
      return
    }
    setUsers(res.users)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, refreshSignal])

  const openEdit = (u: AdminUserRow) => {
    if (onSelectUserForEdit) {
      onSelectUserForEdit(u)
      return
    }
    setSaveMsg('')
    setSaveErr('')
    setPdfFile(null)
    setPdfErr('')
    setPdfOk('')
    setEditing(emptyEdit(u))
  }

  const saveEdit = async () => {
    if (!editing) return
    setSaveErr('')
    setSaveMsg('')
    const res = await updateUserByAdminAction({
      userId: editing.userId,
      email: editing.email,
      name: editing.name,
      phone: editing.phone,
      memberSince: editing.memberSince,
      vehicleName: editing.vehicleName,
      vin: editing.vin,
      modelYear: editing.modelYear,
      vehicleMake: editing.vehicleMake,
      vehicleModel: editing.vehicleModel,
      trimLevel: editing.trimLevel,
      bodyClass: editing.bodyClass,
      policyNumber: editing.policyNumber,
      policyEffectiveDate: editing.policyEffectiveDate,
      policyExpirationDate: editing.policyExpirationDate,
      policyAddress: editing.policyAddress,
      annualPremium: parseFloat(editing.annualPremium) || 0,
      liability: editing.liability,
      collision: editing.collision,
      comprehensive: editing.comprehensive,
      uninsuredMotorist: editing.uninsuredMotorist,
      medicalPayments: editing.medicalPayments,
      roadsideAssistance: editing.roadsideAssistance,
      newPassword: editing.newPassword || undefined,
    })
    if (!res.ok) {
      setSaveErr(res.message)
      return
    }
    setSaveMsg('Saved successfully.')
    setEditing(null)
    await refresh()
  }

  const uploadInsurancePdf = async () => {
    if (!editing) return
    setPdfErr('')
    setPdfOk('')
    if (!pdfFile || pdfFile.size === 0) {
      setPdfErr('Choose a PDF or image file first.')
      return
    }
    setPdfUploading(true)
    const fd = new FormData()
    fd.append('file', pdfFile)
    const res = await uploadInsuranceCardPdfAdminAction(editing.userId, fd)
    setPdfUploading(false)
    if (!res.ok) {
      setPdfErr(res.message)
      return
    }
    setEditing({ ...editing, insuranceCardPdfPath: res.storagePath })
    setPdfFile(null)
    setPdfOk('Insurance card uploaded.')
    await refresh()
  }

  return (
    <div className="mt-12">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">All users</h2>
          <p className="mt-1 text-sm text-slate-600">
            {onSelectUserForEdit
              ? 'Use Edit to load a customer into the form above — update account, policy, and coverage in one place.'
              : 'View and edit profile, vehicle, coverage, and optionally reset password.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {loadError && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Could not load users</p>
          <p className="mt-2 whitespace-pre-wrap">{loadError}</p>
          <p className="mt-3 text-xs text-amber-900/90">
            On Vercel: Project → Settings → Environment Variables → add{' '}
            <code className="rounded bg-amber-100/80 px-1">NEXT_PUBLIC_SUPABASE_URL</code> (or{' '}
            <code className="rounded bg-amber-100/80 px-1">SUPABASE_URL</code>) and{' '}
            <code className="rounded bg-amber-100/80 px-1">SUPABASE_SERVICE_ROLE_KEY</code>, then{' '}
            <strong>Redeploy</strong>. Server-only vars are not picked up until you redeploy.
          </p>
        </div>
      )}

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/90">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-700">Name</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Email</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Phone</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Vehicle</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Premium</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Card</th>
                <th className="px-4 py-3 font-semibold text-slate-700"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium text-slate-900">{u.name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3 text-slate-600">{u.phone}</td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-slate-600">
                    {u.vehicle_name || '—'}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    ${Number(u.annual_premium).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    {u.insurance_card_pdf_path ? (
                      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                        File
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openEdit(u)}
                      className="rounded-lg font-semibold text-teal-700 hover:text-teal-600"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 && !loading && !loadError && (
          <div className="p-8 text-center text-slate-600">
            <p className="font-medium text-slate-800">No rows in <code className="text-sm">profiles</code> yet.</p>
            <p className="mt-2 text-sm">
              Sign up from the app, use <strong>Add client</strong> above, or run{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">supabase/seed_demo_account.sql</code> in the
              Supabase SQL Editor for <code className="text-xs">demo@example.com</code>.
            </p>
          </div>
        )}
      </div>

      {!onSelectUserForEdit && editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="surface-card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6 shadow-2xl md:p-8">
            <div className="mb-6 flex items-start justify-between gap-4">
              <h3 className="text-xl font-bold text-slate-900">Edit user</h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg px-2 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Email
                </span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={editing.email}
                  onChange={e => setEditing({ ...editing, email: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Full name
                </span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={editing.name}
                  onChange={e => setEditing({ ...editing, name: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Phone
                </span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={editing.phone}
                  onChange={e => setEditing({ ...editing, phone: e.target.value })}
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Member since (display text)
                </span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={editing.memberSince}
                  onChange={e => setEditing({ ...editing, memberSince: e.target.value })}
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  New password (optional, min 6 chars)
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={editing.newPassword}
                  onChange={e => setEditing({ ...editing, newPassword: e.target.value })}
                  placeholder="Leave blank to keep current"
                />
              </label>
            </div>

            <h4 className="mt-8 border-t border-slate-100 pt-6 text-sm font-bold uppercase tracking-wide text-slate-500">
              Vehicle & policy
            </h4>
            <p className="mt-2 text-xs text-slate-600">
              Decode VIN uses the free NHTSA database; you can edit every field afterward.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="block min-w-[12rem] flex-1">
                <span className="mb-1 block text-xs font-semibold text-slate-500">VIN</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
                  value={editing.vin}
                  onChange={e =>
                    setEditing({
                      ...editing,
                      vin: e.target.value.toUpperCase().replace(/\s+/g, ''),
                    })}
                  maxLength={17}
                />
              </label>
              <VinDecodeTrigger
                vin={editing.vin}
                onDecoded={(d: DecodedVinPayload) =>
                  setEditing({
                    ...editing,
                    vin: d.vin,
                    vehicleName: d.suggestedVehicleName,
                    modelYear: d.modelYear,
                    vehicleMake: d.vehicleMake,
                    vehicleModel: d.vehicleModel,
                    trimLevel: d.trimLevel,
                    bodyClass: d.bodyClass,
                  })}
              />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Model year</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={editing.modelYear}
                  onChange={e => setEditing({ ...editing, modelYear: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Make</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={editing.vehicleMake}
                  onChange={e => setEditing({ ...editing, vehicleMake: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Model</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={editing.vehicleModel}
                  onChange={e => setEditing({ ...editing, vehicleModel: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Trim</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={editing.trimLevel}
                  onChange={e => setEditing({ ...editing, trimLevel: e.target.value })}
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Body class</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={editing.bodyClass}
                  onChange={e => setEditing({ ...editing, bodyClass: e.target.value })}
                />
              </label>
              <label className="block md:col-span-3">
                <span className="mb-1 block text-xs font-semibold text-slate-500">
                  Vehicle display name
                </span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={editing.vehicleName}
                  onChange={e => setEditing({ ...editing, vehicleName: e.target.value })}
                />
              </label>
              <label className="block md:col-span-3 md:col-start-1">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Policy #</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={editing.policyNumber}
                  onChange={e => setEditing({ ...editing, policyNumber: e.target.value })}
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Policy address</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={editing.policyAddress}
                  onChange={e => setEditing({ ...editing, policyAddress: e.target.value })}
                  placeholder="Garaging / mailing address"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Effective date</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={editing.policyEffectiveDate}
                  onChange={e => setEditing({ ...editing, policyEffectiveDate: e.target.value })}
                  placeholder="e.g. Jan 1, 2025"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Expiration date</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={editing.policyExpirationDate}
                  onChange={e => setEditing({ ...editing, policyExpirationDate: e.target.value })}
                  placeholder="e.g. Jan 1, 2026"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Annual premium ($)</span>
                <input
                  type="number"
                  step="0.01"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={editing.annualPremium}
                  onChange={e => setEditing({ ...editing, annualPremium: e.target.value })}
                />
              </label>
            </div>

            <h4 className="mt-8 border-t border-slate-100 pt-6 text-sm font-bold uppercase tracking-wide text-slate-500">
              Insurance card (PDF or photo)
            </h4>
            <p className="mt-2 text-sm text-slate-600">
              Upload a PDF or clear photo of the insurance card. They can view and download it from their dashboard.
            </p>
            <p className="mt-1 text-sm font-medium text-slate-800">
              Status:{' '}
              {editing.insuranceCardPdfPath ? (
                <span className="text-emerald-700">On file</span>
              ) : (
                <span className="text-slate-500">None uploaded</span>
              )}
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="block flex-1 min-w-[200px]">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  PDF or image
                </span>
                <input
                  type="file"
                  accept="application/pdf,.pdf,image/jpeg,.jpg,.jpeg,image/png,.png,image/webp,.webp,image/gif,.gif"
                  className="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-teal-800 hover:file:bg-teal-100"
                  onChange={e => {
                    setPdfErr('')
                    setPdfOk('')
                    setPdfFile(e.target.files?.[0] ?? null)
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => void uploadInsurancePdf()}
                disabled={pdfUploading}
                className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-500 disabled:opacity-60"
              >
                {pdfUploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>
            {pdfErr && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
                {pdfErr}
              </div>
            )}
            {pdfOk && (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
                {pdfOk}
              </div>
            )}

            <h4 className="mt-8 border-t border-slate-100 pt-6 text-sm font-bold uppercase tracking-wide text-slate-500">
              Coverage
            </h4>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(
                [
                  ['liability', 'Liability'],
                  ['collision', 'Collision'],
                  ['comprehensive', 'Comprehensive'],
                  ['uninsuredMotorist', 'Uninsured motorist'],
                  ['medicalPayments', 'Medical payments'],
                  ['roadsideAssistance', 'Roadside'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={editing[key]}
                    onChange={e =>
                      setEditing({
                        ...editing,
                        [key]: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-teal-600"
                  />
                  <span className="text-sm font-medium text-slate-800">{label}</span>
                </label>
              ))}
            </div>

            {saveErr && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
                {saveErr}
              </div>
            )}
            {saveMsg && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
                {saveMsg}
              </div>
            )}

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void saveEdit()}
                className="btn-primary-brand px-6 py-2.5"
              >
                Save changes
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-xl border border-slate-200 px-6 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
