import type { NextRequest } from 'next/server'

/**
 * Base URL for Stripe success/cancel and test-checkout redirects.
 *
 * Order:
 * 1. `NEXT_PUBLIC_SITE_URL` or `SITE_URL` — set `https://njcoverage.com` on Vercel (recommended).
 * 2. Request `Host` / `X-Forwarded-Host` + `X-Forwarded-Proto` — keeps users on the custom domain they used
 *    (avoids sending them to `*.vercel.app` when env is missing).
 * 3. `VERCEL_URL` — fallback when there is no browser Host (rare).
 * 4. `http://localhost:3000`
 */
export function getPublicOriginFromRequest (request: NextRequest): string {
  const explicit =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')

  const forwardedHost = request.headers.get('x-forwarded-host')
  const rawHost = forwardedHost?.split(',')[0]?.trim() || request.headers.get('host')?.trim()
  if (rawHost) {
    const proto =
      request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
      (request.nextUrl.protocol === 'https:' ? 'https' : 'http')
    return `${proto}://${rawHost}`
  }

  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '')}`

  return 'http://localhost:3000'
}
