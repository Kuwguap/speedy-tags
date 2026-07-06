/** Map low-level Supabase / fetch errors to operator-friendly messages. */
export function formatSupabaseClientError (message: string | undefined | null): string {
  const raw = String(message ?? '').trim()
  if (!raw) return 'Database request failed.'
  const lower = raw.toLowerCase()
  if (lower === 'fetch failed' || lower.includes('failed to fetch')) {
    return (
      'Cannot reach Supabase (project paused, wrong URL, or network error). ' +
      'In Supabase Dashboard, resume the project or update NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on Vercel, then redeploy.'
    )
  }
  if (lower.includes('invalid api key') || lower.includes('jwt')) {
    return 'Invalid Supabase service role key — update SUPABASE_SERVICE_ROLE_KEY on Vercel and redeploy.'
  }
  return raw
}
