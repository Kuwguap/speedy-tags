import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAdminSupabase } from '@/lib/stripe/customers'
import { getStripe } from '@/lib/stripe/server'
import {
  markInvoicePaidFromCheckoutSession,
  reconcilePendingInvoicesForUser,
} from '@/lib/stripe/invoice-payment'

export const runtime = 'nodejs'

const bodySchema = z.object({
  sessionId: z.string().min(1).optional(),
})

/**
 * After Stripe Checkout, mark the linked invoice paid without waiting on webhooks.
 * Also reconciles any other pending invoices for this user (webhook fallback).
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

  const stripe = getStripe()
  const admin = getAdminSupabase()
  if (!stripe || !admin) {
    return NextResponse.json(
      { ok: false, error: 'Server billing is not configured.' },
      { status: 503 }
    )
  }

  let body: { sessionId?: string } = {}
  try {
    body = await request.json()
  } catch {
    // empty body → reconcile all pending
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  let marked = 0
  const sessionId = parsed.data.sessionId?.trim()

  if (sessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId)
      const ownerId = session.metadata?.user_id?.trim()
      if (ownerId && ownerId !== user.id) {
        return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })
      }
      if (await markInvoicePaidFromCheckoutSession(admin, session)) {
        marked += 1
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid checkout session.'
      return NextResponse.json({ ok: false, error: msg }, { status: 400 })
    }
  }

  marked += await reconcilePendingInvoicesForUser(admin, stripe, user.id)

  return NextResponse.json({ ok: true, marked })
}
