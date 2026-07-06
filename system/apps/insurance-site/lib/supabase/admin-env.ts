/** Used by server actions for admin (service role). Not a Server Actions file. */

export function getSupabaseProjectUrl (): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    undefined
  )
}

export function getAdminEnvError (): string | null {
  const url = getSupabaseProjectUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url && !key) {
    return 'Missing Supabase URL and service role key. Add NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY to Vercel → Settings → Environment Variables, then redeploy.'
  }
  if (!url) {
    return 'Missing Supabase project URL. Add NEXT_PUBLIC_SUPABASE_URL (recommended for the browser) or SUPABASE_URL to your environment and redeploy.'
  }
  if (!key) {
    return 'Missing SUPABASE_SERVICE_ROLE_KEY. Add it in Vercel → Settings → Environment Variables (Production), then redeploy. Never expose this key to the client.'
  }
  return null
}
