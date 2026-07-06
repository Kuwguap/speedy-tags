import { createHmac, timingSafeEqual } from 'crypto'
import { getPlan, type PurchasePlanKey } from '@/lib/purchase/plans'

const TTL_MS = 60 * 60 * 1000

/** Prefer dedicated secret; falls back to Stripe key so QA works without extra env. */
export function getTestPurchaseSigningSecret (): string | null {
  const a = process.env.TEST_PURCHASE_SIGNING_SECRET?.trim()
  if (a) return a
  const b = process.env.STRIPE_SECRET_KEY?.trim()
  return b || null
}

export function isTestPurchaseSigningAvailable (): boolean {
  return getTestPurchaseSigningSecret() !== null
}

/**
 * Opaque token proving “dummy checkout” completed. Verified on session + complete.
 */
export function createTestCheckoutToken (planKey: PurchasePlanKey): string | null {
  const secret = getTestPurchaseSigningSecret()
  if (!secret) return null
  const exp = Date.now() + TTL_MS
  const body = `${planKey}:${exp}`
  const sig = createHmac('sha256', secret).update(body).digest('hex')
  const combined = `${body}:${sig}`
  return Buffer.from(combined, 'utf8').toString('base64url')
}

function hexEqual (a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex')
    const bb = Buffer.from(b, 'hex')
    if (ba.length !== bb.length) return false
    return timingSafeEqual(ba, bb)
  } catch {
    return false
  }
}

export function parseTestCheckoutToken (
  token: string
): { planKey: PurchasePlanKey } | null {
  const secret = getTestPurchaseSigningSecret()
  if (!secret) return null
  let combined: string
  try {
    combined = Buffer.from(token, 'base64url').toString('utf8')
  } catch {
    return null
  }
  const lastColon = combined.lastIndexOf(':')
  if (lastColon <= 0) return null
  const sig = combined.slice(lastColon + 1)
  const body = combined.slice(0, lastColon)
  const expectedSig = createHmac('sha256', secret).update(body).digest('hex')
  if (!hexEqual(sig, expectedSig)) return null

  const firstColon = body.indexOf(':')
  if (firstColon <= 0) return null
  const planKey = body.slice(0, firstColon) as PurchasePlanKey
  const exp = Number(body.slice(firstColon + 1))
  if (!Number.isFinite(exp) || Date.now() > exp) return null
  if (!getPlan(planKey)) return null
  return { planKey }
}
