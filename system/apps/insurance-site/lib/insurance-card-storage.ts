import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'insurance-cards'

/** Normalize a DB or URL value to `{userId}/object-name` when possible. */
export function normalizeInsuranceCardStoragePath (
  raw: string | null | undefined,
  userId: string
): string | null {
  const t = (raw ?? '').trim()
  if (!t) return null
  if (t.startsWith(`${userId}/`)) return t

  const fromUrl = t.match(/insurance-cards\/(.+)$/i)
  if (fromUrl?.[1]) {
    const path = fromUrl[1].replace(/^\/+/, '')
    return path.startsWith(`${userId}/`) ? path : `${userId}/${path}`
  }

  if (!t.includes('/') && !t.includes('://')) {
    return `${userId}/${t}`
  }

  return null
}

/** Candidate storage paths for a user's insurance card PDF (newest wins). */
export function insuranceCardPathCandidates (
  userId: string,
  opts: {
    vehicleId?: string | null
    storedPath?: string | null
    profilePath?: string | null
  } = {}
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const add = (p: string | null | undefined) => {
    const normalized = normalizeInsuranceCardStoragePath(p, userId)
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    out.push(normalized)
  }

  add(opts.storedPath)
  if (opts.vehicleId) {
    add(`${userId}/vehicle-${opts.vehicleId}.pdf`)
    add(`${userId}/vehicle-${opts.vehicleId}.PDF`)
    if (
      opts.profilePath &&
      opts.profilePath.includes(`/vehicle-${opts.vehicleId}`)
    ) {
      add(opts.profilePath)
    }
  } else {
    add(opts.profilePath)
    add(`${userId}/insurance-card.pdf`)
    add(`${userId}/insurance-card.PDF`)
  }

  return out
}

function fileNameFromPath (path: string, userId: string): string {
  const prefix = `${userId}/`
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

function folderHasObject (
  names: Set<string>,
  objectName: string
): boolean {
  if (names.has(objectName)) return true
  const lower = objectName.toLowerCase()
  for (const n of names) {
    if (n.toLowerCase() === lower) return true
  }
  return false
}

/**
 * Resolve the storage object path for a member's insurance card. Tries explicit
 * DB paths first, then conventional `vehicle-{id}.pdf` / `insurance-card.pdf`
 * filenames, then any PDF under `{userId}/` in the bucket.
 *
 * When `vehicleId` is set, only that vehicle's card is returned — never another
 * vehicle's PDF or a legacy account-level fallback.
 */
export async function resolveInsuranceCardStoragePath (
  admin: SupabaseClient,
  userId: string,
  opts: {
    vehicleId?: string | null
    storedPath?: string | null
    profilePath?: string | null
  } = {}
): Promise<string | null> {
  const { data: files, error } = await admin.storage.from(BUCKET).list(userId)
  if (error) return null

  const objectNames = new Set((files ?? []).map(f => f.name))
  const pdfs = (files ?? [])
    .filter(f => /\.pdf$/i.test(f.name))
    .map(f => f.name)

  for (const candidate of insuranceCardPathCandidates(userId, opts)) {
    if (!candidate.startsWith(`${userId}/`)) continue
    const name = fileNameFromPath(candidate, userId)
    if (folderHasObject(objectNames, name)) return candidate
  }

  if (!pdfs.length) return null

  if (opts.vehicleId) {
    const vid = opts.vehicleId
    const match = pdfs.find(
      name =>
        name.includes(`vehicle-${vid}`) ||
        name.toLowerCase() === `vehicle-${vid}.pdf`
    )
    return match ? `${userId}/${match}` : null
  }

  const legacy = pdfs.find(name => /insurance-card\.pdf$/i.test(name))
  if (legacy) return `${userId}/${legacy}`

  return `${userId}/${pdfs[0]}`
}
