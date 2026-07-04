import type Stripe from 'stripe'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe/server'
import { getSupabaseProjectUrl } from '@/lib/supabase/admin-env'

/** Admin Supabase client (service role) — bypasses RLS for webhook + billing writes. */
function getAdminSupabase () {
  const url = getSupabaseProjectUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null
  return createAdminClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Get or lazily create the Stripe Customer attached to a profile.
 * Stores the customer id on `profiles.stripe_customer_id` (unique).
 */
export async function getOrCreateStripeCustomerForUser (
  userId: string
): Promise<{ customerId: string; stripe: Stripe } | { error: string }> {
  const stripe = getStripe()
  if (!stripe) return { error: 'Stripe is not configured (STRIPE_SECRET_KEY).' }

  const admin = getAdminSupabase()
  if (!admin) {
    return {
      error:
        'Supabase admin not configured (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).',
    }
  }

  const { data: profile, error } = await admin
    .from('profiles')
    .select('id, email, name, stripe_customer_id')
    .eq('id', userId)
    .single()

  if (error || !profile) {
    return { error: 'Profile not found.' }
  }

  if (profile.stripe_customer_id) {
    return { customerId: profile.stripe_customer_id, stripe }
  }

  const created = await stripe.customers.create({
    email: profile.email || undefined,
    name: profile.name || undefined,
    metadata: { user_id: userId },
  })

  const { error: updErr } = await admin
    .from('profiles')
    .update({ stripe_customer_id: created.id })
    .eq('id', userId)

  if (updErr) {
    return {
      error: `Stripe customer created but profile update failed: ${updErr.message}`,
    }
  }

  return { customerId: created.id, stripe }
}

export { getAdminSupabase }
