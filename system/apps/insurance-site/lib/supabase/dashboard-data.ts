import type { SupabaseClient } from '@supabase/supabase-js'
import {
  monthlyPremiumCentsForPlanKey,
  planKeyForMonthCount,
  resolveTermPremiumCents,
} from '@/lib/billing/plan-pricing'

export interface DashboardUser {
  id: string
  email: string
  name: string
  phone: string
  memberSince: string
}

export interface BillingAddress {
  line1: string
  line2: string
  city: string
  state: string
  postalCode: string
  country: string
}

export interface DashboardPolicy {
  id: string
  policyNumber: string
  planKey: string
  status: 'active' | 'lapsed' | 'cancelled' | 'pending'
  monthlyPremiumCents: number
  effectiveDateIso: string
  renewalDateIso: string
  currentPeriodEndIso: string
  autopayEnabled: boolean
  /** vehicle_id from `policies.vehicle_id`, when populated. */
  vehicleId: string | null
}

/**
 * Floor for the monthly premium when the policy row has no explicit price.
 * Uses standard plan pricing: $100 / $500 / $900 term totals by plan length.
 */
export const DEFAULT_MONTHLY_PREMIUM_CENTS = monthlyPremiumCentsForPlanKey('1m')

export interface DashboardInvoice {
  id: string
  periodLabel: string
  dueDateIso: string
  amountCents: number
  status: 'due' | 'pending' | 'paid' | 'failed' | 'refunded' | 'void'
  paidAtIso: string | null
}

export interface CoverageOptionsMapped {
  liability: boolean
  collision: boolean
  comprehensive: boolean
  uninsuredMotorist: boolean
  medicalPayments: boolean
  roadsideAssistance: boolean
}

export interface DashboardInsuranceData {
  /** Present when the row comes from a real `vehicles` row, absent for legacy fallback. */
  vehicleId?: string
  vehicleName: string
  vin: string
  /** From VIN decode or manual entry */
  modelYear: string
  vehicleMake: string
  vehicleModel: string
  trimLevel: string
  bodyClass: string
  coverage: CoverageOptionsMapped
  premium: number
  policyNumber: string
  policyEffectiveDate: string
  policyExpirationDate: string
  policyAddress: string
  /** Storage path inside bucket `insurance-cards`, or null */
  insuranceCardPdfPath: string | null
}

type VehicleRow = {
  id?: string
  vehicle_name?: string
  vin?: string
  model_year?: string
  vehicle_make?: string
  vehicle_model?: string
  trim_level?: string
  body_class?: string
  policy_number?: string
  annual_premium?: number
  policy_effective_date?: string
  policy_expiration_date?: string
  policy_address?: string
  /** Present after the `20260704200000_multi_vehicle_support` migration. */
  insurance_card_pdf_path?: string | null
}

type PolicyRow = {
  id: string
  policy_number: string
  plan_key: string
  status: DashboardPolicy['status']
  monthly_premium_cents: number
  effective_date: string
  renewal_date: string
  current_period_end: string
  autopay_enabled: boolean
  vehicle_id?: string | null
}

export type DashboardRow = {
  user: DashboardUser
  insuranceData: DashboardInsuranceData
  /**
   * Every vehicle on the account, oldest first. Multi-vehicle customers
   * (added by /api/integrations/clients when the email already exists) will
   * have more than one entry; single-vehicle customers get a single-element
   * array with the same row as {@link insuranceData}.
   */
  vehicles: DashboardInsuranceData[]
  /** When false, hide the "Your coverage" section on the member dashboard. */
  showDashboardCoverageSection: boolean
  billingAddress: BillingAddress
  /** Most recently created active/pending policy — used by legacy single-policy UI. */
  activePolicy: DashboardPolicy | null
  /** All active/pending policies for this user, newest first. */
  activePolicies: DashboardPolicy[]
  /** Sum of monthly premiums across all active/pending policies. */
  totalMonthlyPremiumCents: number
  /**
   * Oldest unpaid invoice (`due` / `failed` / `pending`) — drives Pay Now.
   * `null` when everything is settled.
   */
  openInvoice: DashboardInvoice | null
  /** Every unpaid invoice on the account, oldest due-date first. */
  openInvoices: DashboardInvoice[]
  /** Sum of `amountCents` across every {@link openInvoices} row. */
  openInvoicesTotalCents: number
  billingHistory: DashboardInvoice[]
}

export async function fetchDashboardForUser (
  supabase: SupabaseClient,
  userId: string
): Promise<DashboardRow | null> {
  const [
    profileRes,
    vehiclesRes,
    covRes,
    flagsRes,
    activePoliciesRes,
    openInvoiceRes,
    historyRes,
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase
      .from('vehicles')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
    supabase.from('coverage').select('*').eq('user_id', userId).maybeSingle(),
    supabase
      .from('app_feature_flags')
      .select('dashboard_coverage_section_visible')
      .eq('id', 1)
      .maybeSingle(),
    supabase
      .from('policies')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'pending'])
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['due', 'failed', 'pending'])
      .order('due_date', { ascending: true }),
    supabase
      .from('invoices')
      .select('*')
      .eq('user_id', userId)
      .order('due_date', { ascending: false })
      .limit(24),
  ])

  const { data: profile, error: profileError } = profileRes
  if (profileError || !profile) return null

  const vehicleRows = (vehiclesRes.data ?? []) as VehicleRow[]
  const vehicle = vehicleRows[0]
  const { data: cov } = covRes

  const coverage: CoverageOptionsMapped = cov
    ? {
        liability: cov.liability,
        collision: cov.collision,
        comprehensive: cov.comprehensive,
        uninsuredMotorist: cov.uninsured_motorist,
        medicalPayments: cov.medical_payments,
        roadsideAssistance: cov.roadside_assistance,
      }
    : {
        liability: false,
        collision: false,
        comprehensive: false,
        uninsuredMotorist: false,
        medicalPayments: false,
        roadsideAssistance: false,
      }

  const user: DashboardUser = {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    phone: profile.phone,
    memberSince: profile.member_since,
  }

  const profileCardPath =
    (profile as { insurance_card_pdf_path?: string | null }).insurance_card_pdf_path ?? null

  const veh = vehicle

  function mapVehicleRow (
    row: VehicleRow,
    fallbackCardPath: string | null,
    isPrimaryVehicle: boolean
  ): DashboardInsuranceData {
    const rowPath = row.insurance_card_pdf_path ?? null
    const profileForRow =
      fallbackCardPath &&
      row.id &&
      fallbackCardPath.includes(`/vehicle-${row.id}`)
        ? fallbackCardPath
        : null
    const legacyProfile =
      isPrimaryVehicle &&
      fallbackCardPath &&
      !fallbackCardPath.includes('/vehicle-')
        ? fallbackCardPath
        : null
    return {
      vehicleId: row.id ? String(row.id) : undefined,
      vehicleName: row.vehicle_name ?? '—',
      vin: row.vin ?? '—',
      modelYear: String(row.model_year ?? '').trim(),
      vehicleMake: String(row.vehicle_make ?? '').trim(),
      vehicleModel: String(row.vehicle_model ?? '').trim(),
      trimLevel: String(row.trim_level ?? '').trim(),
      bodyClass: String(row.body_class ?? '').trim(),
      policyNumber: row.policy_number ?? '—',
      premium: Number(row.annual_premium ?? 0),
      policyEffectiveDate: row.policy_effective_date?.trim() || '—',
      policyExpirationDate: row.policy_expiration_date?.trim() || '—',
      policyAddress: row.policy_address?.trim() || '—',
      coverage,
      insuranceCardPdfPath: rowPath ?? profileForRow ?? legacyProfile,
    }
  }

  const vehicles: DashboardInsuranceData[] = vehicleRows.length
    ? vehicleRows.map((row, idx) => mapVehicleRow(row, profileCardPath, idx === 0))
    : []

  const insuranceData: DashboardInsuranceData =
    vehicles[0] ??
    ({
      vehicleName: '—',
      vin: '—',
      modelYear: '',
      vehicleMake: '',
      vehicleModel: '',
      trimLevel: '',
      bodyClass: '',
      policyNumber: '—',
      premium: 0,
      policyEffectiveDate: '—',
      policyExpirationDate: '—',
      policyAddress: '—',
      coverage,
      insuranceCardPdfPath: profileCardPath,
    } satisfies DashboardInsuranceData)

  const flagRow = flagsRes.data as
    | { dashboard_coverage_section_visible?: boolean }
    | null
    | undefined
  const showDashboardCoverageSection =
    flagRow?.dashboard_coverage_section_visible !== false

  const profileRow = profile as {
    billing_address_line1?: string
    billing_address_line2?: string
    billing_city?: string
    billing_state?: string
    billing_postal_code?: string
    billing_country?: string
  }
  const billingAddress: BillingAddress = {
    line1: profileRow.billing_address_line1 ?? '',
    line2: profileRow.billing_address_line2 ?? '',
    city: profileRow.billing_city ?? '',
    state: profileRow.billing_state ?? '',
    postalCode: profileRow.billing_postal_code ?? '',
    country: profileRow.billing_country ?? 'US',
  }

  const policyRows = (activePoliciesRes.data ?? []) as PolicyRow[]
  const activePolicies: DashboardPolicy[] = policyRows.map(r => {
    const effective = r.effective_date
    const renewal = r.renewal_date
    return {
      id: r.id,
      policyNumber: r.policy_number,
      planKey: r.plan_key,
      status: r.status,
      monthlyPremiumCents:
        r.monthly_premium_cents > 0
          ? r.monthly_premium_cents
          : monthlyPremiumCentsForPlanKey(r.plan_key),
      effectiveDateIso: effective,
      renewalDateIso: renewal,
      currentPeriodEndIso: resolveCurrentPeriodEnd(
        effective,
        renewal,
        r.current_period_end
      ),
      autopayEnabled: r.autopay_enabled,
      vehicleId: r.vehicle_id ? String(r.vehicle_id) : null,
    }
  })

  // Ensure every vehicle row has a displayable policy — even when only the
  // first car has a `policies` row (common for accounts created before
  // multi-vehicle support). Without this, the dashboard only shows one card.
  const matchedVehicleIds = new Set(
    activePolicies.map(p => p.vehicleId).filter((id): id is string => !!id)
  )
  const matchedPolicyNumbers = new Set(
    activePolicies.map(p => p.policyNumber).filter(Boolean)
  )
  for (const legacyVeh of vehicleRows) {
    const vid = legacyVeh.id ? String(legacyVeh.id) : null
    const polNum = legacyVeh.policy_number?.trim()
    if (vid && matchedVehicleIds.has(vid)) continue
    if (polNum && polNum !== '—' && matchedPolicyNumbers.has(polNum)) continue
    const synthetic = synthesizePolicyFromVehicleRow(legacyVeh, userId)
    if (!synthetic) continue
    activePolicies.push(synthetic)
    if (synthetic.vehicleId) matchedVehicleIds.add(synthetic.vehicleId)
    if (synthetic.policyNumber) matchedPolicyNumbers.add(synthetic.policyNumber)
  }

  const primaryVehicleId = vehicleRows[0]?.id ? String(vehicleRows[0].id) : null
  const activePolicy: DashboardPolicy | null =
    (primaryVehicleId
      ? activePolicies.find(p => p.vehicleId === primaryVehicleId)
      : null) ??
    activePolicies.find(p => p.status === 'active' || p.status === 'pending') ??
    activePolicies[0] ??
    null
  const totalMonthlyPremiumCents = activePolicies.reduce(
    (sum, p) => sum + Math.max(0, p.monthlyPremiumCents),
    0
  )

  type InvRow = {
    id: string
    period_label: string
    due_date: string
    amount_cents: number
    status: DashboardInvoice['status']
    paid_at: string | null
  }
  const mapInv = (r: InvRow): DashboardInvoice => ({
    id: r.id,
    periodLabel: r.period_label,
    dueDateIso: r.due_date,
    amountCents: r.amount_cents,
    status: r.status,
    paidAtIso: r.paid_at,
  })

  const openInvoiceRows = (openInvoiceRes.data ?? []) as InvRow[]
  const openInvoices: DashboardInvoice[] = openInvoiceRows.map(mapInv)
  const openInvoice: DashboardInvoice | null = openInvoices[0] ?? null
  const openInvoicesTotalCents = openInvoices.reduce(
    (sum, inv) => sum + Math.max(0, inv.amountCents),
    0
  )

  const historyRows = (historyRes.data ?? []) as InvRow[]
  const billingHistory = historyRows.map(mapInv)

  return {
    user,
    insuranceData,
    vehicles,
    showDashboardCoverageSection,
    billingAddress,
    activePolicy,
    activePolicies,
    totalMonthlyPremiumCents,
    openInvoice,
    openInvoices,
    openInvoicesTotalCents,
    billingHistory,
  }
}

/**
 * Parse a free-form date ("April 11, 2026", "04/11/2026", or ISO) to
 * `YYYY-MM-DD`. Returns null when blank, "—", or unparseable.
 */
function parseLooseDateToIso (s: string | null | undefined): string | null {
  const t = (s ?? '').trim()
  if (!t || t === '—') return null
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return null
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** Whole-month difference between two YYYY-MM-DD strings (≥ 1). */
function monthsBetweenLoose (effIso: string, expIso: string): number {
  const a = new Date(`${effIso}T00:00:00Z`).getTime()
  const b = new Date(`${expIso}T00:00:00Z`).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 1
  const months = (b - a) / (1000 * 60 * 60 * 24 * 30.4375)
  return Math.max(1, Math.round(months))
}

function addMonthsToIsoDate (iso: string, months: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  d.setUTCMonth(d.getUTCMonth() + Math.max(0, months))
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** First monthly billing period end — one month from effective, capped at renewal. */
function currentPeriodEndForTerm (effectiveIso: string, renewalIso: string): string {
  const termMonths = monthsBetweenLoose(effectiveIso, renewalIso)
  if (termMonths <= 1) return renewalIso
  const firstPeriodEnd = addMonthsToIsoDate(effectiveIso, 1)
  return firstPeriodEnd <= renewalIso ? firstPeriodEnd : renewalIso
}

/**
 * Prefer a recomputed period end when legacy rows stored the full renewal date
 * in `current_period_end` for multi-month policies.
 */
function resolveCurrentPeriodEnd (
  effectiveIso: string,
  renewalIso: string,
  storedPeriodEnd: string
): string {
  const recomputed = currentPeriodEndForTerm(effectiveIso, renewalIso)
  if (
    storedPeriodEnd &&
    storedPeriodEnd === renewalIso &&
    recomputed !== renewalIso
  ) {
    return recomputed
  }
  return storedPeriodEnd || recomputed
}

function synthesizePolicyFromVehicleRow (
  legacyVeh: VehicleRow,
  userId: string
): DashboardPolicy | null {
  if (!legacyVeh?.policy_number || legacyVeh.policy_number === '—') return null
  const effIso = parseLooseDateToIso(legacyVeh.policy_effective_date)
  const expIso = parseLooseDateToIso(legacyVeh.policy_expiration_date)
  if (!effIso || !expIso) return null
  const months = monthsBetweenLoose(effIso, expIso)
  const planKey = planKeyForMonthCount(months)
  const annualCents = Math.max(0, Math.round((Number(legacyVeh.annual_premium) || 0) * 100))
  const totalCents = annualCents > 0
    ? annualCents
    : resolveTermPremiumCents({ planKey, annualPremiumDollars: 0 })
  const rawMonthly = months > 0 ? Math.round(totalCents / months) : totalCents
  const monthlyCents = rawMonthly > 0 ? rawMonthly : monthlyPremiumCentsForPlanKey(planKey)
  const expired = new Date(`${expIso}T00:00:00Z`).getTime() < Date.now()
  return {
    id: `legacy:${legacyVeh.id ?? userId}`,
    policyNumber: String(legacyVeh.policy_number),
    planKey,
    status: expired ? 'lapsed' : 'active',
    monthlyPremiumCents: monthlyCents,
    effectiveDateIso: effIso,
    renewalDateIso: expIso,
    currentPeriodEndIso: currentPeriodEndForTerm(effIso, expIso),
    autopayEnabled: false,
    vehicleId: legacyVeh.id ? String(legacyVeh.id) : null,
  }
}
