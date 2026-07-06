import Stripe from 'stripe'

let stripeSingleton: Stripe | null = null

export function getStripe (): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) return null
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key)
  }
  return stripeSingleton
}

/** @deprecated Prefer getPublicOriginFromRequest from @/lib/site-url when handling HTTP requests. */
export function getPublicSiteUrl (): string {
  const env =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim()
  if (env) return env.replace(/\/$/, '')
  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '')}`
  return 'http://localhost:3000'
}
