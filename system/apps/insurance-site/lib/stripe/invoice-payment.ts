import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

function paymentIntentId (session: Stripe.Checkout.Session): string | null {
  if (typeof session.payment_intent === 'string') return session.payment_intent
  return session.payment_intent?.id ?? null
}

function isCheckoutSessionPaid (session: Stripe.Checkout.Session): boolean {
  return session.payment_status === 'paid' || session.status === 'complete'
}

export async function markInvoicePaidFromCheckoutSession (
  admin: SupabaseClient,
  session: Stripe.Checkout.Session
): Promise<boolean> {
  const invoiceId = session.metadata?.invoice_id?.trim()
  if (!invoiceId || !isCheckoutSessionPaid(session)) return false

  const { data: invoice, error } = await admin
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId(session),
    })
    .eq('id', invoiceId)
    .select('id, amount_cents, user_id, policy_id')
    .maybeSingle()

  if (error || !invoice) return false

  // Record in the unified cross-app transactions ledger (idempotent on the
  // unique stripe_id). Shared with the tag site so the central dashboard sees
  // every payment in one place.
  await admin.from('transactions').upsert(
    {
      source: 'insurance',
      stripe_id: paymentIntentId(session) || session.id,
      amount_cents: invoice.amount_cents ?? session.amount_total ?? 0,
      status: 'paid',
      user_id: invoice.user_id,
      policy_id: invoice.policy_id,
    },
    { onConflict: 'stripe_id', ignoreDuplicates: true },
  )

  return true
}

export async function reconcilePendingInvoicesForUser (
  admin: SupabaseClient,
  stripe: Stripe,
  userId: string
): Promise<number> {
  const { data: rows, error } = await admin
    .from('invoices')
    .select('id, stripe_checkout_session_id')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .not('stripe_checkout_session_id', 'is', null)

  if (error || !rows?.length) return 0

  let updated = 0
  for (const row of rows) {
    const sessionId = String(row.stripe_checkout_session_id || '').trim()
    if (!sessionId) continue
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId)
      if (await markInvoicePaidFromCheckoutSession(admin, session)) {
        updated += 1
      }
    } catch {
      // Skip invalid or expired sessions.
    }
  }
  return updated
}
