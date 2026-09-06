'use server'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseProjectUrl } from '@/lib/supabase/admin-env'
import { getResendClient, getResendFromAddress } from '@/lib/email/resend'
import { buildPolicyIssuedEmail } from '@/lib/email/policy-issued-template'
import {
  classifyInsuranceCardUpload,
  removeStaleInsuranceCardObjects,
} from '@/lib/insurance-card-format'
import { formatSupabaseClientError } from '@/lib/supabase/error-message'
import {
  monthlyPremiumCentsForPlanKey,
  planKeyForMonthCount,
  resolveTermPremiumCents,
} from '@/lib/billing/plan-pricing'

const BUCKET = 'insurance-cards'

/**
 * Fallback monthly premium when the caller posts `annualPremium: 0` — uses
 * standard plan pricing ($100 / $500 / $900 term totals by plan length).
 */

export type AdminCreateInput = {
  email: string
  password: string
  name: string
  memberSince: string
  phone: string
  vehicleName: string
  vin: string
  modelYear: string
  vehicleMake: string
  vehicleModel: string
  trimLevel: string
  bodyClass: string
  policyNumber: string
  policyEffectiveDate: string
  policyExpirationDate: string
  policyAddress: string
  annualPremium: number
  liability: boolean
  collision: boolean
  comprehensive: boolean
  uninsuredMotorist: boolean
  medicalPayments: boolean
  roadsideAssistance: boolean
  /**
   * When true, skip the auto-generated "policy issued" welcome email. The
   * caller is responsible for sending their own welcome message (e.g. the
   * barcode-generator app's `purchase-welcome` template).
   */
  skipWelcomeEmail?: boolean
}

function parseBool (v: FormDataEntryValue | null): boolean {
  return String(v ?? '') === 'true' || String(v ?? '') === 'on'
}

/**
 * Parse the admin's free-form policy date strings ("April 11, 2026",
 * "04/11/2026", or ISO "2026-04-11") into a YYYY-MM-DD string suitable for
 * the `date` columns on the `policies` table. Returns null when the input
 * is empty or can't be parsed.
 */
function parsePolicyDateToIsoDate (s: string): string | null {
  const t = (s ?? '').trim()
  if (!t) return null
  // Try ISO (YYYY-MM-DD) first.
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const parsed = new Date(t)
  if (Number.isNaN(parsed.getTime())) return null
  const yyyy = parsed.getUTCFullYear()
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(parsed.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** Round whole months between two dates (admin terms are 1 / 6 / 12). */
function roundedMonthsBetween (effIso: string, expIso: string): number {
  const a = new Date(`${effIso}T00:00:00Z`)
  const b = new Date(`${expIso}T00:00:00Z`)
  const ms = b.getTime() - a.getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 1
  const months = ms / (1000 * 60 * 60 * 24 * 30.4375)
  return Math.max(1, Math.round(months))
}

/** Add whole calendar months to a `YYYY-MM-DD` date (UTC). */
function addMonthsToIsoDate (iso: string, months: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  d.setUTCMonth(d.getUTCMonth() + Math.max(0, months))
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * End of the current monthly billing period — always one month after
 * effective, capped at the full policy renewal date. For a 6-month term this
 * is month 1's end, not the full term end (which lives in `renewal_date`).
 */
function currentPeriodEndForTerm (effectiveIso: string, renewalIso: string): string {
  const termMonths = roundedMonthsBetween(effectiveIso, renewalIso)
  if (termMonths <= 1) return renewalIso
  const firstPeriodEnd = addMonthsToIsoDate(effectiveIso, 1)
  return firstPeriodEnd <= renewalIso ? firstPeriodEnd : renewalIso
}

function planKeyForMonths (n: number): '1m' | '6m' | '12m' {
  return planKeyForMonthCount(n)
}

type DashboardPolicyInsert = {
  user_id: string
  policy_number: string
  plan_key: '1m' | '6m' | '12m'
  status: 'active'
  monthly_premium_cents: number
  effective_date: string
  renewal_date: string
  current_period_start: string
  current_period_end: string
  autopay_enabled: boolean
}

/**
 * Build the row inserted into `policies` from the admin form fields, or
 * return `null` when there isn't enough data (missing policy number / dates).
 *
 * - `annualPremium` from the admin form is treated as the TOTAL for the
 *   selected term (matches the form's "1/6/12 months from today" buttons),
 *   so monthly_premium_cents = total / months.
 */
function adminPolicyToDashboardRow (args: {
  userId: string
  policyNumber: string
  effectiveLabel: string
  expirationLabel: string
  annualPremium: number
}): DashboardPolicyInsert | null {
  const policyNumber = args.policyNumber.trim()
  if (!policyNumber) return null
  const effective = parsePolicyDateToIsoDate(args.effectiveLabel)
  const expiration = parsePolicyDateToIsoDate(args.expirationLabel)
  if (!effective || !expiration) return null

  const months = roundedMonthsBetween(effective, expiration)
  const planKey = planKeyForMonths(months)
  const totalCents = resolveTermPremiumCents({
    planKey,
    annualPremiumDollars: args.annualPremium,
  })
  const rawMonthly = months > 0 ? Math.round(totalCents / months) : totalCents
  const monthlyCents = rawMonthly > 0 ? rawMonthly : monthlyPremiumCentsForPlanKey(planKey)

  return {
    user_id: args.userId,
    policy_number: policyNumber,
    plan_key: planKey,
    status: 'active',
    monthly_premium_cents: monthlyCents,
    effective_date: effective,
    renewal_date: expiration,
    current_period_start: effective,
    current_period_end: currentPeriodEndForTerm(effective, expiration),
    autopay_enabled: false,
  }
}

/** Return "Month YYYY" for the given ISO date, e.g. `"July 2026"`. */
function periodLabelForIsoDate (iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  const month = d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
  return `${month} ${d.getUTCFullYear()}`
}

/**
 * Insert a "current period" invoice for the freshly-created policy so the
 * member dashboard's Balance due panel and the Pay Now → Stripe Checkout flow
 * both work without waiting for a nightly billing cron. Best-effort: soft
 * warning on failure so the calling action can still succeed.
 */
async function insertInitialInvoiceForPolicy (
  admin: SupabaseClient,
  args: {
    userId: string
    policyId: string
    policyNumber: string
    amountCents: number
    effectiveIso: string
  }
): Promise<string | null> {
  try {
    const dueDate = args.effectiveIso
    const { error } = await admin.from('invoices').insert({
      user_id: args.userId,
      policy_id: args.policyId,
      period_label: `Policy ${args.policyNumber} — ${periodLabelForIsoDate(args.effectiveIso)}`,
      due_date: dueDate,
      amount_cents: args.amountCents,
      status: 'due',
    })
    if (error) return error.message
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'unknown invoice insert error'
  }
}

export type CreateInsuredClientResult =
  | { ok: true; warning?: string }
  | { ok: false; message: string }

/** Create client from multipart form: same fields as AdminCreateInput + optional `insuranceCard` PDF file. */
export async function createInsuredClientFromFormAction (
  formData: FormData
): Promise<CreateInsuredClientResult> {
  const url = getSupabaseProjectUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    return {
      ok: false,
      message:
        'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY. Add them in Vercel → Environment Variables and redeploy.',
    }
  }

  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const memberSince = String(formData.get('memberSince') ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim()
  const vehicleName = String(formData.get('vehicleName') ?? '').trim()
  const vin = String(formData.get('vin') ?? '').trim()
  const modelYear = String(formData.get('modelYear') ?? '').trim()
  const vehicleMake = String(formData.get('vehicleMake') ?? '').trim()
  const vehicleModel = String(formData.get('vehicleModel') ?? '').trim()
  const trimLevel = String(formData.get('trimLevel') ?? '').trim()
  const bodyClass = String(formData.get('bodyClass') ?? '').trim()
  const policyNumber = String(formData.get('policyNumber') ?? '').trim()
  const policyEffectiveDate = String(formData.get('policyEffectiveDate') ?? '').trim()
  const policyExpirationDate = String(formData.get('policyExpirationDate') ?? '').trim()
  const policyAddress = String(formData.get('policyAddress') ?? '').trim()
  const annualPremium = parseFloat(String(formData.get('annualPremium') ?? '0')) || 0

  const rawFile = formData.get('insuranceCard')
  let cardBuffer: Buffer | null = null
  let cardMeta: { objectName: string; contentType: string } | null = null
  if (rawFile instanceof File && rawFile.size > 0) {
    const classified = classifyInsuranceCardUpload(rawFile)
    if (!classified.ok) {
      return { ok: false, message: classified.message }
    }
    cardMeta = classified
    cardBuffer = Buffer.from(await rawFile.arrayBuffer())
  }

  const input: AdminCreateInput = {
    email,
    password,
    name,
    memberSince,
    phone,
    vehicleName,
    vin,
    modelYear,
    vehicleMake,
    vehicleModel,
    trimLevel,
    bodyClass,
    policyNumber,
    policyEffectiveDate,
    policyExpirationDate,
    policyAddress,
    annualPremium,
    liability: parseBool(formData.get('liability')),
    collision: parseBool(formData.get('collision')),
    comprehensive: parseBool(formData.get('comprehensive')),
    uninsuredMotorist: parseBool(formData.get('uninsuredMotorist')),
    medicalPayments: parseBool(formData.get('medicalPayments')),
    roadsideAssistance: parseBool(formData.get('roadsideAssistance')),
    skipWelcomeEmail: parseBool(formData.get('skipWelcomeEmail')),
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      name: input.name,
      phone: input.phone,
    },
  })

  if (authError || !created.user) {
    return {
      ok: false,
      message: formatSupabaseClientError(authError?.message ?? 'Failed to create user'),
    }
  }

  const uid = created.user.id

  const { error: profileError } = await admin
    .from('profiles')
    .update({
      email: input.email,
      name: input.name,
      phone: input.phone,
      member_since: input.memberSince,
    })
    .eq('id', uid)

  if (profileError) {
    return { ok: false, message: profileError.message }
  }

  await admin.from('vehicles').delete().eq('user_id', uid)

  const { data: insertedVehicle, error: vehicleError } = await admin
    .from('vehicles')
    .insert({
      user_id: uid,
      vehicle_name: input.vehicleName,
      vin: input.vin,
      model_year: input.modelYear,
      vehicle_make: input.vehicleMake,
      vehicle_model: input.vehicleModel,
      trim_level: input.trimLevel,
      body_class: input.bodyClass,
      policy_number: input.policyNumber,
      policy_effective_date: input.policyEffectiveDate,
      policy_expiration_date: input.policyExpirationDate,
      policy_address: input.policyAddress,
      annual_premium: input.annualPremium,
    })
    .select('id')
    .maybeSingle()

  if (vehicleError || !insertedVehicle?.id) {
    return { ok: false, message: vehicleError?.message ?? 'Failed to insert vehicle' }
  }
  const firstVehicleId = String(insertedVehicle.id)

  // Mirror the admin-entered policy into the `policies` table so the member
  // dashboard sees "Active policy" instead of "No active policy".
  // This is best-effort: if date parsing fails or the migration hasn't been
  // applied yet, we keep going and let the dashboard fall back to the
  // `vehicles` row for display.
  const policyForDashboard = adminPolicyToDashboardRow({
    userId: uid,
    policyNumber: input.policyNumber,
    effectiveLabel: input.policyEffectiveDate,
    expirationLabel: input.policyExpirationDate,
    annualPremium: input.annualPremium,
  })

  let initialInvoiceWarning: string | null = null
  if (policyForDashboard) {
    // Avoid duplicate-key clashes on re-creates / edits.
    await admin.from('policies').delete().eq('user_id', uid)
    const { data: policyInsert, error: policyInsertError } = await admin
      .from('policies')
      .insert({ ...policyForDashboard, vehicle_id: firstVehicleId })
      .select('id')
      .maybeSingle()
    if (policyInsertError) {
      return {
        ok: true,
        warning: `Client created, but the dashboard policy row could not be inserted: ${policyInsertError.message}. Run the latest Supabase migrations (policies/invoices) and re-save the client to fix.`,
      }
    }
    // Delete any prior "due" invoices for this user so re-saves don't stack
    // up unpaid balances. Paid invoices in billing history are preserved.
    await admin
      .from('invoices')
      .delete()
      .eq('user_id', uid)
      .in('status', ['due', 'failed', 'pending'])
    const policyId =
      policyInsert && (policyInsert as { id?: string }).id
        ? String((policyInsert as { id?: string }).id)
        : null
    if (policyId) {
      initialInvoiceWarning = await insertInitialInvoiceForPolicy(admin, {
        userId: uid,
        policyId,
        policyNumber: policyForDashboard.policy_number,
        amountCents: resolveTermPremiumCents({
          planKey: policyForDashboard.plan_key,
          annualPremiumDollars: input.annualPremium,
        }),
        effectiveIso: policyForDashboard.effective_date,
      })
    }
  }

  const { error: coverageError } = await admin
    .from('coverage')
    .update({
      liability: input.liability,
      collision: input.collision,
      comprehensive: input.comprehensive,
      uninsured_motorist: input.uninsuredMotorist,
      medical_payments: input.medicalPayments,
      roadside_assistance: input.roadsideAssistance,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', uid)

  if (coverageError) {
    return { ok: false, message: coverageError.message }
  }

  let insuranceCardStored = false
  let cardWarning: string | undefined

  if (cardBuffer && cardMeta) {
    await removeStaleInsuranceCardObjects(admin, BUCKET, uid, cardMeta.objectName)
    const storedCardPath = `${uid}/${cardMeta.objectName}`
    const { error: upErr } = await admin.storage.from(BUCKET).upload(storedCardPath, cardBuffer, {
      contentType: cardMeta.contentType,
      upsert: true,
    })
    if (upErr) {
      cardWarning = `Account was created, but the insurance card file was not saved (storage error): ${upErr.message}`
    } else {
      const { error: pathErr } = await admin
        .from('profiles')
        .update({ insurance_card_pdf_path: storedCardPath })
        .eq('id', uid)
      await admin
        .from('vehicles')
        .update({ insurance_card_pdf_path: storedCardPath })
        .eq('id', firstVehicleId)
      if (pathErr) {
        cardWarning = `Account was created, but the insurance card link was not saved: ${pathErr.message}`
      } else {
        insuranceCardStored = true
      }
    }
  }

  if (!input.skipWelcomeEmail) {
    try {
      const resend = getResendClient()
      const from = getResendFromAddress()
      if (resend && from) {
        const { subject, text } = buildPolicyIssuedEmail({
          fullName: input.name,
          policyNumber: input.policyNumber,
          effectiveDate: input.policyEffectiveDate,
          vehicleName: input.vehicleName,
          mentionAttachedCard: insuranceCardStored,
          loginEmail: input.email,
          loginPassword: input.password,
          loginUrl: 'https://njcoverage.com/login',
        })
        await resend.emails.send({
          from,
          to: input.email,
          subject,
          text,
          attachments:
            insuranceCardStored && cardBuffer && cardMeta
              ? [
                  {
                    filename: cardMeta.objectName,
                    content: cardBuffer,
                  },
                ]
              : undefined,
        })
      }
    } catch {
      /* ignore email failures */
    }
  }

  const combinedWarning =
    cardWarning && initialInvoiceWarning
      ? `${cardWarning} · ${initialInvoiceWarning}`
      : cardWarning ?? initialInvoiceWarning ?? undefined
  return combinedWarning ? { ok: true, warning: combinedWarning } : { ok: true }
}

/**
 * Result of an "add another vehicle to an existing customer" operation.
 *
 * Same shape as {@link CreateInsuredClientResult} plus enrichment fields the
 * integrations API returns so the caller can render "vehicle #2 added" UX.
 */
export type AddVehicleToExistingClientResult =
  | {
      ok: true
      userId: string
      vehicleId: string | null
      policyId: string | null
      warning?: string
    }
  | { ok: false; message: string }

/**
 * Look up an existing portal account by email. Used by the integrations API
 * to branch to "add vehicle" without attempting `createUser` (which can have
 * side effects and must never overwrite the account holder's name).
 */
export async function lookupExistingClientByEmail (
  email: string
): Promise<{ id: string; name: string | null } | null> {
  const url = getSupabaseProjectUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null
  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return findExistingUserId(admin, email)
}

async function findExistingUserId (
  admin: SupabaseClient,
  email: string
): Promise<{ id: string; name: string | null } | null> {
  const trimmed = email.trim()
  if (!trimmed) return null

  // Fast path: profiles table has email column and we already have service-role.
  const { data: profileMatchData } = await admin
    .from('profiles')
    .select('id, name, email')
    .ilike('email', trimmed)
    .limit(1)
    .maybeSingle()
  const profileMatch = profileMatchData as
    | { id?: string; name?: string | null; email?: string | null }
    | null
  if (profileMatch?.id) {
    return { id: String(profileMatch.id), name: profileMatch.name ?? null }
  }

  // Fallback: paginate auth users. Handles the (rare) case where the profile
  // trigger didn't run or the email was updated only on auth.
  const target = trimmed.toLowerCase()
  const perPage = 200
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error || !data) break
    const hit = data.users.find(
      u => (u.email ?? '').toLowerCase() === target
    )
    if (hit?.id) {
      const meta = (hit.user_metadata ?? {}) as { name?: string }
      return { id: hit.id, name: meta.name ?? null }
    }
    if (data.users.length < perPage) break
  }

  return null
}

/**
 * Insert an additional vehicle + policy for an existing customer, without
 * touching their auth account, profile, or existing vehicles. Used when the
 * integrations API is called with an email that already has an account —
 * instead of failing with "already registered", we add the car so the member
 * sees a second policy on their dashboard.
 */
export async function addVehicleToExistingClient (
  input: AdminCreateInput,
  optional: { pdfBuffer?: Buffer | null; pdfMeta?: { objectName: string; contentType: string } | null } = {}
): Promise<AddVehicleToExistingClientResult> {
  const url = getSupabaseProjectUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    return {
      ok: false,
      message:
        'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY. Add them in Vercel → Environment Variables and redeploy.',
    }
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const found = await findExistingUserId(admin, input.email)
  if (!found) {
    return {
      ok: false,
      message:
        'Could not find an existing user with that email — refusing to silently create a new account.',
    }
  }
  const uid = found.id
  // Never adopt the bot's per-vehicle insured name on the account — keep the
  // original profile name for welcome emails and the member dashboard header.
  // This path must NEVER update profiles.name or auth.users.user_metadata.name.
  const displayName = (found.name || '').trim() || 'Policyholder'
  const incomingName = (input.name || '').trim()
  if (
    incomingName &&
    displayName !== 'Policyholder' &&
    incomingName.toLowerCase() !== displayName.toLowerCase()
  ) {
    console.info(
      '[addVehicleToExistingClient] Ignoring incoming name for existing account',
      { userId: uid, existingName: displayName, incomingName },
    )
  }

  const { data: insertedVehicle, error: vehicleError } = await admin
    .from('vehicles')
    .insert({
      user_id: uid,
      vehicle_name: input.vehicleName,
      vin: input.vin,
      model_year: input.modelYear,
      vehicle_make: input.vehicleMake,
      vehicle_model: input.vehicleModel,
      trim_level: input.trimLevel,
      body_class: input.bodyClass,
      policy_number: input.policyNumber,
      policy_effective_date: input.policyEffectiveDate,
      policy_expiration_date: input.policyExpirationDate,
      policy_address: input.policyAddress,
      annual_premium: input.annualPremium,
    })
    .select('id')
    .maybeSingle()

  if (vehicleError || !insertedVehicle?.id) {
    return {
      ok: false,
      message:
        vehicleError?.message ??
        'Failed to insert vehicle row for existing customer.',
    }
  }
  const vehicleId = String(insertedVehicle.id)

  const policyForDashboard = adminPolicyToDashboardRow({
    userId: uid,
    policyNumber: input.policyNumber,
    effectiveLabel: input.policyEffectiveDate,
    expirationLabel: input.policyExpirationDate,
    annualPremium: input.annualPremium,
  })

  let policyId: string | null = null
  let invoiceWarning: string | null = null
  if (policyForDashboard) {
    const { data: insertedPolicy, error: policyInsertError } = await admin
      .from('policies')
      .insert({ ...policyForDashboard, vehicle_id: vehicleId })
      .select('id')
      .maybeSingle()
    if (policyInsertError) {
      return {
        ok: true,
        userId: uid,
        vehicleId,
        policyId: null,
        warning: `Vehicle added, but the second policy row could not be inserted: ${policyInsertError.message}. Run the latest Supabase migrations (policies/invoices) and re-issue the card to fix.`,
      }
    }
    policyId = insertedPolicy?.id ? String(insertedPolicy.id) : null
    if (policyId) {
      invoiceWarning = await insertInitialInvoiceForPolicy(admin, {
        userId: uid,
        policyId,
        policyNumber: policyForDashboard.policy_number,
        amountCents: resolveTermPremiumCents({
          planKey: policyForDashboard.plan_key,
          annualPremiumDollars: input.annualPremium,
        }),
        effectiveIso: policyForDashboard.effective_date,
      })
    }
  }

  let cardWarning: string | undefined
  if (optional.pdfBuffer && optional.pdfMeta) {
    // Per-vehicle path so it doesn't clobber the customer's first card.
    const perVehicleName = `vehicle-${vehicleId}.${optional.pdfMeta.objectName.split('.').pop() || 'pdf'}`
    const storedCardPath = `${uid}/${perVehicleName}`
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(storedCardPath, optional.pdfBuffer, {
        contentType: optional.pdfMeta.contentType,
        upsert: true,
      })
    if (upErr) {
      cardWarning = `Vehicle + policy added, but the insurance card file was not saved (storage error): ${upErr.message}`
    } else {
      // Store the per-vehicle card path on the vehicle row. Best-effort: if
      // the column doesn't exist yet (migration not applied), we skip
      // silently — the file is still in storage and can be surfaced later.
      const { error: vehCardErr } = await admin
        .from('vehicles')
        .update({ insurance_card_pdf_path: storedCardPath })
        .eq('id', vehicleId)
      if (vehCardErr && !/column .* insurance_card_pdf_path/i.test(vehCardErr.message)) {
        cardWarning = `Vehicle + policy added, but linking the insurance card to the vehicle failed: ${vehCardErr.message}`
      }

      // Also update the profile pointer so the DocumentsCard "download insurance
      // card" button on the dashboard opens the newest card (until per-vehicle
      // links land in the UI).
      await admin
        .from('profiles')
        .update({ insurance_card_pdf_path: storedCardPath })
        .eq('id', uid)
    }
  }

  // Fire the "vehicle added" welcome email unless the caller wants to send
  // its own (bot flow sets skipWelcomeEmail=true and delivers via Resend).
  if (!input.skipWelcomeEmail) {
    try {
      const resend = getResendClient()
      const from = getResendFromAddress()
      if (resend && from) {
        const { subject, text } = buildPolicyIssuedEmail({
          fullName: displayName || 'Policyholder',
          policyNumber: input.policyNumber,
          effectiveDate: input.policyEffectiveDate,
          vehicleName: input.vehicleName,
          mentionAttachedCard: !!optional.pdfBuffer,
          loginEmail: input.email,
          loginPassword: '',
          loginUrl: 'https://njcoverage.com/login',
        })
        await resend.emails.send({
          from,
          to: input.email,
          subject: subject.replace(/^Your policy is active/i, 'Your new vehicle policy is active'),
          text,
          attachments:
            optional.pdfBuffer && optional.pdfMeta
              ? [{ filename: optional.pdfMeta.objectName, content: optional.pdfBuffer }]
              : undefined,
        })
      }
    } catch {
      /* email failures don't fail the add-vehicle flow */
    }
  }

  const combinedWarning =
    cardWarning && invoiceWarning
      ? `${cardWarning} · ${invoiceWarning}`
      : cardWarning ?? invoiceWarning ?? undefined
  return combinedWarning
    ? { ok: true, userId: uid, vehicleId, policyId, warning: combinedWarning }
    : { ok: true, userId: uid, vehicleId, policyId }
}

export async function createInsuredClientViaSupabaseAdmin (
  input: AdminCreateInput
): Promise<CreateInsuredClientResult> {
  const fd = new FormData()
  fd.set('email', input.email)
  fd.set('password', input.password)
  fd.set('name', input.name)
  fd.set('memberSince', input.memberSince)
  fd.set('phone', input.phone)
  fd.set('vehicleName', input.vehicleName)
  fd.set('vin', input.vin)
  fd.set('modelYear', input.modelYear)
  fd.set('vehicleMake', input.vehicleMake)
  fd.set('vehicleModel', input.vehicleModel)
  fd.set('trimLevel', input.trimLevel)
  fd.set('bodyClass', input.bodyClass)
  fd.set('policyNumber', input.policyNumber)
  fd.set('policyEffectiveDate', input.policyEffectiveDate)
  fd.set('policyExpirationDate', input.policyExpirationDate)
  fd.set('policyAddress', input.policyAddress)
  fd.set('annualPremium', String(input.annualPremium))
  const boolFields: (keyof AdminCreateInput)[] = [
    'liability',
    'collision',
    'comprehensive',
    'uninsuredMotorist',
    'medicalPayments',
    'roadsideAssistance',
  ]
  for (const k of boolFields) {
    fd.set(k, input[k] ? 'true' : 'false')
  }
  if (input.skipWelcomeEmail) {
    fd.set('skipWelcomeEmail', 'true')
  }
  return createInsuredClientFromFormAction(fd)
}
