/** Safe basename for insurance card download: "Jane Doe" + extension from storage path. */

export function insuranceCardDownloadFilename (
  displayName: string,
  storagePath?: string | null
): string {
  const cleaned = displayName
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 180)
    .trim()

  const base = cleaned.length > 0 ? cleaned : 'insurance-card'

  const lower = (storagePath ?? '').toLowerCase()
  let ext = 'pdf'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) ext = 'jpg'
  else if (lower.endsWith('.png')) ext = 'png'
  else if (lower.endsWith('.webp')) ext = 'webp'
  else if (lower.endsWith('.gif')) ext = 'gif'
  else if (lower.endsWith('.pdf')) ext = 'pdf'

  return `${base}.${ext}`
}
