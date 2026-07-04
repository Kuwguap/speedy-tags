import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseProjectUrl } from '@/lib/supabase/admin-env'
import { findProfilesByDisplayName } from '@/lib/integrations/find-client-by-display-name'
import { getResendClient, getResendFromAddress } from '@/lib/email/resend'
import { buildPolicyIssuedEmail } from '@/lib/email/policy-issued-template'

export const runtime = 'nodejs'

const BUCKET = 'insurance-cards'
const OBJECT_NAME = 'insurance-card.pdf'
const MAX_PDF_BYTES = 5 * 1024 * 1024

function getIntegrationSecret (): string | null {
  return (
    process.env.TELEGRAM_INTEGRATION_SECRET?.trim() ||
    process.env.TELEGRAM_BOT_API_SECRET?.trim() ||
    null
  )
}

function authorize (request: NextRequest): boolean {
  const expected = getIntegrationSecret()
  if (!expected) return false

  const auth = request.headers.get('authorization')
  let token: string | null = null
  if (auth?.toLowerCase().startsWith('bearer ')) {
    token = auth.slice(7).trim()
  }
  if (!token) {
    token =
      request.headers.get('x-telegram-integration-secret')?.trim() ??
      request.headers.get('x-api-key')?.trim() ??
      null
  }

  if (!token) return false
  try {
    const a = Buffer.from(token, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Telegram bot integration (server-to-server).
 *
 * POST multipart/form-data:
 * - `fullName` or `name`: must match `profiles.name` (case-insensitive, normalized spaces)
 * - `file`: PDF (required)
 *
 * Auth: `Authorization: Bearer <TELEGRAM_INTEGRATION_SECRET>`
 *    or header `X-Telegram-Integration-Secret` / `X-Api-Key` with the same secret.
 *
 * On success: uploads PDF to `insurance-cards/{userId}/insurance-card.pdf`, updates profile,
 * sends the standard policy email with PDF attached (same template as admin create).
 */
export async function POST (request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (!getIntegrationSecret()) {
    return NextResponse.json(
      { ok: false, error: 'TELEGRAM_INTEGRATION_SECRET is not configured on the server.' },
      { status: 503 }
    )
  }

  const url = getSupabaseProjectUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    return NextResponse.json(
      { ok: false, error: 'Supabase service role is not configured.' },
      { status: 503 }
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected multipart/form-data.' }, { status: 400 })
  }

  const displayName = String(
    formData.get('fullName') ?? formData.get('name') ?? ''
  ).trim()
  const rawFile = formData.get('file')

  if (!displayName) {
    return NextResponse.json({ ok: false, error: 'Missing fullName (or name).' }, { status: 400 })
  }

  if (!(rawFile instanceof File) || rawFile.size === 0) {
    return NextResponse.json({ ok: false, error: 'Missing PDF file in field "file".' }, { status: 400 })
  }

  const mime = rawFile.type
  const lower = rawFile.name.toLowerCase()
  if (mime !== 'application/pdf' && !lower.endsWith('.pdf')) {
    return NextResponse.json({ ok: false, error: 'File must be a PDF.' }, { status: 400 })
  }

  if (rawFile.size > MAX_PDF_BYTES) {
    return NextResponse.json({ ok: false, error: 'PDF must be 5 MB or smaller.' }, { status: 400 })
  }

  const pdfBuffer = Buffer.from(await rawFile.arrayBuffer())

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let matches: Awaited<ReturnType<typeof findProfilesByDisplayName>>
  try {
    matches = await findProfilesByDisplayName(admin, displayName)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Lookup failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }

  if (matches.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'No client found with that display name.',
        hint: 'Name must match profiles.name (same spelling; extra spaces are ignored; case ignored).',
      },
      { status: 404 }
    )
  }

  if (matches.length > 1) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Multiple clients match this name; resolve duplicates in the database first.',
        matchedIds: matches.map(m => m.id),
      },
      { status: 409 }
    )
  }

  const profile = matches[0]
  const userId = profile.id

  const { data: vehicle, error: vErr } = await admin
    .from('vehicles')
    .select(
      'vehicle_name, policy_number, policy_effective_date'
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (vErr) {
    return NextResponse.json({ ok: false, error: vErr.message }, { status: 500 })
  }

  const vehicleName = String(vehicle?.vehicle_name ?? '—').trim() || '—'
  const policyNumber = String(vehicle?.policy_number ?? '—').trim() || '—'
  const effectiveDate =
    String(vehicle?.policy_effective_date ?? '').trim() || '—'

  const storagePath = `${userId}/${OBJECT_NAME}`
  const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, pdfBuffer, {
    contentType: 'application/pdf',
    upsert: true,
  })

  if (upErr) {
    return NextResponse.json(
      { ok: false, error: `Storage upload failed: ${upErr.message}` },
      { status: 502 }
    )
  }

  const { error: pathErr } = await admin
    .from('profiles')
    .update({ insurance_card_pdf_path: storagePath })
    .eq('id', userId)

  if (pathErr) {
    return NextResponse.json({ ok: false, error: pathErr.message }, { status: 500 })
  }

  let emailSent = false
  let emailError: string | undefined

  try {
    const resend = getResendClient()
    const from = getResendFromAddress()
    const toEmail = profile.email?.trim()
    if (resend && from && toEmail) {
      const { subject, text } = buildPolicyIssuedEmail({
        fullName: profile.name,
        policyNumber,
        effectiveDate,
        vehicleName,
        mentionAttachedCard: true,
      })
      await resend.emails.send({
        from,
        to: toEmail,
        subject,
        text,
        attachments: [
          {
            filename: OBJECT_NAME,
            content: pdfBuffer,
          },
        ],
      })
      emailSent = true
    } else {
      emailError = 'RESEND_API_KEY / RESEND_FROM or profile email missing; PDF stored only.'
    }
  } catch (e) {
    emailError = e instanceof Error ? e.message : 'Email send failed'
  }

  return NextResponse.json({
    ok: true,
    userId,
    email: profile.email,
    matchedName: profile.name,
    storagePath,
    policyNumber,
    effectiveDate,
    vehicleName,
    emailSent,
    ...(emailError ? { warning: emailError } : {}),
  })
}

/** GET: verify secret and that the route is reachable (optional for bot health checks). */
export async function GET (request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({
    ok: true,
    service: 'telegram-integration',
    postFields: ['fullName | name', 'file (PDF)'],
    auth: 'Authorization: Bearer <TELEGRAM_INTEGRATION_SECRET>',
  })
}
