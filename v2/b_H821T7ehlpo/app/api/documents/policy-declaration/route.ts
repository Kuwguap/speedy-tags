import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildPolicyDeclarationPdf, type CoverageDeclLine } from '@/lib/pdf/policy-declaration'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

/**
 * Streams the Policy Declaration PDF for the signed-in user's active policy.
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

  const [profileRes, policyRes, vehicleRes, coverageRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('policies')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('vehicles')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
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

  const policy = policyRes.data as
    | {
        policy_number: string
        plan_key: string
        monthly_premium_cents: number
        effective_date: string
        renewal_date: string
        current_period_start: string
        current_period_end: string
      }
    | null

  if (!policy) {
    return NextResponse.json(
      { ok: false, error: 'No policy on file yet — purchase coverage first.' },
      { status: 404 }
    )
  }

  const vehicle = vehicleRes.data as
    | {
        vehicle_name?: string
        vin?: string
        model_year?: string
        vehicle_make?: string
        vehicle_model?: string
        trim_level?: string
        body_class?: string
      }
    | null

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

  const monthsForTerm = (() => {
    switch (policy.plan_key) {
      case '1m':
        return 1
      case '6m':
        return 6
      case '12m':
        return 12
      default:
        return 1
    }
  })()

  const pdfBytes = await buildPolicyDeclarationPdf({
    policyNumber: policy.policy_number,
    effectiveLabel: new Date(policy.effective_date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    expirationLabel: new Date(policy.current_period_end).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    termLabel: planTermLabel(policy.plan_key),
    monthlyPremiumLabel: dollarLabel(policy.monthly_premium_cents),
    totalForTermLabel: dollarLabel(policy.monthly_premium_cents * monthsForTerm),

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

    vehicle: {
      year: vehicle?.model_year ?? '',
      make: vehicle?.vehicle_make ?? '',
      model: vehicle?.vehicle_model ?? '',
      trim: vehicle?.trim_level ?? '',
      vin: vehicle?.vin ?? '—',
      bodyClass: vehicle?.body_class ?? '',
    },

    coverages,
    issuer: DEFAULT_ISSUER,
    generatedAtIso: new Date().toISOString(),
  })

  const inline = request.nextUrl.searchParams.get('inline') === '1'
  const filename = `policy-declaration-${policy.policy_number}.pdf`

  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
