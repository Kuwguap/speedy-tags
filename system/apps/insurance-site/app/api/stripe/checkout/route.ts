import { NextResponse, type NextRequest } from 'next/server'
import { getPlan } from '@/lib/purchase/plans'
import { getPublicOriginFromRequest } from '@/lib/site-url'
import { getStripe } from '@/lib/stripe/server'

export const runtime = 'nodejs'

export async function POST (request: NextRequest) {
  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json(
      { ok: false, error: 'Stripe is not configured (STRIPE_SECRET_KEY).' },
      { status: 503 }
    )
  }

  let body: { planKey?: string }
  try {
    body = (await request.json()) as { planKey?: string }
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const plan = getPlan(String(body.planKey ?? ''))
  if (!plan) {
    return NextResponse.json({ ok: false, error: 'Invalid plan' }, { status: 400 })
  }

  const base = getPublicOriginFromRequest(request)

  try {
    if (plan.mode === 'payment') {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: plan.unitAmountCents,
              product_data: {
                name: `Tri State Coverage — Auto insurance (${plan.label})`,
                description: plan.description,
              },
            },
          },
        ],
        metadata: { planKey: plan.key },
        success_url: `${base}/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/purchase`,
      })
      return NextResponse.json({ ok: true, url: session.url })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: plan.unitAmountCents,
            recurring: { interval: 'month' },
            product_data: {
              name: 'Tri State Coverage — Auto insurance (Monthly)',
              description: plan.description,
            },
          },
        },
      ],
      metadata: { planKey: plan.key },
      success_url: `${base}/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/purchase`,
    })
    return NextResponse.json({ ok: true, url: session.url })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Checkout failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
