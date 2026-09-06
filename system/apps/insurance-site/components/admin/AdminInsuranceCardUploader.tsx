'use client'

import { useCallback, useEffect, useState } from 'react'
import { listAllUsersAction, type AdminUserRow } from '@/app/actions/admin-users'
import { uploadInsuranceCardPdfAdminAction } from '@/app/actions/admin-insurance-card'

type Props = {
  /** Increment after creates/edits so the customer list refreshes */
  refreshSignal?: number
}

export default function AdminInsuranceCardUploader ({ refreshSignal }: Props) {
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

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

  const upload = async () => {
    setMsg('')
    setErr('')
    if (!selectedUserId) {
      setErr('Select a customer first.')
      return
    }
    if (!file || file.size === 0) {
      setErr('Choose a PDF or image file.')
      return
    }
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await uploadInsuranceCardPdfAdminAction(selectedUserId, fd)
    setUploading(false)
    if (!res.ok) {
      setErr(res.message)
      return
    }
    setMsg('Insurance card uploaded. The customer can view it on their dashboard.')
    setFile(null)
    await refresh()
  }

  const selected = users.find(u => u.id === selectedUserId)

  return (
    <div className="mb-10 rounded-xl border border-teal-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Insurance card (PDF or photo)</h2>
          <p className="mt-1 text-sm text-gray-600">
            Upload a PDF or image of the insurance card for any existing customer. They will see it on{' '}
            <strong className="text-gray-800">Dashboard</strong> after they log in (view / download).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="shrink-0 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Refresh list'}
        </button>
      </div>

      {loadError && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">Could not load users</p>
          <p className="mt-1 whitespace-pre-wrap">{loadError}</p>
        </div>
      )}

      {!loadError && users.length === 0 && !loading && (
        <p className="text-sm text-gray-600">
          No customers in the database yet. Add a client above, then upload their insurance card here.
        </p>
      )}

      {users.length > 0 && (
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block min-w-[220px] flex-1">
            <span className="mb-1 block text-sm font-medium text-gray-700">Customer</span>
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              value={selectedUserId}
              onChange={e => {
                setSelectedUserId(e.target.value)
                setErr('')
                setMsg('')
              }}
            >
              <option value="">Select customer…</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {(u.name || '—') + ' — ' + u.email}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-[200px] flex-1">
            <span className="mb-1 block text-sm font-medium text-gray-700">PDF or image</span>
            <input
              type="file"
              accept="application/pdf,.pdf,image/jpeg,.jpg,.jpeg,image/png,.png,image/webp,.webp,image/gif,.gif"
              className="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-blue-900 hover:file:bg-blue-100"
              onChange={e => {
                setFile(e.target.files?.[0] ?? null)
                setErr('')
                setMsg('')
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => void upload()}
            disabled={uploading || !selectedUserId}
            className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      )}

      {selected && selected.insurance_card_pdf_path && (
        <p className="mt-3 text-sm text-emerald-800">
          This customer already has a card on file; uploading again will replace it.
        </p>
      )}

      {err && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{err}</div>
      )}
      {msg && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-900">
          {msg}
        </div>
      )}
    </div>
  )
}
