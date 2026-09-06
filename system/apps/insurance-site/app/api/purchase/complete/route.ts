import { NextResponse, type NextRequest } from 'next/server'
import { format } from 'date-fns'
import { z } from 'zod'
import {
  expirationForPlan,
  generatePolicyNumber,
  getPlan,
  type PurchasePlanKey,
} from '@/lib/purchase/plans'
import { buildPurchaseWelcomeEmail } from '@/lib/email/purchase-welcome'
import { getResendClient, getResendFromAddress } from '@/lib/email/resend'
import {
  buildNyInsuranceIdCardPdf,
  formatInsuredNameFs20,
} from '@/lib/pdf/ny-insurance-id-card'
import {
  decodeVinFromNhtsa,
  formatSuggestedVehicleName,
  normalizeVin,
} from '@/lib/vin/decode-vin'
import { normalizeAamvaDaq } from '@/lib/pdf/aamva-pdf417-insurance'
import { parseTestCheckoutToken } from '@/lib/purchase/test-checkout-token'
import { getStripe } from '@/lib/stripe/server'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { getAdminSupabase } from '@/lib/stripe/customers'

export const runtime = 'nodejs'

/**
 * Printed issuer block + IIN.
 *
 * `issuerCompanyLine` is the **carrier / underwriter** (top NAIC line on the
 * FS-20). `agencyName` + `agencyAddressLines` are the **servicer / mailing
 * address** (AIPSO-SAIP, PO Box 6400 Providence RI).
 */
const PURCHASE_CARD_ISSUER = {
  issuerCompanyLine: '169 NATIONAL SPECIALTY INSURANCE COMPANY',
  issuerPhone: '',
  agencyName: 'SERVICED BY AIPSO-SAIP',
  agencyAddressLines: ['PO BOX 6400', 'PROVIDENCE, RI 02940-6200'],
  iin: '636001',
}

const bodySchema = z.object({
  sessionId: z.string().min(10),
  fullName: z.string().min(2).max(200),
  addressLine1: z.string().min(2).max(200),
  addressLine2: z.string().max(200).optional(),
  cityStateZip: z.string().min(3).max(200),
  phone: z.string().min(7).max(40),
  email: z.string().email(),
  vin: z.string().min(11).max(20),
  vehicleColor: z.string().min(1).max(80),
  /**
   * AAMVA DAQ — driver license number (RG subfile). Required so the PDF417
   * on the issued NY FS-20 card carries a real license #, not the placeholder
   * `000000000`. Accepts any letters/digits; normalized server-side.
   */
  daq: z
    .string()
    .min(4, 'Driver license number is required.')
    .max(25, 'Driver license number is too long.'),
})

function firstNameFromFull (full: string): string {
  const p = full.trim().split(/\s+/).filter(Boolean)
  return p[0] || 'there'
}

export async function POST (request: NextRequest) {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const b = parsed.data

  const testParsed = parseTestCheckoutToken(b.sessionId)
  let plan = testParsed ? getPlan(testParsed.planKey) : undefined

  if (!testParsed) {
    const stripe = getStripe()
    if (!stripe) {
      return NextResponse.json(
        { ok: false, error: 'Stripe is not configured.' },
        { status: 503 }
      )
    }

    let session: Awaited<ReturnType<typeof stripe.checkout.sessions.retrieve>>
    try {
      session = await stripe.checkout.sessions.retrieve(b.sessionId)
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 400 })
    }

    const paid =
      session.payment_status === 'paid' || session.status === 'complete'
    if (!paid) {
      return NextResponse.json(
        { ok: false, error: 'Payment not completed.' },
        { status: 402 }
      )
    }

    const planKey = session.metadata?.planKey as PurchasePlanKey | undefined
    plan = planKey ? getPlan(planKey) : undefined
  }

  if (!plan) {
    return NextResponse.json(
      { ok: false, error: 'Could not determine purchased plan.' },
      { status: 400 }
    )
  }

  const vinNorm = normalizeVin(b.vin)
  if (!vinNorm) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'VIN must be exactly 17 valid characters (no I, O, or Q).',
      },
      { status: 400 }
    )
  }

  const decoded = await decodeVinFromNhtsa(vinNorm)
  if (!decoded.ok) {
    return NextResponse.json(
      { ok: false, error: decoded.error },
      { status: 400 }
    )
  }

  const d = decoded.data
  const vehicleLine = `${formatSuggestedVehicleName(
    d.modelYear,
    d.vehicleMake,
    d.vehicleModel
  )} — ${b.vehicleColor.trim()}`

  const effective = new Date()
  const expiration = expirationForPlan(effective, plan.key)
  const policyNumber = generatePolicyNumber()

  const effectiveStr = format(effective, 'MM/dd/yyyy')
  const expirationStr = format(expiration, 'MM/dd/yyyy')
  const effectiveLong = format(effective, 'MMMM d, yyyy')

  const yearStr = String(d.modelYear ?? '').trim()
  const digits = yearStr.replace(/\D/g, '')
  const vehicleYearFull =
    digits.length >= 4
      ? digits.slice(-4)
      : digits.length === 2
        ? `20${digits}`
        : String(new Date().getFullYear())
  const makeCompact = String(d.vehicleMake ?? 'MAKE')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  const vehicleMakeShort = (makeCompact || 'MAKE').slice(0, 5)

  const addr2 = (b.addressLine2 ?? '').trim()
  const insuredLines = [
    b.addressLine1.trim(),
    ...(addr2 ? [addr2] : []),
    b.cityStateZip.trim(),
  ]

  const fullUpper = b.fullName.trim().toUpperCase()
  const daqNorm = normalizeAamvaDaq(b.daq)

  const pdfBytes = await buildNyInsuranceIdCardPdf({
    policyNumber,
    effectiveMmDdYyyy: effectiveStr,
    expirationMmDdYyyy: expirationStr,
    vehicleYearFull,
    vehicleMakeShort,
    vin: vinNorm,
    insuredNameUpper: fullUpper,
    insuredFs20Name: formatInsuredNameFs20(fullUpper),
    insuredAddressLines: insuredLines.map(l => l.toUpperCase()),
    daq: daqNorm,
    ...PURCHASE_CARD_ISSUER,
  })

  const { subject, text } = buildPurchaseWelcomeEmail({
    firstName: firstNameFromFull(b.fullName),
    policyNumber,
    effectiveDateLabel: effectiveLong,
    vehicleLine,
  })

  const resend = getResendClient()
  const from = getResendFromAddress()
  if (!resend || !from) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Email is not configured (RESEND_API_KEY and RESEND_FROM required to deliver your card).',
      },
      { status: 503 }
    )
  }

  try {
    await resend.emails.send({
      from,
      to: b.email.trim(),
      subject,
      text,
      attachments: [
        {
          filename: `insurance-id-card-${policyNumber}.pdf`,
          content: Buffer.from(pdfBytes),
        },
      ],
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Email send failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }

  // If this purchase is happening while a member is signed in, mirror the
  // policy + first invoice into our DB so the dashboard becomes the source of
  // truth for billing / renewal. Anonymous purchases (no Supabase session) just
  // get the PDF + email, same as before.
  try {
    const supabase = await createServerSupabase()
    const {
      data: { user: signedInUser },
    } = await supabase.auth.getUser()

    if (signedInUser) {
      const admin = getAdminSupabase()
      if (admin) {
        const monthlyCents = monthlyPremiumCentsForPlan(plan.key, plan.unitAmountCents)
        const initialInvoiceCents = plan.unitAmountCents

        const { data: policyInsert, error: policyErr } = await admin
          .from('policies')
          .insert({
            user_id: signedInUser.id,
            policy_number: policyNumber,
            plan_key: plan.key,
            status: 'active',
            monthly_premium_cents: monthlyCents,
            effective_date: effective.toISOString().slice(0, 10),
            renewal_date: expiration.toISOString().slice(0, 10),
            current_period_start: effective.toISOString().slice(0, 10),
            current_period_end: expiration.toISOString().slice(0, 10),
            autopay_enabled: plan.mode === 'subscription',
          })
          .select('id')
          .single()

        if (!policyErr && policyInsert?.id) {
          await admin.from('invoices').insert({
            user_id: signedInUser.id,
            policy_id: policyInsert.id,
            period_label: `Policy ${policyNumber} — ${plan.label} (initial)`,
            due_date: effective.toISOString().slice(0, 10),
            amount_cents: initialInvoiceCents,
            status: 'paid',
            paid_at: new Date().toISOString(),
            stripe_checkout_session_id: testParsed ? null : b.sessionId,
          })

          // Unified cross-app transactions ledger (shared with the tag site).
          await admin.from('transactions').upsert(
            {
              source: 'insurance',
              stripe_id: (testParsed ? null : b.sessionId) || `purchase-${policyNumber}`,
              amount_cents: initialInvoiceCents,
              status: 'paid',
              user_id: signedInUser.id,
              policy_id: policyInsert.id,
            },
            { onConflict: 'stripe_id', ignoreDuplicates: true },
          )
        }
      }
    }
  } catch {
    // Persisting to DB is best-effort: a webhook will reconcile if needed.
  }

  return NextResponse.json({
    ok: true,
    policyNumber,
    email: b.email.trim(),
  })
}

/**
 * Convert plan price to a per-month figure used by the dashboard's "Monthly
 * premium" display and Pay Now / AutoPay flows.
 */
function monthlyPremiumCentsForPlan (
  planKey: PurchasePlanKey,
  unitAmountCents: number
): number {
  switch (planKey) {
    case '1m':
    case 'monthly':
      return unitAmountCents
    case '6m':
      return Math.round(unitAmountCents / 6)
    case '12m':
      return Math.round(unitAmountCents / 12)
    default:
      return unitAmountCents
  }
}
