import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { contentDispositionHeader } from '@/lib/content-disposition'
import {
  buildPolicyDeclarationPdf,
  type CoverageDeclLine,
  type PolicyDeclarationVehicle,
} from '@/lib/pdf/policy-declaration'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_MONTHLY_PREMIUM_CENTS = 10000

const DEFAULT_ISSUER = {
  name: 'TRI STATE COVERAGE INC',
  address: ['1 N Central Rd 6th Fl Ste 629', 'Fort Lee, NJ 07024'],
  phone: '(201) 555-0199',
}

function dollarLabel (cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`
}

function planTermLabel (planKey: string): string {
  switch (planKey) {
    case '1m':
      return '1 month'
    case '6m':
      return '6 months'
    case '12m':
      return '12 months'
    case 'monthly':
      return 'Monthly (recurring)'
    default:
      return planKey || '—'
  }
}

function monthsForPlanKey (planKey: string): number {
  switch (planKey) {
    case '12m':
      return 12
    case '6m':
      return 6
    default:
      return 1
  }
}

function formatDateLabel (iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

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

type PolicyRow = {
  id: string
  policy_number: string
  plan_key: string
  monthly_premium_cents: number
  effective_date: string
  renewal_date: string
  current_period_end: string
  vehicle_id: string | null
}

type VehicleRow = {
  id: string
  vehicle_name?: string
  vin?: string
  model_year?: string
  vehicle_make?: string
  vehicle_model?: string
  trim_level?: string
  body_class?: string
  policy_number?: string
  policy_effective_date?: string
  policy_expiration_date?: string
  annual_premium?: number
}

function buildVehicleDeclaration (
  vehicle: VehicleRow,
  policy: PolicyRow | null
): PolicyDeclarationVehicle {
  const monthlyCents =
    policy && policy.monthly_premium_cents > 0
      ? policy.monthly_premium_cents
      : DEFAULT_MONTHLY_PREMIUM_CENTS
  const planKey = policy?.plan_key ?? '1m'
  const effIso =
    policy?.effective_date ??
    parseLooseDateToIso(vehicle.policy_effective_date) ??
    ''
  const expIso =
    policy?.renewal_date ??
    parseLooseDateToIso(vehicle.policy_expiration_date) ??
    ''

  return {
    policyNumber: policy?.policy_number ?? vehicle.policy_number ?? '—',
    termLabel: planTermLabel(planKey),
    monthlyPremiumLabel: dollarLabel(monthlyCents),
    effectiveLabel: formatDateLabel(effIso),
    expirationLabel: formatDateLabel(expIso),
    year: vehicle.model_year ?? '',
    make: vehicle.vehicle_make ?? '',
    model: vehicle.vehicle_model ?? '',
    trim: vehicle.trim_level ?? '',
    vin: vehicle.vin ?? '—',
    bodyClass: vehicle.body_class ?? '',
  }
}

/**
 * Streams the Policy Declaration PDF for every vehicle on the signed-in account.
 * Use `?inline=1` to open in-tab; default sends as an attachment.
 */
export async function GET (request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 })
  }

  const [profileRes, policiesRes, vehiclesRes, coverageRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('policies')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'pending'])
      .order('created_at', { ascending: true }),
    supabase
      .from('vehicles')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
    supabase.from('coverage').select('*').eq('user_id', user.id).maybeSingle(),
  ])

  const profile = profileRes.data as
    | {
        name: string
        email: string
        phone: string
        billing_address_line1?: string
        billing_address_line2?: string
        billing_city?: string
        billing_state?: string
        billing_postal_code?: string
        billing_country?: string
      }
    | null
  if (!profile) {
    return NextResponse.json({ ok: false, error: 'Profile missing.' }, { status: 404 })
  }

  const vehicleRows = (vehiclesRes.data ?? []) as VehicleRow[]
  const policyRows = (policiesRes.data ?? []) as PolicyRow[]

  if (vehicleRows.length === 0 && policyRows.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'No policy on file yet — purchase coverage first.' },
      { status: 404 }
    )
  }

  const policyByVehicleId = new Map<string, PolicyRow>()
  const policyByNumber = new Map<string, PolicyRow>()
  for (const p of policyRows) {
    if (p.vehicle_id) policyByVehicleId.set(String(p.vehicle_id), p)
    if (p.policy_number) policyByNumber.set(p.policy_number, p)
  }

  const declarationVehicles: PolicyDeclarationVehicle[] = []
  let accountMonthlyCents = 0
  let accountTermTotalCents = 0

  if (vehicleRows.length > 0) {
    for (const veh of vehicleRows) {
      const linked =
        policyByVehicleId.get(String(veh.id)) ??
        (veh.policy_number ? policyByNumber.get(veh.policy_number) : null) ??
        null
      declarationVehicles.push(buildVehicleDeclaration(veh, linked))
      const monthly =
        linked && linked.monthly_premium_cents > 0
          ? linked.monthly_premium_cents
          : DEFAULT_MONTHLY_PREMIUM_CENTS
      accountMonthlyCents += monthly
      accountTermTotalCents += monthly * monthsForPlanKey(linked?.plan_key ?? '1m')
    }
  } else {
    for (const pol of policyRows) {
      declarationVehicles.push(
        buildVehicleDeclaration(
          {
            id: pol.vehicle_id ?? pol.id,
            policy_number: pol.policy_number,
          },
          pol
        )
      )
      const monthly =
        pol.monthly_premium_cents > 0
          ? pol.monthly_premium_cents
          : DEFAULT_MONTHLY_PREMIUM_CENTS
      accountMonthlyCents += monthly
      accountTermTotalCents += monthly * monthsForPlanKey(pol.plan_key)
    }
  }

  const cov = coverageRes.data as
    | {
        liability?: boolean
        collision?: boolean
        comprehensive?: boolean
        uninsured_motorist?: boolean
        medical_payments?: boolean
        roadside_assistance?: boolean
      }
    | null

  const coverages: CoverageDeclLine[] = [
    { label: 'Liability', value: cov?.liability ? 'Included' : 'Not selected' },
    { label: 'Collision', value: cov?.collision ? 'Included' : 'Not selected' },
    { label: 'Comprehensive', value: cov?.comprehensive ? 'Included' : 'Not selected' },
    {
      label: 'Uninsured motorist',
      value: cov?.uninsured_motorist ? 'Included' : 'Not selected',
    },
    {
      label: 'Medical payments',
      value: cov?.medical_payments ? 'Included' : 'Not selected',
    },
    {
      label: 'Roadside assistance',
      value: cov?.roadside_assistance ? 'Included' : 'Not selected',
    },
  ]

  const pdfBytes = await buildPolicyDeclarationPdf({
    accountMonthlyPremiumLabel: dollarLabel(accountMonthlyCents),
    accountTotalForTermLabel: dollarLabel(accountTermTotalCents),

    insuredName: profile.name || '—',
    insuredEmail: profile.email,
    insuredPhone: profile.phone || '—',

    billingAddress: {
      line1: profile.billing_address_line1 ?? '',
      line2: profile.billing_address_line2 ?? '',
      city: profile.billing_city ?? '',
      state: profile.billing_state ?? '',
      postalCode: profile.billing_postal_code ?? '',
      country: profile.billing_country ?? 'US',
    },

    vehicles: declarationVehicles,
    coverages,
    issuer: DEFAULT_ISSUER,
    generatedAtIso: new Date().toISOString(),
  })

  const inline = request.nextUrl.searchParams.get('inline') === '1'
  const primaryPolicy = declarationVehicles[0]?.policyNumber ?? 'account'
  const filename = `policy-declaration-${primaryPolicy}.pdf`

  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDispositionHeader(filename, inline),
      'Cache-Control': 'no-store',
    },
  })
}
