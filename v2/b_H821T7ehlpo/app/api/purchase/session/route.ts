import { NextResponse, type NextRequest } from 'next/server'
import { getPlan, type PurchasePlanKey } from '@/lib/purchase/plans'
import { parseTestCheckoutToken } from '@/lib/purchase/test-checkout-token'
import { getStripe } from '@/lib/stripe/server'

export const runtime = 'nodejs'

/**
 * Verify a Checkout Session is paid so the success page can show the intake form.
 * Or verify a signed test token from `/api/purchase/test-checkout` (dummy payment).
 */
export async function GET (request: NextRequest) {
  const testToken = request.nextUrl.searchParams.get('test_token')?.trim()
  if (testToken) {
    const parsed = parseTestCheckoutToken(testToken)
    if (!parsed) {
      return NextResponse.json(
        { ok: false, error: 'Invalid or expired test session.' },
        { status: 401 }
      )
    }
    const plan = getPlan(parsed.planKey)
    if (!plan) {
      return NextResponse.json({ ok: false, error: 'Invalid plan in token.' }, { status: 400 })
    }
    return NextResponse.json({
      ok: true,
      sessionId: testToken,
      planKey: plan.key,
      planLabel: `${plan.label} — ${plan.priceLabel} (${plan.description}) [test — no charge]`,
    })
  }

  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json(
      { ok: false, error: 'Stripe is not configured.' },
      { status: 503 }
    )
  }

  const sessionId = request.nextUrl.searchParams.get('session_id')?.trim()
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: 'Missing session_id or test_token' }, { status: 400 })
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const paid =
      session.payment_status === 'paid' ||
      session.status === 'complete'

    if (!paid) {
      return NextResponse.json(
        { ok: false, error: 'Payment not completed for this session.' },
        { status: 402 }
      )
    }

    const planKey = (session.metadata?.planKey ?? '') as PurchasePlanKey
    const plan = getPlan(planKey)
    if (!plan) {
      return NextResponse.json(
        { ok: false, error: 'Session is missing plan metadata.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      planKey: plan.key,
      planLabel: `${plan.label} — ${plan.priceLabel} (${plan.description})`,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not verify session'
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
}
