import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateStripeCustomerForUser, getAdminSupabase } from '@/lib/stripe/customers'
import { getPublicOriginFromRequest } from '@/lib/site-url'

export const runtime = 'nodejs'

const bodySchema = z.object({
  action: z.enum(['enable', 'disable']),
  policyId: z.string().uuid(),
})

/**
 * Enable AutoPay  → create a Stripe Checkout in `subscription` mode at the
 *                   policy's monthly premium; webhook marks policy on success.
 * Disable AutoPay → cancel the Stripe subscription immediately and flip the
 *                   flag on the policy row.
 */
export async function POST (request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 })
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }
  const { action, policyId } = parsed.data

  const admin = getAdminSupabase()
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: 'Server billing is not configured.' },
      { status: 503 }
    )
  }

  const { data: policy, error: polErr } = await admin
    .from('policies')
    .select(
      'id, user_id, policy_number, monthly_premium_cents, autopay_enabled, stripe_subscription_id, status'
    )
    .eq('id', policyId)
    .eq('user_id', user.id)
    .single()

  if (polErr || !policy) {
    return NextResponse.json({ ok: false, error: 'Policy not found.' }, { status: 404 })
  }

  if (action === 'disable') {
    if (!policy.stripe_subscription_id) {
      await admin
        .from('policies')
        .update({ autopay_enabled: false })
        .eq('id', policyId)
      return NextResponse.json({ ok: true, autopay: false })
    }

    const cust = await getOrCreateStripeCustomerForUser(user.id)
    if ('error' in cust) {
      return NextResponse.json({ ok: false, error: cust.error }, { status: 503 })
    }

    try {
      await cust.stripe.subscriptions.cancel(policy.stripe_subscription_id)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Stripe cancel failed.'
      return NextResponse.json({ ok: false, error: msg }, { status: 502 })
    }

    await admin
      .from('policies')
      .update({ autopay_enabled: false, stripe_subscription_id: null })
      .eq('id', policyId)

    return NextResponse.json({ ok: true, autopay: false })
  }

  // action === 'enable'
  if (policy.monthly_premium_cents <= 0) {
    return NextResponse.json(
      { ok: false, error: 'Policy has no monthly premium configured.' },
      { status: 400 }
    )
  }

  const cust = await getOrCreateStripeCustomerForUser(user.id)
  if ('error' in cust) {
    return NextResponse.json({ ok: false, error: cust.error }, { status: 503 })
  }

  const base = getPublicOriginFromRequest(request)
  const session = await cust.stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: cust.customerId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: policy.monthly_premium_cents,
          recurring: { interval: 'month' },
          product_data: {
            name: `AutoPay — Policy ${policy.policy_number}`,
            description: 'Monthly Tri State Coverage premium',
          },
        },
      },
    ],
    metadata: {
      user_id: user.id,
      policy_id: policy.id,
    },
    success_url: `${base}/dashboard?autopay=1`,
    cancel_url: `${base}/dashboard?autopay=0`,
  })

  return NextResponse.json({ ok: true, url: session.url })
}
