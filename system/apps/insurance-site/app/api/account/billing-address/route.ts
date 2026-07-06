import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/server'

export const runtime = 'nodejs'

const bodySchema = z.object({
  line1: z.string().min(2).max(200),
  line2: z.string().max(200).optional().default(''),
  city: z.string().min(1).max(80),
  state: z.string().min(2).max(40),
  postalCode: z.string().min(3).max(20),
  country: z.string().min(2).max(2).default('US'),
})

/**
 * Update the signed-in user's billing address (used on receipts +
 * Policy Declaration). Also pushes the address up to Stripe if the user
 * already has a customer record, so card receipts carry the right address.
 */
export async function POST (request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 })
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }
  const a = parsed.data

  const { data: updated, error } = await supabase
    .from('profiles')
    .update({
      billing_address_line1: a.line1.trim(),
      billing_address_line2: a.line2.trim(),
      billing_city: a.city.trim(),
      billing_state: a.state.trim().toUpperCase(),
      billing_postal_code: a.postalCode.trim(),
      billing_country: a.country.trim().toUpperCase(),
    })
    .eq('id', user.id)
    .select('stripe_customer_id')
    .single()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const stripe = getStripe()
  if (stripe && updated?.stripe_customer_id) {
    try {
      await stripe.customers.update(updated.stripe_customer_id, {
        address: {
          line1: a.line1.trim(),
          line2: a.line2.trim() || undefined,
          city: a.city.trim(),
          state: a.state.trim().toUpperCase(),
          postal_code: a.postalCode.trim(),
          country: a.country.trim().toUpperCase(),
        },
      })
    } catch {
      // non-fatal — the local DB is the source of truth for declaration PDFs
    }
  }

  return NextResponse.json({ ok: true })
}
