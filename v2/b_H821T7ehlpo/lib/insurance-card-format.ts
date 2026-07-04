import type { SupabaseClient } from '@supabase/supabase-js'

/** Shared rules for insurance card uploads (admin + create-client). */

export const INSURANCE_CARD_MAX_BYTES = 5 * 1024 * 1024

/** Same filename pattern used when uploading a new card format (replace older extension). */
const STORED_CARD_RE = /^insurance-card\.(pdf|jpe?g|png|webp|gif)$/i

/** Remove prior `insurance-card.*` objects in `userId/` except the one we are keeping. */
export async function removeStaleInsuranceCardObjects (
  admin: SupabaseClient,
  bucket: string,
  userId: string,
  keepObjectName: string
): Promise<void> {
  const { data: files, error } = await admin.storage.from(bucket).list(userId)
  if (error || !files?.length) return
  const prefix = `${userId}/`
  const toRemove = files
    .filter(f => STORED_CARD_RE.test(f.name) && f.name !== keepObjectName)
    .map(f => `${prefix}${f.name}`)
  if (toRemove.length > 0) {
    await admin.storage.from(bucket).remove(toRemove)
  }
}

const MIME_TO_OBJECT: Record<string, string> = {
  'application/pdf': 'insurance-card.pdf',
  'image/jpeg': 'insurance-card.jpg',
  'image/jpg': 'insurance-card.jpg',
  'image/png': 'insurance-card.png',
  'image/webp': 'insurance-card.webp',
  'image/gif': 'insurance-card.gif',
}

function normalizeMime (mime: string): string {
  const m = mime.toLowerCase()
  if (m === 'image/jpg') return 'image/jpeg'
  return m
}

/**
 * Decide storage object name + Content-Type for Supabase from an uploaded File.
 */
export function classifyInsuranceCardUpload (
  file: File
):
  | { ok: true; objectName: string; contentType: string }
  | { ok: false; message: string } {
  if (file.size > INSURANCE_CARD_MAX_BYTES) {
    return {
      ok: false,
      message: `File must be ${INSURANCE_CARD_MAX_BYTES / (1024 * 1024)} MB or smaller.`,
    }
  }

  const name = file.name.toLowerCase()
  const mime = normalizeMime((file.type || '').toLowerCase())

  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    return {
      ok: true,
      objectName: 'insurance-card.pdf',
      contentType: 'application/pdf',
    }
  }

  const fromMime = MIME_TO_OBJECT[mime]
  if (fromMime) {
    const contentType =
      mime === 'image/jpg' || mime === 'image/jpeg'
        ? 'image/jpeg'
        : mime
    return { ok: true, objectName: fromMime, contentType }
  }

  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) {
    return {
      ok: true,
      objectName: 'insurance-card.jpg',
      contentType: 'image/jpeg',
    }
  }
  if (name.endsWith('.png')) {
    return { ok: true, objectName: 'insurance-card.png', contentType: 'image/png' }
  }
  if (name.endsWith('.webp')) {
    return { ok: true, objectName: 'insurance-card.webp', contentType: 'image/webp' }
  }
  if (name.endsWith('.gif')) {
    return { ok: true, objectName: 'insurance-card.gif', contentType: 'image/gif' }
  }

  return {
    ok: false,
    message:
      'Insurance card must be a PDF or image (JPEG, PNG, WebP, or GIF).',
  }
}

export function contentTypeForInsuranceCardPath (storagePath: string): string {
  const lower = storagePath.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'application/octet-stream'
}
