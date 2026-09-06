import { NextResponse, type NextRequest } from 'next/server'
import { getPlan, type PurchasePlanKey } from '@/lib/purchase/plans'
import {
  createTestCheckoutToken,
  isTestPurchaseSigningAvailable,
} from '@/lib/purchase/test-checkout-token'
import { getPublicOriginFromRequest } from '@/lib/site-url'

export const runtime = 'nodejs'

/**
 * Dummy checkout: returns a signed URL to /qwertyuiop/success — no Stripe charge.
 * Email + PDF on complete still use production Resend / real generation.
 */
export async function POST (request: NextRequest) {
  if (!isTestPurchaseSigningAvailable()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Test checkout disabled: set STRIPE_SECRET_KEY or TEST_PURCHASE_SIGNING_SECRET.',
      },
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

  const token = createTestCheckoutToken(plan.key as PurchasePlanKey)
  if (!token) {
    return NextResponse.json(
      { ok: false, error: 'Could not create test session.' },
      { status: 500 }
    )
  }

  const base = getPublicOriginFromRequest(request)
  const url = `${base}/qwertyuiop/success?token=${encodeURIComponent(token)}`
  return NextResponse.json({ ok: true, url })
}
