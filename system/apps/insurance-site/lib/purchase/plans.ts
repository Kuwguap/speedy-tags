import { addMonths } from 'date-fns'

export type PurchasePlanKey = '1m' | '6m' | '12m' | 'monthly'

export type PurchasePlanDef = {
  key: PurchasePlanKey
  label: string
  priceLabel: string
  /** Stripe Checkout mode */
  mode: 'payment' | 'subscription'
  /** USD cents */
  unitAmountCents: number
  description: string
}

export const PURCHASE_PLANS: PurchasePlanDef[] = [
  {
    key: '1m',
    label: '1 month',
    priceLabel: '$100',
    mode: 'payment',
    unitAmountCents: 100_00,
    description: 'One-time payment',
  },
  {
    key: '6m',
    label: '6 months',
    priceLabel: '$500',
    mode: 'payment',
    unitAmountCents: 500_00,
    description: 'One-time payment',
  },
  {
    key: '12m',
    label: '12 months',
    priceLabel: '$900',
    mode: 'payment',
    unitAmountCents: 900_00,
    description: 'One-time payment',
  },
  {
    key: 'monthly',
    label: 'Monthly',
    priceLabel: '$100/mo',
    mode: 'subscription',
    unitAmountCents: 100_00,
    description: 'Recurring monthly',
  },
]

export function getPlan (key: string): PurchasePlanDef | undefined {
  return PURCHASE_PLANS.find(p => p.key === key)
}

/** Expiration date shown on ID card / policy summary. */
export function expirationForPlan (effective: Date, planKey: PurchasePlanKey): Date {
  switch (planKey) {
    case '1m':
    case 'monthly':
      return addMonths(effective, 1)
    case '6m':
      return addMonths(effective, 6)
    case '12m':
      return addMonths(effective, 12)
    default:
      return addMonths(effective, 1)
  }
}

/**
 * Generate a NJ Coverage policy number.
 *
 * Format: `ABP63` + 8 random digits (13 chars total). Example: `ABP6300173880`.
 * The leading `ABP63` is fixed; the trailing 8 digits are a zero-padded random
 * integer in the range [0, 99_999_999], so every result has the same length.
 */
export function generatePolicyNumber (): string {
  const n = Math.floor(Math.random() * 100_000_000)
  return `ABP63${String(n).padStart(8, '0')}`
}
