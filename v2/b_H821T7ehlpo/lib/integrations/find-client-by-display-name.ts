import type { SupabaseClient } from '@supabase/supabase-js'

/** Normalize for case-insensitive full-name equality (single spaces). */
export function normalizePersonName (s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

export type ProfileStub = {
  id: string
  email: string
  name: string
}

/**
 * Finds profiles whose display name matches exactly (after normalization).
 * Loads profiles in pages to avoid huge single responses on large DBs.
 */
export async function findProfilesByDisplayName (
  admin: SupabaseClient,
  displayName: string
): Promise<ProfileStub[]> {
  const target = normalizePersonName(displayName)
  if (!target) return []

  const matches: ProfileStub[] = []
  const pageSize = 1000
  let from = 0

  for (;;) {
    const { data, error } = await admin
      .from('profiles')
      .select('id, email, name')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw error
    const rows = data ?? []
    if (rows.length === 0) break

    for (const p of rows) {
      if (normalizePersonName(String(p.name ?? '')) === target) {
        matches.push({
          id: p.id as string,
          email: String(p.email ?? ''),
          name: String(p.name ?? ''),
        })
      }
    }

    if (rows.length < pageSize) break
    from += pageSize
  }

  return matches
}
