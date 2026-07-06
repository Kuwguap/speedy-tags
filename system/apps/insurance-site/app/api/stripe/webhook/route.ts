import { NextResponse, type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe/server'
import { getAdminSupabase } from '@/lib/stripe/customers'
import { markInvoicePaidFromCheckoutSession } from '@/lib/stripe/invoice-payment'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Stripe webhook → keeps `invoices` + `policies` in sync.
 *
 * Configure in the Stripe dashboard with endpoint:
 *   https://<your-site>/api/stripe/webhook
 *
 * Required env:
 *   STRIPE_SECRET_KEY            (signs requests outbound)
 *   STRIPE_WEBHOOK_SECRET        (this endpoint's signing secret)
 *   SUPABASE_SERVICE_ROLE_KEY    (so writes bypass RLS)
 *
 * Events handled:
 *   - checkout.session.completed       → mark linked invoice paid
 *   - invoice.paid / invoice.payment_succeeded  → insert monthly invoice for AutoPay subs
 *   - invoice.payment_failed           → mark invoice failed
 *   - customer.subscription.deleted    → flag policy.autopay_enabled = false
 */
export async function POST (request: NextRequest) {
  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json(
      { ok: false, error: 'Stripe not configured.' },
      { status: 503 }
    )
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'STRIPE_WEBHOOK_SECRET not set.' },
      { status: 503 }
    )
  }

  const sig = request.headers.get('stripe-signature') ?? ''
  const raw = await request.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'invalid signature'
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }

  const admin = getAdminSupabase()
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: 'Admin Supabase not configured.' },
      { status: 503 }
    )
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const policyId = session.metadata?.policy_id

        await markInvoicePaidFromCheckoutSession(admin, session)

        if (policyId && session.mode === 'subscription' && session.subscription) {
          const subId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id
          await admin
            .from('policies')
            .update({
              autopay_enabled: true,
              stripe_subscription_id: subId,
              stripe_customer_id:
                typeof session.customer === 'string'
                  ? session.customer
                  : (session.customer?.id ?? null),
              status: 'active',
            })
            .eq('id', policyId)
        }

        break
      }

      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        const inv = event.data.object as Stripe.Invoice
        const customerId =
          typeof inv.customer === 'string' ? inv.customer : inv.customer?.id

        if (!customerId) break

        const { data: profile } = await admin
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle()

        if (!profile) break

        const periodEnd = inv.lines?.data?.[0]?.period?.end
        const periodLabel = periodEnd
          ? new Date(periodEnd * 1000).toLocaleString('en-US', {
              month: 'short',
              year: 'numeric',
            })
          : `Invoice ${inv.number ?? inv.id}`

        // Idempotent: skip if we already recorded this stripe invoice.
        const { data: existing } = await admin
          .from('invoices')
          .select('id')
          .eq('stripe_invoice_id', inv.id)
          .maybeSingle()

        if (existing?.id) {
          await admin
            .from('invoices')
            .update({ status: 'paid', paid_at: new Date().toISOString() })
            .eq('id', existing.id)
        } else {
          const { data: policy } = await admin
            .from('policies')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .eq('autopay_enabled', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          await admin.from('invoices').insert({
            user_id: profile.id,
            policy_id: policy?.id ?? null,
            period_label: periodLabel,
            due_date: new Date(
              (inv.due_date ?? Math.floor(Date.now() / 1000)) * 1000
            )
              .toISOString()
              .slice(0, 10),
            amount_cents: inv.amount_paid ?? inv.amount_due ?? 0,
            status: 'paid',
            stripe_invoice_id: inv.id,
            paid_at: new Date().toISOString(),
          })
        }
        break
      }

      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice
        if (!inv.id) break
        await admin
          .from('invoices')
          .update({ status: 'failed' })
          .eq('stripe_invoice_id', inv.id)
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await admin
          .from('policies')
          .update({ autopay_enabled: false })
          .eq('stripe_subscription_id', sub.id)
        break
      }

      default:
        break
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'webhook handler error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
