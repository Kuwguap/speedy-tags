import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'insurance-cards'

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
    const t = (p ?? '').trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    out.push(t)
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

async function storageObjectExists (
  admin: SupabaseClient,
  path: string
): Promise<boolean> {
  const { data, error } = await admin.storage.from(BUCKET).download(path)
  return !error && !!data
}

/**
 * Resolve the storage object path for a member's insurance card. Tries explicit
 * DB paths first, then conventional `vehicle-{id}.pdf` / `insurance-card.pdf`
 * filenames, then any PDF under `{userId}/` in the bucket.
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
  for (const candidate of insuranceCardPathCandidates(userId, opts)) {
    if (!candidate.startsWith(`${userId}/`)) continue
    if (await storageObjectExists(admin, candidate)) return candidate
  }

  const { data: files, error } = await admin.storage.from(BUCKET).list(userId)
  if (error || !files?.length) return null

  const pdfs = files
    .filter(f => /\.pdf$/i.test(f.name))
    .map(f => `${userId}/${f.name}`)

  if (opts.vehicleId) {
    const vid = opts.vehicleId
    const match = pdfs.find(
      p =>
        p.includes(`vehicle-${vid}`) ||
        p.toLowerCase().endsWith(`vehicle-${vid}.pdf`)
    )
    if (match) return match
  }

  const legacy = pdfs.find(p => /insurance-card\.pdf$/i.test(p))
  if (legacy) return legacy

  return pdfs[0] ?? null
}
