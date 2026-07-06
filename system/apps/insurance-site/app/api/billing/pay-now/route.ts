import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateStripeCustomerForUser, getAdminSupabase } from '@/lib/stripe/customers'
import { getPublicOriginFromRequest } from '@/lib/site-url'

export const runtime = 'nodejs'

const bodySchema = z.object({
  invoiceId: z.string().uuid().optional(),
})

/**
 * Member-initiated payment for the open invoice. Creates a Stripe Checkout
 * Session (mode=payment) tied to the invoice by metadata; the webhook
 * (`checkout.session.completed`) marks the invoice paid.
 */
export async function POST (request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 })
  }

  let body: { invoiceId?: string } = {}
  try {
    body = await request.json()
  } catch {
    // empty body is fine — we pick the oldest open invoice
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const admin = getAdminSupabase()
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: 'Server billing is not configured.' },
      { status: 503 }
    )
  }

  let invoiceQuery = admin
    .from('invoices')
    .select('id, user_id, amount_cents, status, period_label, policy_id, due_date')
    .eq('user_id', user.id)
    .in('status', ['due', 'failed'])
    .order('due_date', { ascending: true })
    .limit(1)

  if (parsed.data.invoiceId) {
    invoiceQuery = admin
      .from('invoices')
      .select('id, user_id, amount_cents, status, period_label, policy_id, due_date')
      .eq('id', parsed.data.invoiceId)
      .eq('user_id', user.id)
      .limit(1)
  }

  const { data: rows, error: invErr } = await invoiceQuery
  if (invErr) {
    return NextResponse.json({ ok: false, error: invErr.message }, { status: 500 })
  }
  const invoice = rows?.[0]
  if (!invoice) {
    return NextResponse.json(
      { ok: false, error: 'No open invoice to pay.' },
      { status: 404 }
    )
  }
  if (invoice.status === 'paid') {
    return NextResponse.json(
      { ok: false, error: 'Invoice already paid.' },
      { status: 409 }
    )
  }
  if (invoice.amount_cents <= 0) {
    return NextResponse.json(
      { ok: false, error: 'Invoice amount is zero — nothing to charge.' },
      { status: 400 }
    )
  }

  const cust = await getOrCreateStripeCustomerForUser(user.id)
  if ('error' in cust) {
    return NextResponse.json({ ok: false, error: cust.error }, { status: 503 })
  }

  const base = getPublicOriginFromRequest(request)
  const session = await cust.stripe.checkout.sessions.create({
    mode: 'payment',
    customer: cust.customerId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: invoice.amount_cents,
          product_data: {
            name: `Auto insurance — ${invoice.period_label}`,
            description: 'Tri State Coverage policy payment',
          },
        },
      },
    ],
    metadata: {
      invoice_id: invoice.id,
      user_id: user.id,
      ...(invoice.policy_id ? { policy_id: invoice.policy_id } : {}),
    },
    success_url: `${base}/dashboard?paid=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/dashboard?paid=0`,
  })

  await admin
    .from('invoices')
    .update({
      status: 'pending',
      stripe_checkout_session_id: session.id,
    })
    .eq('id', invoice.id)

  return NextResponse.json({ ok: true, url: session.url })
}
