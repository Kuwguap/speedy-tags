import { NextResponse, type NextRequest } from 'next/server'
import { decodeVinFromNhtsa } from '@/lib/vin/decode-vin'

export const runtime = 'nodejs'

/**
 * GET /api/vin/decode?vin=... — NHTSA vPIC (free, no API key).
 * Returns decoded fields + suggested vehicle display name; callers may override any field.
 */
export async function GET (request: NextRequest) {
  const vin = request.nextUrl.searchParams.get('vin') ?? ''
  const result = await decodeVinFromNhtsa(vin)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
  }
  return NextResponse.json({ ok: true, data: result.data })
}
