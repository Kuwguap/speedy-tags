'use client'

import { useCallback, useState } from 'react'
import { isSupabaseConfigured } from '@/lib/supabase/client'
import { insuranceCardDownloadFilename } from '@/lib/pdf-download-name'

/** Same-origin stream (see `app/api/insurance-card-pdf/route.ts`) — avoids iOS Safari
 * `WebKitBlobResource error 1` from blob URLs + cross-origin fetch + early revoke. */
const PDF_API = '/api/insurance-card-pdf'

function isIOSLikeMobile (): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iPhone|iPad|iPod/i.test(ua)
}

type Props = {
  policyholderName: string
  storagePath: string | null | undefined
}

export default function InsuranceCardPdfSection ({ policyholderName, storagePath }: Props) {
  const [busy, setBusy] = useState<'view' | 'download' | null>(null)
  const [error, setError] = useState('')

  const handleView = useCallback(() => {
    setBusy('view')
    setError('')
    try {
      const viewUrl = `${PDF_API}?inline=1`
      if (isIOSLikeMobile()) {
        window.location.href = viewUrl
      } else {
        window.open(viewUrl, '_blank', 'noopener,noreferrer')
      }
    } catch {
      setError('Could not open the file.')
    } finally {
      window.setTimeout(() => setBusy(null), 400)
    }
  }, [])

  const handleDownload = useCallback(() => {
    setBusy('download')
    setError('')
    try {
      const fname = insuranceCardDownloadFilename(policyholderName, storagePath)
      if (isIOSLikeMobile()) {
        // iOS Safari is inconsistent with `download` attribute; use direct navigation.
        window.location.href = PDF_API
      } else {
        const a = document.createElement('a')
        a.href = PDF_API
        a.download = fname
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        a.remove()
      }
    } catch {
      setError('Download failed.')
    } finally {
      window.setTimeout(() => setBusy(null), 600)
    }
  }, [policyholderName])

  if (!isSupabaseConfigured() || !storagePath) {
    return null
  }

  return (
    <section className="surface-card mt-8 p-6 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Insurance card</h2>
          <p className="mt-2 text-sm text-slate-600">
            View or download your official card as{' '}
            <span className="font-medium text-slate-800">
              {insuranceCardDownloadFilename(policyholderName, storagePath)}
            </span>
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleView()}
            disabled={busy !== null}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
          >
            {busy === 'view' ? 'Opening…' : 'View'}
          </button>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={busy !== null}
            className="btn-primary-brand px-4 py-2.5 text-sm"
          >
            {busy === 'download' ? 'Downloading…' : 'Download'}
          </button>
        </div>
      </div>
      {error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </section>
  )
}
