'use client'

import { addMonths } from 'date-fns'
import { useState } from 'react'
import { useAuth, ClientData } from '@/lib/auth-context'
import Link from 'next/link'
import BrandMark from '@/components/BrandMark'
import AdminUserDirectory from '@/components/admin/AdminUserDirectory'
import AdminInsuranceCardUploader from '@/components/admin/AdminInsuranceCardUploader'
import AdminFeatureFlagsToggles from '@/components/admin/AdminFeatureFlagsToggles'
import VinDecodeTrigger from '@/components/VinDecodeTrigger'
import { normalizeVin, type DecodedVinPayload } from '@/lib/vin/decode-vin'
import { createInsuredClientFromFormAction } from '@/app/actions/admin-create-client'
import { extractPolicyNumberFromUploadAction } from '@/app/actions/extract-policy-number'
import {
  updateUserByAdminAction,
  type AdminUserRow,
} from '@/app/actions/admin-users'
import { uploadInsuranceCardPdfAdminAction } from '@/app/actions/admin-insurance-card'
import { INSURANCE_CARD_MAX_BYTES } from '@/lib/insurance-card-format'

const DEFAULT_TEMP_PASSWORD = 'Temp#A9'
const DEFAULT_ANNUAL_PREMIUM = '1200'

function isPdfInsuranceFile (f: File): boolean {
  return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
}

function defaultMemberSinceLabel (): string {
  return new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/** e.g. Jan 1, 2026 */
function formatFullPolicyDate (date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function effectiveDateToday (): string {
  return formatFullPolicyDate(new Date())
}

function combinePolicyholderName (
  first: string | null | undefined,
  last: string | null | undefined
): string {
  const f = first?.trim() ?? ''
  const l = last?.trim() ?? ''
  return `${f} ${l}`.trim()
}

export default function AdminPage() {
  const { addClient, clients } = useAuth()
  const [success, setSuccess] = useState(false)
  const [lastSubmitWasEdit, setLastSubmitWasEdit] = useState(false)
  const [remoteError, setRemoteError] = useState('')
  const [softWarning, setSoftWarning] = useState('')
  const [policyAiLoading, setPolicyAiLoading] = useState(false)
  const [policyAiHint, setPolicyAiHint] = useState('')
  const [policyScanFile, setPolicyScanFile] = useState<File | null>(null)
  const [fallbackNotice, setFallbackNotice] = useState(false)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [editNewPassword, setEditNewPassword] = useState('')
  const [insuranceCardFile, setInsuranceCardFile] = useState<File | null>(null)
  const [listRefreshSignal, setListRefreshSignal] = useState(0)

  const [form, setForm] = useState(() => ({
    email: '',
    password: DEFAULT_TEMP_PASSWORD,
    name: '',
    memberSince: defaultMemberSinceLabel(),
    phone: '',
    vehicleName: '',
    vin: '',
    modelYear: '',
    vehicleMake: '',
    vehicleModel: '',
    trimLevel: '',
    bodyClass: '',
    policyNumber: '',
    policyEffectiveDate: effectiveDateToday(),
    policyExpirationDate: '',
    policyAddress: '',
    annualPremium: DEFAULT_ANNUAL_PREMIUM,
    liability: false,
    collision: false,
    comprehensive: false,
    uninsuredMotorist: false,
    medicalPayments: false,
    roadsideAssistance: false,
  }))

  function appendCoverageToFormData (fd: FormData) {
    fd.set('liability', form.liability ? 'true' : 'false')
    fd.set('collision', form.collision ? 'true' : 'false')
    fd.set('comprehensive', form.comprehensive ? 'true' : 'false')
    fd.set('uninsuredMotorist', form.uninsuredMotorist ? 'true' : 'false')
    fd.set('medicalPayments', form.medicalPayments ? 'true' : 'false')
    fd.set('roadsideAssistance', form.roadsideAssistance ? 'true' : 'false')
  }

  const loadUserForEdit = (u: AdminUserRow) => {
    setEditingUserId(u.id)
    setEditNewPassword('')
    setInsuranceCardFile(null)
    setRemoteError('')
    setSoftWarning('')
    setPolicyScanFile(null)
    setPolicyAiHint('')
    setFallbackNotice(false)
    setForm({
      email: u.email,
      password: DEFAULT_TEMP_PASSWORD,
      name: u.name,
      memberSince: u.member_since,
      phone: u.phone,
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
      annualPremium: String(u.annual_premium ?? ''),
      liability: u.liability,
      collision: u.collision,
      comprehensive: u.comprehensive,
      uninsuredMotorist: u.uninsured_motorist,
      medicalPayments: u.medical_payments,
      roadsideAssistance: u.roadside_assistance,
    })
    window.setTimeout(() => {
      document.getElementById('admin-client-form')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }, 0)
  }

  const cancelEditing = () => {
    setEditingUserId(null)
    setEditNewPassword('')
    setInsuranceCardFile(null)
    resetForm()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setRemoteError('')
    setSoftWarning('')
    setFallbackNotice(false)

    if (
      insuranceCardFile &&
      insuranceCardFile.size > 0 &&
      insuranceCardFile.size > INSURANCE_CARD_MAX_BYTES
    ) {
      setRemoteError(
        `Insurance card file is ${(insuranceCardFile.size / (1024 * 1024)).toFixed(1)} MB. Maximum is 5 MB — choose a smaller file or clear the attachment.`
      )
      return
    }

    const password = DEFAULT_TEMP_PASSWORD

    const coverage = {
      liability: form.liability,
      collision: form.collision,
      comprehensive: form.comprehensive,
      uninsuredMotorist: form.uninsuredMotorist,
      medicalPayments: form.medicalPayments,
      roadsideAssistance: form.roadsideAssistance,
    }

    const annualPremium = parseFloat(form.annualPremium) || 0

    if (editingUserId) {
      const upd = await updateUserByAdminAction({
        userId: editingUserId,
        email: form.email,
        name: form.name,
        phone: form.phone,
        memberSince: form.memberSince,
        vehicleName: form.vehicleName,
        vin: form.vin,
        modelYear: form.modelYear,
        vehicleMake: form.vehicleMake,
        vehicleModel: form.vehicleModel,
        trimLevel: form.trimLevel,
        bodyClass: form.bodyClass,
        policyNumber: form.policyNumber,
        policyEffectiveDate: form.policyEffectiveDate,
        policyExpirationDate: form.policyExpirationDate,
        policyAddress: form.policyAddress,
        annualPremium,
        ...coverage,
        newPassword: editNewPassword.trim().length >= 6 ? editNewPassword.trim() : undefined,
      })
      if (!upd.ok) {
        setRemoteError(upd.message)
        return
      }
      let editCardWarning = ''
      if (insuranceCardFile && insuranceCardFile.size > 0) {
        const fdPdf = new FormData()
        fdPdf.append('file', insuranceCardFile)
        const upPdf = await uploadInsuranceCardPdfAdminAction(editingUserId, fdPdf)
        if (!upPdf.ok) {
          editCardWarning = `Account saved, but insurance card upload failed: ${upPdf.message}`
        }
      }
      setLastSubmitWasEdit(true)
      setSuccess(true)
      setInsuranceCardFile(null)
      setEditNewPassword('')
      setEditingUserId(null)
      resetForm()
      setListRefreshSignal(s => s + 1)
      setSoftWarning(editCardWarning)
      setTimeout(() => setSuccess(false), 3000)
      return
    }

    const fd = new FormData()
    fd.set('email', form.email)
    fd.set('password', password)
    fd.set('name', form.name)
    fd.set('memberSince', form.memberSince)
    fd.set('phone', form.phone)
    fd.set('vehicleName', form.vehicleName)
    fd.set('vin', form.vin)
    fd.set('modelYear', form.modelYear)
    fd.set('vehicleMake', form.vehicleMake)
    fd.set('vehicleModel', form.vehicleModel)
    fd.set('trimLevel', form.trimLevel)
    fd.set('bodyClass', form.bodyClass)
    fd.set('policyNumber', form.policyNumber)
    fd.set('policyEffectiveDate', form.policyEffectiveDate)
    fd.set('policyExpirationDate', form.policyExpirationDate)
    fd.set('policyAddress', form.policyAddress)
    fd.set('annualPremium', String(annualPremium))
    appendCoverageToFormData(fd)
    if (insuranceCardFile && insuranceCardFile.size > 0) {
      fd.append('insuranceCard', insuranceCardFile)
    }

    const remote = await createInsuredClientFromFormAction(fd)

    if (remote.ok) {
      setLastSubmitWasEdit(false)
      setSuccess(true)
      setSoftWarning(remote.warning ?? '')
      setInsuranceCardFile(null)
      resetForm()
      setListRefreshSignal(s => s + 1)
      setTimeout(() => setSuccess(false), 3000)
      return
    }

    const msg = remote.message.toLowerCase()
    const canFallback =
      msg.includes('service_role') ||
      msg.includes('supabase_service_role') ||
      msg.includes('missing') ||
      msg.includes('next_public_supabase') ||
      msg.includes('supabase_url')

    if (canFallback) {
      setFallbackNotice(true)
    } else {
      setRemoteError(remote.message)
      return
    }

    const client: ClientData = {
      id: form.email.split('@')[0] + '_' + Date.now(),
      email: form.email,
      password,
      name: form.name,
      memberSince: form.memberSince,
      phone: form.phone,
      vehicleName: form.vehicleName,
      vin: form.vin,
      policyNumber: form.policyNumber,
      annualPremium,
      coverage,
    }

    addClient(client)
    setLastSubmitWasEdit(false)
    setSuccess(true)
    setInsuranceCardFile(null)
    resetForm()
    setListRefreshSignal(s => s + 1)

    setTimeout(() => setSuccess(false), 3000)
  }

  function resetForm () {
    setForm({
      email: '',
      password: DEFAULT_TEMP_PASSWORD,
      name: '',
      memberSince: defaultMemberSinceLabel(),
      phone: '',
      vehicleName: '',
      vin: '',
      modelYear: '',
      vehicleMake: '',
      vehicleModel: '',
      trimLevel: '',
      bodyClass: '',
      policyNumber: '',
      policyEffectiveDate: effectiveDateToday(),
      policyExpirationDate: '',
      policyAddress: '',
      annualPremium: DEFAULT_ANNUAL_PREMIUM,
      liability: false,
      collision: false,
      comprehensive: false,
      uninsuredMotorist: false,
      medicalPayments: false,
      roadsideAssistance: false,
    })
    setPolicyScanFile(null)
    setPolicyAiHint('')
  }

  function applyVinDecode (d: DecodedVinPayload) {
    setForm(f => ({
      ...f,
      vin: d.vin,
      vehicleName: d.suggestedVehicleName,
      modelYear: d.modelYear,
      vehicleMake: d.vehicleMake,
      vehicleModel: d.vehicleModel,
      trimLevel: d.trimLevel,
      bodyClass: d.bodyClass,
    }))
  }

  async function handleExtractPolicyNumber (overrideFile?: File | null) {
    const file = overrideFile ?? policyScanFile ?? insuranceCardFile
    setPolicyAiHint('')
    if (!file?.size) {
      setPolicyAiHint(
        'Choose a file in AI document scan or attach an insurance card file at the top of this form first.'
      )
      return
    }
    if (file.size > INSURANCE_CARD_MAX_BYTES) {
      setPolicyAiHint(
        `This file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Maximum is 5 MB for AI scan and attachment — use a smaller export or a clear photo.`
      )
      return
    }
    setPolicyAiLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await extractPolicyNumberFromUploadAction(fd)
      if (!res.ok) {
        setPolicyAiHint(res.message)
        return
      }

      const combinedName = combinePolicyholderName(res.firstName, res.lastName)
      const normalizedVin = normalizeVin(res.vin ?? '')
      const vinRawStripped = (res.vin ?? '').replace(/\s/g, '').toUpperCase()

      setForm(f => ({
        ...f,
        ...(res.policyNumber ? { policyNumber: res.policyNumber } : {}),
        ...(combinedName ? { name: combinedName } : {}),
        ...(vinRawStripped
          ? { vin: normalizedVin ?? vinRawStripped }
          : {}),
        ...(res.policyAddress ? { policyAddress: res.policyAddress } : {}),
      }))

      let vinDecodedOk = false
      if (normalizedVin) {
        try {
          const dr = await fetch(
            `/api/vin/decode?vin=${encodeURIComponent(normalizedVin)}`
          )
          const dj = (await dr.json()) as {
            ok?: boolean
            data?: DecodedVinPayload
            error?: string
          }
          if (dr.ok && dj.ok && dj.data) {
            applyVinDecode(dj.data)
            vinDecodedOk = true
          }
        } catch {
          /* ignore network decode errors */
        }
      }

      const filled: string[] = []
      if (res.policyNumber) filled.push('policy #')
      if (combinedName) filled.push('name')
      if (vinRawStripped) filled.push('VIN')
      if (res.policyAddress) filled.push('policy address')
      if (vinDecodedOk) filled.push('vehicle (NHTSA decode)')

      const summary =
        filled.length > 0
          ? `Filled: ${filled.join(', ')} · AI confidence: ${res.confidence}.`
          : 'No fields detected automatically.'

      setPolicyAiHint(
        `${summary} ${res.rationale ?? ''}${vinRawStripped && !normalizedVin ? ' VIN format looks invalid (check I/O/Q vs 1/0); fix manually then use Decode VIN.' : ''}`.trim()
      )
    } finally {
      setPolicyAiLoading(false)
    }
  }

  const coverageOptions = [
    { key: 'liability', label: 'Liability Coverage', desc: 'Covers damages you cause to other vehicles and property' },
    { key: 'collision', label: 'Collision Coverage', desc: 'Covers damage to your vehicle from collisions with other vehicles or objects' },
    { key: 'comprehensive', label: 'Comprehensive Coverage', desc: 'Covers damage from theft, weather, vandalism, and other non-collision incidents' },
    { key: 'uninsuredMotorist', label: 'Uninsured Motorist Protection', desc: 'Protects you if hit by an uninsured or underinsured driver' },
    { key: 'medicalPayments', label: 'Medical Payments Coverage', desc: 'Covers medical expenses for you and your passengers' },
    { key: 'roadsideAssistance', label: 'Roadside Assistance', desc: '24/7 help for breakdowns, flat tires, lockouts, and towing' },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-50">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <BrandMark href="/" invert />
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-teal-200">
              Admin
            </span>
          </div>
          <Link
            href="/"
            className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Back to site
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {editingUserId ? 'Edit client' : 'Add new client'}
            </h1>
            <p className="text-gray-600 mt-1">
              {editingUserId
                ? 'Update account, policy, coverage, and optional insurance card file.'
                : 'Enter client information to create their NJ Coverage account.'}
            </p>
          </div>
          {editingUserId && (
            <button
              type="button"
              onClick={() => cancelEditing()}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50"
            >
              Cancel edit
            </button>
          )}
        </div>

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
            {lastSubmitWasEdit
              ? 'Client updated successfully.'
              : 'Client added successfully! They can now log in with their credentials.'}
          </div>
        )}

        {remoteError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {remoteError}
          </div>
        )}

        {softWarning && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <p className="font-semibold">Notice</p>
            <p className="mt-1 text-sm">{softWarning}</p>
          </div>
        )}

        {fallbackNotice && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">
            Supabase admin key is not configured; the client was saved only in this browser&apos;s
            demo list. Add{' '}
            <code className="text-sm bg-amber-100 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code> to
            your server environment to create real accounts.
          </div>
        )}

        <form id="admin-client-form" onSubmit={handleSubmit} className="space-y-8">
          {/* Insurance card — top of form (attach + AI scan for new/edit client) */}
          <div className="rounded-xl border border-teal-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Insurance card (PDF or photo)</h2>
            <p className="mt-1 text-sm text-gray-600">
              {!editingUserId ? (
                <>
                  <strong>Not required.</strong> If you attach a PDF or image before Add client, it is uploaded when
                  possible and sent as an attachment with the welcome email. If upload fails, the client account is still
                  created — you&apos;ll see a notice and can upload the card later.
                </>
              ) : (
                <>
                  Replace this customer&apos;s card file. It uploads when you click{' '}
                  <strong>Save changes</strong> (stored for dashboard view/download).
                </>
              )}
            </p>
            <div className="mt-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                PDF or image (JPEG, PNG, …)
              </label>
              <input
                type="file"
                accept="application/pdf,.pdf,image/jpeg,.jpg,.jpeg,image/png,.png,image/webp,.webp,image/gif,.gif"
                className="mt-1 w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-teal-800 hover:file:bg-teal-100"
                onChange={e => {
                  const f = e.target.files?.[0] ?? null
                  setInsuranceCardFile(f)
                  setPolicyAiHint('')
                  if (f?.size) void handleExtractPolicyNumber(f)
                }}
              />
              {insuranceCardFile && (
                <p className="mt-2 text-sm font-medium text-teal-800">
                  Selected: {insuranceCardFile.name}
                </p>
              )}
              {insuranceCardFile && policyAiLoading && (
                <p className="mt-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
                  {isPdfInsuranceFile(insuranceCardFile)
                    ? 'Scanning PDF with AI… filling policy, name, address, VIN, and vehicle when detected.'
                    : 'Scanning image with AI… filling policy, name, address, VIN, and vehicle when detected.'}
                </p>
              )}
              {insuranceCardFile && !policyAiLoading && policyAiHint && (
                <div
                  className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                    policyAiHint.includes('Filled:')
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : 'border-gray-200 bg-gray-50 text-gray-800'
                  }`}
                  role="status"
                >
                  {policyAiHint}
                </div>
              )}
              <p className="mt-3 text-xs text-gray-500">
                The card file is still saved with <strong>Add client</strong> / <strong>Save changes</strong>. AI scan needs{' '}
                <code className="rounded bg-gray-100 px-1">OPENAI_API_KEY</code> in your server environment.
              </p>
            </div>
          </div>

          {/* Account Information */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={e => setForm({...form, email: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="client@email.com"
                />
              </div>
              {!editingUserId ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="text"
                    value={DEFAULT_TEMP_PASSWORD}
                    disabled
                    aria-disabled="true"
                    className="w-full cursor-not-allowed bg-gray-50 px-4 py-2 border border-gray-300 rounded-lg text-gray-700"
                    placeholder={DEFAULT_TEMP_PASSWORD}
                  />
                  <p className="mt-1 text-xs text-gray-500">Temporary password is fixed.</p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    New password <span className="font-normal text-gray-500">(optional)</span>
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={editNewPassword}
                    onChange={e => setEditNewPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Leave blank to keep current"
                  />
                  <p className="mt-1 text-xs text-gray-500">Minimum 6 characters if changing.</p>
                </div>
              )}
            </div>
          </div>

          {/* Personal Information */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Personal Information</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm({...form, name: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  required
                  value={form.phone}
                  onChange={e => setForm({...form, phone: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Member since <span className="font-normal text-gray-500">(Edit Optional)</span>
                </label>
                <input
                  type="text"
                  value={form.memberSince}
                  onChange={e => setForm({ ...form, memberSince: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder={defaultMemberSinceLabel()}
                  autoComplete="off"
                />
              </div>
            </div>
          </div>

          {/* Vehicle Information */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Vehicle Information</h2>
            <p className="mb-4 text-sm text-gray-600">
              Enter the 17-character VIN and use <strong>Decode VIN</strong> (free NHTSA database) to fill year,
              make, model, and body style — then edit any field before saving.
            </p>
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <div className="min-w-[14rem] flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">VIN</label>
                <input
                  type="text"
                  required
                  value={form.vin}
                  onChange={e =>
                    setForm({ ...form, vin: e.target.value.toUpperCase().replace(/\s+/g, '') })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="17-character VIN"
                  maxLength={17}
                  autoComplete="off"
                />
              </div>
              <VinDecodeTrigger vin={form.vin} onDecoded={applyVinDecode} />
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model year</label>
                <input
                  type="text"
                  value={form.modelYear}
                  onChange={e => setForm({ ...form, modelYear: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g. 2023"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Make</label>
                <input
                  type="text"
                  value={form.vehicleMake}
                  onChange={e => setForm({ ...form, vehicleMake: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g. Tesla"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                <input
                  type="text"
                  value={form.vehicleModel}
                  onChange={e => setForm({ ...form, vehicleModel: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g. Model 3"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Trim</label>
                <input
                  type="text"
                  value={form.trimLevel}
                  onChange={e => setForm({ ...form, trimLevel: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Trim / package"
                  autoComplete="off"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Body class</label>
                <input
                  type="text"
                  value={form.bodyClass}
                  onChange={e => setForm({ ...form, bodyClass: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g. Sedan/Saloon"
                  autoComplete="off"
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vehicle display name <span className="font-normal text-gray-500">(policy emails & dashboard)</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.vehicleName}
                  onChange={e => setForm({ ...form, vehicleName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="2024 Toyota Camry"
                />
              </div>
            </div>
          </div>

          {/* Policy Information */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Policy Information</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Policy Number</label>
                <input
                  type="text"
                  required
                  value={form.policyNumber}
                  onChange={e => setForm({ ...form, policyNumber: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="POL-12345678"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Annual premium ($) <span className="font-normal text-gray-500">(clear for 0)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.annualPremium}
                  onChange={e => setForm({ ...form, annualPremium: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="1200"
                />
              </div>
              <div className="md:col-span-2 rounded-lg border border-violet-100 bg-violet-50/70 p-4">
                <p className="text-sm font-semibold text-gray-900">AI document scan (optional)</p>
                <p className="mt-1 text-xs text-gray-600">
                  Choosing a file starts an <strong>automatic AI scan</strong> (requires{' '}
                  <code className="rounded bg-violet-100/80 px-1 text-[11px]">OPENAI_API_KEY</code> on the server).
                  Extracts <strong>policy number</strong>, <strong>policyholder name</strong>,{' '}
                  <strong>policy address</strong>, and <strong>VIN</strong>;
                  a valid VIN triggers NHTSA vehicle fill. You can also attach the insurance card file at the{' '}
                  <strong>top of this form</strong> — that file is scanned the same way. Verify all fields before saving.
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div className="min-w-[12rem] flex-1">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Document for AI (PDF or image)
                    </label>
                    <input
                      type="file"
                      accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
                      className="mt-1 w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-violet-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-violet-900 hover:file:bg-violet-200"
                      onChange={e => {
                        const f = e.target.files?.[0] ?? null
                        setPolicyScanFile(f)
                        setPolicyAiHint('')
                        if (f?.size) void handleExtractPolicyNumber(f)
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleExtractPolicyNumber()}
                    disabled={policyAiLoading}
                    className="shrink-0 rounded-lg border border-violet-300 bg-white px-4 py-2 text-sm font-semibold text-violet-900 shadow-sm hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {policyAiLoading ? 'Scanning…' : 'Extract fields'}
                  </button>
                </div>
                {policyScanFile && (
                  <p className="mt-2 text-xs text-gray-700">
                    Selected for AI: <span className="font-medium">{policyScanFile.name}</span>
                  </p>
                )}
                {insuranceCardFile && !policyScanFile && (
                  <p className="mt-2 text-xs text-gray-700">
                    Insurance card file at the top of this form is also scanned automatically when you choose it there.
                  </p>
                )}
                {policyAiHint && (
                  <p
                    className={`mt-2 text-sm ${policyAiHint.includes('Filled:') ? 'text-emerald-800' : 'text-gray-700'}`}
                    role="status"
                  >
                    {policyAiHint}
                  </p>
                )}
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Policy address</label>
                <input
                  type="text"
                  value={form.policyAddress}
                  onChange={e => setForm({...form, policyAddress: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Garaging / mailing address"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Effective date</label>
                <div className="flex flex-wrap items-end gap-2">
                  <input
                    type="text"
                    value={form.policyEffectiveDate}
                    onChange={e => setForm({ ...form, policyEffectiveDate: e.target.value })}
                    className="min-w-[12rem] flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder={effectiveDateToday()}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100"
                    onClick={() =>
                      setForm(f => ({
                        ...f,
                        policyEffectiveDate: effectiveDateToday(),
                      }))}
                  >
                    Today
                  </button>
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Expiration date</label>
                <input
                  type="text"
                  value={form.policyExpirationDate}
                  onChange={e => setForm({ ...form, policyExpirationDate: e.target.value })}
                  className="mb-2 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder={`e.g. ${formatFullPolicyDate(addMonths(new Date(), 12))}`}
                  autoComplete="off"
                />
                <div className="flex flex-wrap gap-2">
                  {[1, 6, 12].map(months => (
                    <button
                      key={months}
                      type="button"
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50"
                      onClick={() =>
                        setForm(f => ({
                          ...f,
                          policyExpirationDate: formatFullPolicyDate(addMonths(new Date(), months)),
                        }))}
                    >
                      {months === 12
                        ? '12 months from today'
                        : `${months} month${months === 1 ? '' : 's'} from today`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Member dashboard + per-client coverage — single card */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <AdminFeatureFlagsToggles embedded />

            <div className="my-6 border-t border-gray-200" aria-hidden />

            <h2 className="text-lg font-semibold text-gray-900 mb-1">Coverage options</h2>
            <p className="mb-4 text-sm text-gray-600">
              {editingUserId
                ? 'Toggle coverages for this policy — saved when you click Save changes.'
                : 'Select which coverages apply to the new client you&apos;re adding below.'}
            </p>
            <div className="space-y-4">
              {coverageOptions.map(opt => (
                <label key={opt.key} className="flex cursor-pointer items-start gap-3 group">
                  <input
                    type="checkbox"
                    checked={form[opt.key as keyof typeof form] as boolean}
                    onChange={e => setForm({ ...form, [opt.key]: e.target.checked })}
                    className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-medium text-gray-900 group-hover:text-blue-600">{opt.label}</span>
                    <p className="text-sm text-gray-500">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition"
          >
            {editingUserId ? 'Save changes' : 'Add client'}
          </button>
        </form>

        <AdminInsuranceCardUploader refreshSignal={listRefreshSignal} />

        {/* Existing Clients */}
        {clients.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Existing Clients ({clients.length})</h2>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Email</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Vehicle</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Premium</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {clients.map(client => (
                    <tr key={client.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{client.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{client.email}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{client.vehicleName}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">${client.annualPremium}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <AdminUserDirectory
          onSelectUserForEdit={loadUserForEdit}
          refreshSignal={listRefreshSignal}
        />

        <div className="mt-12 rounded-xl border border-blue-200 bg-blue-50 p-6">
          <h2 className="text-lg font-semibold text-blue-900 mb-2">Supabase schema and RLS</h2>
          <p className="text-blue-800 text-sm mb-3">
            Run the migration in{' '}
            <code className="text-xs bg-blue-100 px-1 rounded">supabase/migrations/20260422120000_initial_schema.sql</code>{' '}
            from the Supabase SQL Editor (or CLI) to create{' '}
            <code className="text-xs bg-blue-100 px-1 rounded">profiles</code>,{' '}
            <code className="text-xs bg-blue-100 px-1 rounded">vehicles</code>, and{' '}
            <code className="text-xs bg-blue-100 px-1 rounded">coverage</code> with row level security.
            Copy <code className="text-xs bg-blue-100 px-1 rounded">.env.example</code> to{' '}
            <code className="text-xs bg-blue-100 px-1 rounded">.env.local</code> with your project URL,
            anon key, and (for admin user creation) the service role key — server only.
          </p>
          <p className="text-blue-800 text-sm">
            <strong>Demo login:</strong> paste{' '}
            <code className="text-xs bg-blue-100 px-1 rounded">supabase/seed_demo_account.sql</code> in the SQL
            Editor to create <code className="text-xs bg-blue-100 px-1 rounded">demo@example.com</code> /{' '}
            <code className="text-xs bg-blue-100 px-1 rounded">demo123</code> (matches the app&apos;s demo data).
          </p>
        </div>
      </main>
    </div>
  )
}
