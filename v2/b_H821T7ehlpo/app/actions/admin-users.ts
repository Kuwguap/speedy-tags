'use server'

import { createClient } from '@supabase/supabase-js'
import { getAdminEnvError, getSupabaseProjectUrl } from '@/lib/supabase/admin-env'

function adminClient () {
  const url = getSupabaseProjectUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export type AdminUserRow = {
  id: string
  email: string
  name: string
  phone: string
  member_since: string
  vehicle_id: string | null
  vehicle_name: string
  vin: string
  model_year: string
  vehicle_make: string
  vehicle_model: string
  trim_level: string
  body_class: string
  policy_number: string
  policy_effective_date: string
  policy_expiration_date: string
  policy_address: string
  annual_premium: number
  liability: boolean
  collision: boolean
  comprehensive: boolean
  uninsured_motorist: boolean
  medical_payments: boolean
  roadside_assistance: boolean
  insurance_card_pdf_path: string | null
}

export async function listAllUsersAction (): Promise<
  { ok: true; users: AdminUserRow[] } | { ok: false; message: string }
> {
  const envErr = getAdminEnvError()
  if (envErr) {
    return { ok: false, message: envErr }
  }

  const admin = adminClient()
  if (!admin) {
    return { ok: false, message: getAdminEnvError() ?? 'Could not create admin client.' }
  }

  const { data: profiles, error: pErr } = await admin.from('profiles').select('*')
  if (pErr) {
    return { ok: false, message: `profiles: ${pErr.message}` }
  }

  const list = profiles ?? []
  if (list.length === 0) {
    return { ok: true, users: [] }
  }

  const ids = list.map(p => p.id as string)

  const [{ data: vehicles, error: vErr }, { data: coverages, error: cErr }] = await Promise.all([
    admin.from('vehicles').select('*').in('user_id', ids),
    admin.from('coverage').select('*').in('user_id', ids),
  ])

  if (vErr) return { ok: false, message: `vehicles: ${vErr.message}` }
  if (cErr) return { ok: false, message: `coverage: ${cErr.message}` }

  const vehicleFirstByUser = new Map<string, Record<string, unknown>>()
  const sortedV = [...(vehicles ?? [])].sort(
    (a, b) =>
      new Date(String(a.created_at ?? 0)).getTime() -
      new Date(String(b.created_at ?? 0)).getTime()
  )
  for (const row of sortedV) {
    const uid = row.user_id as string
    if (!vehicleFirstByUser.has(uid)) {
      vehicleFirstByUser.set(uid, row as Record<string, unknown>)
    }
  }

  const coverageByUser = new Map<string, Record<string, unknown>>()
  for (const row of coverages ?? []) {
    coverageByUser.set(row.user_id as string, row as Record<string, unknown>)
  }

  const rows: AdminUserRow[] = list.map(p => {
    const id = p.id as string
    const v = vehicleFirstByUser.get(id)
    const c = coverageByUser.get(id)
    return {
      id,
      email: (p.email as string) ?? '',
      name: (p.name as string) ?? '',
      phone: (p.phone as string) ?? '',
      member_since: (p.member_since as string) ?? '',
      vehicle_id: (v?.id as string) ?? null,
      vehicle_name: (v?.vehicle_name as string) ?? '',
      vin: (v?.vin as string) ?? '',
      model_year: String(v?.model_year ?? ''),
      vehicle_make: String(v?.vehicle_make ?? ''),
      vehicle_model: String(v?.vehicle_model ?? ''),
      trim_level: String(v?.trim_level ?? ''),
      body_class: String(v?.body_class ?? ''),
      policy_number: (v?.policy_number as string) ?? '',
      policy_effective_date: (v?.policy_effective_date as string) ?? '',
      policy_expiration_date: (v?.policy_expiration_date as string) ?? '',
      policy_address: (v?.policy_address as string) ?? '',
      annual_premium: v?.annual_premium != null ? Number(v.annual_premium) : 0,
      liability: Boolean(c?.liability),
      collision: Boolean(c?.collision),
      comprehensive: Boolean(c?.comprehensive),
      uninsured_motorist: Boolean(c?.uninsured_motorist),
      medical_payments: Boolean(c?.medical_payments),
      roadside_assistance: Boolean(c?.roadside_assistance),
      insurance_card_pdf_path:
        (p as { insurance_card_pdf_path?: string | null }).insurance_card_pdf_path ?? null,
    }
  })

  return { ok: true, users: rows }
}

export type AdminUserUpdateInput = {
  userId: string
  email: string
  name: string
  phone: string
  memberSince: string
  vehicleName: string
  vin: string
  modelYear: string
  vehicleMake: string
  vehicleModel: string
  trimLevel: string
  bodyClass: string
  policyNumber: string
  policyEffectiveDate: string
  policyExpirationDate: string
  policyAddress: string
  annualPremium: number
  liability: boolean
  collision: boolean
  comprehensive: boolean
  uninsuredMotorist: boolean
  medicalPayments: boolean
  roadsideAssistance: boolean
  newPassword?: string
}

export async function updateUserByAdminAction (
  input: AdminUserUpdateInput
): Promise<{ ok: true } | { ok: false; message: string }> {
  const envErr = getAdminEnvError()
  if (envErr) return { ok: false, message: envErr }

  const admin = adminClient()
  if (!admin) return { ok: false, message: getAdminEnvError() ?? 'Admin client unavailable.' }

  const authPatch: { email: string; password?: string } = { email: input.email }
  if (input.newPassword && input.newPassword.length >= 6) {
    authPatch.password = input.newPassword
  }
  const { error: authErr } = await admin.auth.admin.updateUserById(input.userId, authPatch)
  if (authErr) return { ok: false, message: authErr.message }

  const { error: pErr } = await admin
    .from('profiles')
    .update({
      email: input.email,
      name: input.name,
      phone: input.phone,
      member_since: input.memberSince,
    })
    .eq('id', input.userId)

  if (pErr) return { ok: false, message: pErr.message }

  const { data: existingV } = await admin
    .from('vehicles')
    .select('id')
    .eq('user_id', input.userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (existingV?.id) {
    const { error: vErr } = await admin
      .from('vehicles')
      .update({
        vehicle_name: input.vehicleName,
        vin: input.vin,
        model_year: input.modelYear,
        vehicle_make: input.vehicleMake,
        vehicle_model: input.vehicleModel,
        trim_level: input.trimLevel,
        body_class: input.bodyClass,
        policy_number: input.policyNumber,
        policy_effective_date: input.policyEffectiveDate,
        policy_expiration_date: input.policyExpirationDate,
        policy_address: input.policyAddress,
        annual_premium: input.annualPremium,
      })
      .eq('id', existingV.id)
    if (vErr) return { ok: false, message: vErr.message }
  } else {
    const { error: vIns } = await admin.from('vehicles').insert({
      user_id: input.userId,
      vehicle_name: input.vehicleName,
      vin: input.vin,
      model_year: input.modelYear,
      vehicle_make: input.vehicleMake,
      vehicle_model: input.vehicleModel,
      trim_level: input.trimLevel,
      body_class: input.bodyClass,
      policy_number: input.policyNumber,
      policy_effective_date: input.policyEffectiveDate,
      policy_expiration_date: input.policyExpirationDate,
      policy_address: input.policyAddress,
      annual_premium: input.annualPremium,
    })
    if (vIns) return { ok: false, message: vIns.message }
  }

  const { error: cErr } = await admin
    .from('coverage')
    .update({
      liability: input.liability,
      collision: input.collision,
      comprehensive: input.comprehensive,
      uninsured_motorist: input.uninsuredMotorist,
      medical_payments: input.medicalPayments,
      roadside_assistance: input.roadsideAssistance,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', input.userId)

  if (cErr) return { ok: false, message: cErr.message }

  return { ok: true }
}
