/**
 * Mobile-friendly open/download helpers for authenticated dashboard PDFs.
 */

export function isMobileDevice (): boolean {
  if (typeof window === 'undefined') return false
  const coarse =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  const narrow =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 768px)').matches
  const ua = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')
  return coarse || narrow || ua
}

/** Full-screen in-app viewer — works with auth cookies on same origin. */
export function documentViewerHref (apiUrl: string, title?: string): string {
  const params = new URLSearchParams()
  params.set('src', apiUrl)
  if (title?.trim()) params.set('title', title.trim())
  return `/dashboard/document-viewer?${params.toString()}`
}

export async function fetchDashboardPdf (
  apiUrl: string
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(apiUrl, { credentials: 'include', cache: 'no-store' })
  if (!res.ok) {
    let message = `Could not load document (${res.status}).`
    try {
      const json = (await res.json()) as { error?: string }
      if (json.error) message = json.error
    } catch {
      /* not JSON */
    }
    throw new Error(message)
  }
  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition') ?? ''
  const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i)
  const filename = match?.[1]
    ? decodeURIComponent(match[1].replace(/"/g, ''))
    : 'document.pdf'
  return { blob, filename }
}

export async function downloadDashboardPdf (
  apiUrl: string,
  preferredFilename?: string
): Promise<void> {
  const { blob, filename } = await fetchDashboardPdf(apiUrl)
  const name = preferredFilename?.trim() || filename
  const file = new File([blob], name, { type: blob.type || 'application/pdf' })

  if (
    isMobileDevice() &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    await navigator.share({ files: [file], title: name })
    return
  }

  const blobUrl = URL.createObjectURL(blob)
  try {
    if (isMobileDevice()) {
      window.location.assign(blobUrl)
      return
    }
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = name
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
  }
}

export function openDashboardPdfView (
  apiUrl: string,
  title?: string
): void {
  const href = documentViewerHref(apiUrl, title)
  if (isMobileDevice()) {
    window.location.assign(href)
    return
  }
  window.open(href, '_blank', 'noopener,noreferrer')
}
