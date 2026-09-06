import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import {
  addVehicleToExistingClient,
  createInsuredClientFromFormAction,
  lookupExistingClientByEmail,
  type AdminCreateInput,
} from '@/app/actions/admin-create-client'
import { classifyInsuranceCardUpload } from '@/lib/insurance-card-format'
import {
  getIntegrationSecret,
  isAuthorizedIntegrationRequest,
} from '@/lib/integrations/api-auth'
import { formatSupabaseClientError } from '@/lib/supabase/error-message'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Server-to-server endpoint that creates a NJ Coverage client account
 * with the same effect as the admin panel's "Add Client" form:
 *
 *   - Creates a Supabase auth user (email-confirmed) + profile
 *   - Inserts vehicle + coverage rows
 *   - Inserts a `policies` row so the member dashboard immediately shows
 *     "Active policy" (1m / 6m / 12m derived from the date range you pass)
 *   - Optional: stores an insurance card PDF (base64) and emails the welcome
 *     message with the PDF attached
 *
 * Auth (one of):
 *   - `Authorization: Bearer <INTEGRATIONS_API_KEY>`
 *   - `X-Api-Key: <INTEGRATIONS_API_KEY>`
 *   - `X-Integrations-Api-Key: <INTEGRATIONS_API_KEY>`
 *
 * Configure the secret via `INTEGRATIONS_API_KEY` (or `CLIENTS_INTEGRATION_SECRET`)
 * on the server. It must NOT be exposed to the browser.
 */

const ENV_VAR_NAMES = ['INTEGRATIONS_API_KEY', 'CLIENTS_INTEGRATION_SECRET']
const ROUTE_HEADERS = ['x-integrations-api-key', 'x-clients-integration-secret']

/** Soft-cap base64 PDF payloads at ~6 MB encoded (~4.5 MB raw). */
const MAX_BASE64_PDF_BYTES = 6 * 1024 * 1024

const bodySchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(7, 'Password must be at least 7 characters.')
    .max(200, 'Password is too long.'),
  name: z.string().min(2).max(200),
  memberSince: z
    .string()
    .max(40)
    .optional()
    .default(''),
  phone: z.string().min(7).max(40),

  vehicleName: z.string().min(1).max(120),
  vin: z.string().min(11).max(20),
  modelYear: z.string().max(10).optional().default(''),
  vehicleMake: z.string().max(60).optional().default(''),
  vehicleModel: z.string().max(60).optional().default(''),
  trimLevel: z.string().max(80).optional().default(''),
  bodyClass: z.string().max(80).optional().default(''),

  policyNumber: z.string().min(2).max(40),
  /**
   * Effective / expiration: accept ISO `YYYY-MM-DD`, US `MM/DD/YYYY`, or
   * long-form `"April 11, 2026"`. We pass them through to the existing
   * admin action which has the same tolerance.
   */
  policyEffectiveDate: z.string().min(4).max(40),
  policyExpirationDate: z.string().min(4).max(40),
  policyAddress: z.string().max(300).optional().default(''),
  /**
   * `annualPremium` here is the TOTAL price for the policy term (matches the
   * admin form's "1/6/12 months from today" workflow). Monthly premium on
   * the dashboard is computed automatically.
   */
  annualPremium: z.number().nonnegative().max(1_000_000),

  liability: z.boolean().optional().default(true),
  collision: z.boolean().optional().default(true),
  comprehensive: z.boolean().optional().default(true),
  uninsuredMotorist: z.boolean().optional().default(false),
  medicalPayments: z.boolean().optional().default(false),
  roadsideAssistance: z.boolean().optional().default(false),

  /** Optional insurance card PDF as base64 (data URL or raw). */
  insuranceCardPdfBase64: z
    .string()
    .max(MAX_BASE64_PDF_BYTES)
    .optional(),
  /** Optional filename used when storing the PDF. Defaults to `insurance-card.pdf`. */
  insuranceCardFilename: z.string().min(1).max(120).optional(),

  /**
   * Set to `true` when the caller intends to send its own welcome email (e.g.
   * the barcode-generator app's `purchase-welcome` template). Suppresses the
   * built-in "policy issued" notification so the client receives a single
   * message instead of two.
   */
  skipWelcomeEmail: z.boolean().optional().default(false),
})

export type CreateClientApiBody = z.infer<typeof bodySchema>

function decodeBase64Pdf (raw: string): Buffer | { error: string } {
  const stripped = raw.startsWith('data:')
    ? raw.replace(/^data:[^;]+;base64,/, '')
    : raw
  try {
    const buf = Buffer.from(stripped, 'base64')
    if (buf.length < 100) return { error: 'PDF payload is too small (<100 bytes).' }
    if (buf.length > 5 * 1024 * 1024) return { error: 'PDF payload exceeds 5 MB raw.' }
    // Optional sanity check: PDFs begin with "%PDF".
    if (!buf.slice(0, 4).toString('utf8').startsWith('%PDF')) {
      return {
        error: 'Decoded payload does not start with %PDF — not a PDF file.',
      }
    }
    return buf
  } catch {
    return { error: 'Could not decode base64 PDF payload.' }
  }
}

function jsonError (status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...(extra ?? {}) }, { status })
}

function isDuplicateEmailError (message: string): boolean {
  return /already(\s+been)?\s+(registered|exists)|duplicate key/i.test(message)
}

function buildAdminInputFromBody (b: CreateClientApiBody): AdminCreateInput {
  return {
    email: b.email,
    password: b.password,
    name: b.name,
    memberSince: b.memberSince ?? '',
    phone: b.phone,
    vehicleName: b.vehicleName,
    vin: b.vin,
    modelYear: b.modelYear ?? '',
    vehicleMake: b.vehicleMake ?? '',
    vehicleModel: b.vehicleModel ?? '',
    trimLevel: b.trimLevel ?? '',
    bodyClass: b.bodyClass ?? '',
    policyNumber: b.policyNumber,
    policyEffectiveDate: b.policyEffectiveDate,
    policyExpirationDate: b.policyExpirationDate,
    policyAddress: b.policyAddress ?? '',
    annualPremium: b.annualPremium,
    liability: b.liability,
    collision: b.collision,
    comprehensive: b.comprehensive,
    uninsuredMotorist: b.uninsuredMotorist,
    medicalPayments: b.medicalPayments,
    roadsideAssistance: b.roadsideAssistance,
    skipWelcomeEmail: b.skipWelcomeEmail,
  }
}

async function pdfOptionalFromBlob (
  pdfBlob: Blob | null,
  pdfFilename: string
): Promise<{
  pdfBuffer?: Buffer
  pdfMeta?: { objectName: string; contentType: string } | null
}> {
  if (!pdfBlob) return {}
  const classified = classifyInsuranceCardUpload(
    new File([pdfBlob], pdfFilename, { type: 'application/pdf' })
  )
  return {
    pdfBuffer: Buffer.from(await pdfBlob.arrayBuffer()),
    pdfMeta: classified.ok
      ? { objectName: pdfFilename, contentType: 'application/pdf' }
      : null,
  }
}

export async function POST (request: NextRequest) {
  if (!getIntegrationSecret(ENV_VAR_NAMES)) {
    return jsonError(
      503,
      'INTEGRATIONS_API_KEY is not configured on the server. Set it in your environment (Vercel → Settings → Environment Variables) and redeploy.'
    )
  }
  if (!isAuthorizedIntegrationRequest(request, ENV_VAR_NAMES, ROUTE_HEADERS)) {
    return jsonError(401, 'Unauthorized — pass the secret in Authorization: Bearer or X-Api-Key.')
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return jsonError(400, 'Body must be valid JSON.')
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(400, 'Validation failed', {
      issues: parsed.error.flatten().fieldErrors,
    })
  }
  const b = parsed.data

  // Optional PDF: decode + validate before doing any DB writes so we don't
  // half-create a client when the file is bad.
  let pdfBlob: Blob | null = null
  let pdfFilename = b.insuranceCardFilename?.trim() || 'insurance-card.pdf'
  if (b.insuranceCardPdfBase64) {
    const decoded = decodeBase64Pdf(b.insuranceCardPdfBase64)
    if ('error' in decoded) {
      return jsonError(400, decoded.error)
    }
    pdfBlob = new Blob([new Uint8Array(decoded)], { type: 'application/pdf' })
    if (!/\.pdf$/i.test(pdfFilename)) pdfFilename += '.pdf'
  }

  // Reuse the existing admin server action so this endpoint stays a thin
  // facade around one canonical user-creation path.
  const fd = new FormData()
  fd.set('email', b.email)
  fd.set('password', b.password)
  fd.set('name', b.name)
  fd.set('memberSince', b.memberSince ?? '')
  fd.set('phone', b.phone)
  fd.set('vehicleName', b.vehicleName)
  fd.set('vin', b.vin)
  fd.set('modelYear', b.modelYear ?? '')
  fd.set('vehicleMake', b.vehicleMake ?? '')
  fd.set('vehicleModel', b.vehicleModel ?? '')
  fd.set('trimLevel', b.trimLevel ?? '')
  fd.set('bodyClass', b.bodyClass ?? '')
  fd.set('policyNumber', b.policyNumber)
  fd.set('policyEffectiveDate', b.policyEffectiveDate)
  fd.set('policyExpirationDate', b.policyExpirationDate)
  fd.set('policyAddress', b.policyAddress ?? '')
  fd.set('annualPremium', String(b.annualPremium))
  fd.set('liability', b.liability ? 'true' : 'false')
  fd.set('collision', b.collision ? 'true' : 'false')
  fd.set('comprehensive', b.comprehensive ? 'true' : 'false')
  fd.set('uninsuredMotorist', b.uninsuredMotorist ? 'true' : 'false')
  fd.set('medicalPayments', b.medicalPayments ? 'true' : 'false')
  fd.set('roadsideAssistance', b.roadsideAssistance ? 'true' : 'false')
  fd.set('skipWelcomeEmail', b.skipWelcomeEmail ? 'true' : 'false')
  if (pdfBlob) {
    fd.set('insuranceCard', pdfBlob, pdfFilename)
  }

  const adminInput = buildAdminInputFromBody(b)
  const pdfOptional = await pdfOptionalFromBlob(pdfBlob, pdfFilename)

  // Existing account: add a vehicle without calling createUser (which would
  // risk overwriting profile / auth metadata with the new submission's name).
  const existing = await lookupExistingClientByEmail(b.email)
  if (existing) {
    const addResult = await addVehicleToExistingClient(adminInput, pdfOptional)
    if (!addResult.ok) {
      return jsonError(400, addResult.message)
    }
    return NextResponse.json({
      ok: true,
      email: b.email.trim(),
      policyNumber: b.policyNumber.trim(),
      added: 'vehicle',
      userId: addResult.userId,
      vehicleId: addResult.vehicleId,
      policyId: addResult.policyId,
      insuranceCardStored: pdfBlob !== null && !addResult.warning,
      ...(addResult.warning ? { warning: addResult.warning } : {}),
    })
  }

  const result = await createInsuredClientFromFormAction(fd)

  if (!result.ok) {
    const isDuplicate = isDuplicateEmailError(result.message)
    const friendly = formatSupabaseClientError(result.message)
    const isInfra =
      friendly !== result.message ||
      /cannot reach supabase|invalid supabase service role/i.test(friendly)

    // Duplicate-email safety net: only add vehicle — never createUser / profile
    // name update (createInsuredClientFromFormAction overwrites profiles.name).
    if (isDuplicate) {
      const addResult = await addVehicleToExistingClient(adminInput, pdfOptional)

      if (!addResult.ok) {
        return jsonError(400, addResult.message)
      }

      return NextResponse.json({
        ok: true,
        email: b.email.trim(),
        policyNumber: b.policyNumber.trim(),
        added: 'vehicle',
        userId: addResult.userId,
        vehicleId: addResult.vehicleId,
        policyId: addResult.policyId,
        insuranceCardStored: pdfBlob !== null && !addResult.warning,
        ...(addResult.warning ? { warning: addResult.warning } : {}),
      })
    }

    return jsonError(isInfra ? 503 : 400, friendly)
  }

  return NextResponse.json({
    ok: true,
    email: b.email.trim(),
    policyNumber: b.policyNumber.trim(),
    insuranceCardStored: pdfBlob !== null && !('warning' in result && !!result.warning),
    ...(result.warning ? { warning: result.warning } : {}),
  })
}

/** Health-check + auth probe — useful for the bot's startup self-test. */
export async function GET (request: NextRequest) {
  if (!getIntegrationSecret(ENV_VAR_NAMES)) {
    return jsonError(503, 'INTEGRATIONS_API_KEY not configured.')
  }
  if (!isAuthorizedIntegrationRequest(request, ENV_VAR_NAMES, ROUTE_HEADERS)) {
    return jsonError(401, 'Unauthorized.')
  }
  return NextResponse.json({
    ok: true,
    service: 'integrations.clients',
    methods: ['POST'],
    auth: 'Authorization: Bearer <INTEGRATIONS_API_KEY>',
    docs: '/docs/integrations/create-client-api.md',
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null,
  })
}
