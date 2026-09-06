'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { fetchDashboardPdf } from '@/lib/dashboard-document'

const ALLOWED_PREFIXES = [
  '/api/insurance-card-pdf',
  '/api/documents/policy-declaration',
]

function isAllowedDocumentSrc (src: string): boolean {
  if (!src.startsWith('/api/') || src.includes('..')) return false
  return ALLOWED_PREFIXES.some(p => src.startsWith(p))
}

export default function DocumentViewerClient () {
  const router = useRouter()
  const searchParams = useSearchParams()
  const src = searchParams.get('src')?.trim() ?? ''
  const title = searchParams.get('title')?.trim() || 'Document'
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloadName, setDownloadName] = useState('document.pdf')

  const load = useCallback(async () => {
    if (!src || !isAllowedDocumentSrc(src)) {
      setError('Invalid document link.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const { blob, filename } = await fetchDashboardPdf(src)
      setDownloadName(filename)
      const url = URL.createObjectURL(blob)
      setBlobUrl(prev => {
        if (prev) URL.revokeObjectURL(prev)
        return url
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load document.')
      setBlobUrl(prev => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    } finally {
      setLoading(false)
    }
  }, [src])

  useEffect(() => {
    void load()
    return () => {
      setBlobUrl(prev => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [load])

  async function handleDownload () {
    if (!src) return
    try {
      const { blob, filename } = await fetchDashboardPdf(src)
      const name = filename || downloadName
      const file = new File([blob], name, { type: blob.type || 'application/pdf' })
      if (
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({ files: [file], title: name })
        return
      }
      const url = URL.createObjectURL(blob)
      window.location.assign(url)
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed.')
    }
  }

  return (
    <div className="document-viewer-shell flex min-h-[100dvh] flex-col bg-slate-950 text-white">
      <header className="document-viewer-toolbar sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-white/10 bg-slate-950/95 px-3 py-2 backdrop-blur-md sm:px-4 sm:py-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="btn-touch shrink-0 rounded-xl border border-white/15 bg-white/10 px-4 font-semibold text-white"
          aria-label="Go back"
        >
          Back
        </button>
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold sm:text-base">
          {title}
        </h1>
        <button
          type="button"
          disabled={loading || !!error}
          onClick={() => void handleDownload()}
          className="btn-touch shrink-0 rounded-xl bg-teal-600 px-4 font-semibold text-white disabled:opacity-50"
        >
          Save
        </button>
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col">
        {loading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-slate-300">
            <div
              className="h-10 w-10 animate-spin rounded-full border-2 border-teal-400 border-t-transparent"
              aria-hidden
            />
            <p className="text-sm">Loading document…</p>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="max-w-sm text-sm text-red-200">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="btn-touch rounded-xl bg-teal-600 px-5 font-semibold text-white"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && blobUrl && (
          <div className="flex min-h-0 flex-1 flex-col">
            <object
              data={blobUrl}
              type="application/pdf"
              className="h-[calc(100dvh-4.5rem)] w-full flex-1 bg-white"
              aria-label={title}
            >
              <iframe
                src={blobUrl}
                title={title}
                className="h-[calc(100dvh-4.5rem)] w-full flex-1 border-0 bg-white"
              />
            </object>
            <p className="shrink-0 px-4 py-3 text-center text-xs text-slate-400">
              Pinch to zoom · Use Save to download or share
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
