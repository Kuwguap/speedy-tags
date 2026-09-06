import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

/**
 * Shared server-to-server auth for `/api/integrations/*` routes.
 *
 * Accepts the token via (in order):
 *   1. `Authorization: Bearer <secret>`
 *   2. `X-Api-Key: <secret>`
 *   3. A route-specific header name (e.g. `X-Telegram-Integration-Secret`)
 *
 * Comparison is constant-time. Caller passes the env var name(s) it accepts.
 */
export function getIntegrationSecret (envVarNames: string[]): string | null {
  for (const name of envVarNames) {
    const v = process.env[name]?.trim()
    if (v) return v
  }
  return null
}

export function readBearerToken (request: NextRequest, extraHeaders: string[] = []): string | null {
  const auth = request.headers.get('authorization')
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    const t = auth.slice(7).trim()
    if (t) return t
  }
  const direct =
    request.headers.get('x-api-key')?.trim() ??
    extraHeaders
      .map(h => request.headers.get(h)?.trim())
      .find((v): v is string => !!v) ??
    null
  return direct || null
}

export function constantTimeEquals (a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, 'utf8')
    const bBuf = Buffer.from(b, 'utf8')
    if (aBuf.length !== bBuf.length) return false
    return timingSafeEqual(aBuf, bBuf)
  } catch {
    return false
  }
}

/**
 * Returns true when the request carries a token matching the configured secret.
 * Returns false when the secret is unset OR the token is missing / wrong.
 *
 * Callers should additionally surface a 503 when the secret is unset so the
 * operator knows to configure it (vs. a generic 401).
 */
export function isAuthorizedIntegrationRequest (
  request: NextRequest,
  envVarNames: string[],
  extraHeaders: string[] = []
): boolean {
  const expected = getIntegrationSecret(envVarNames)
  if (!expected) return false
  const token = readBearerToken(request, extraHeaders)
  if (!token) return false
  return constantTimeEquals(token, expected)
}
