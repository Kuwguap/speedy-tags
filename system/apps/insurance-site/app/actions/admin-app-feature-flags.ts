'use server'

import { createClient } from '@supabase/supabase-js'
import { getAdminEnvError, getSupabaseProjectUrl } from '@/lib/supabase/admin-env'
import { revalidatePath } from 'next/cache'

function adminClient () {
  const url = getSupabaseProjectUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function getAppFeatureFlagsAction (): Promise<
  { ok: true; dashboardCoverageSectionVisible: boolean } | { ok: false; message: string }
> {
  if (getAdminEnvError()) {
    return { ok: false, message: getAdminEnvError()! }
  }
  const admin = adminClient()
  if (!admin) {
    return { ok: false, message: getAdminEnvError() ?? 'Admin client unavailable.' }
  }

  const { data, error } = await admin
    .from('app_feature_flags')
    .select('dashboard_coverage_section_visible')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    return { ok: false, message: error.message }
  }
  if (!data) {
    return { ok: true, dashboardCoverageSectionVisible: true }
  }
  return {
    ok: true,
    dashboardCoverageSectionVisible:
      (data as { dashboard_coverage_section_visible: boolean })
        .dashboard_coverage_section_visible !== false,
  }
}

export async function setDashboardCoverageSectionVisibleAction (visible: boolean): Promise<
  { ok: true } | { ok: false; message: string }
> {
  if (getAdminEnvError()) {
    return { ok: false, message: getAdminEnvError()! }
  }
  const admin = adminClient()
  if (!admin) {
    return { ok: false, message: getAdminEnvError() ?? 'Admin client unavailable.' }
  }

  const { error } = await admin
    .from('app_feature_flags')
    .upsert(
      { id: 1, dashboard_coverage_section_visible: visible },
      { onConflict: 'id' }
    )

  if (error) {
    return { ok: false, message: error.message }
  }
  revalidatePath('/dashboard')
  revalidatePath('/admin')
  return { ok: true }
}
