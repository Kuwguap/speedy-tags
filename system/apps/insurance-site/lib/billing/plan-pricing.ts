export type PlanKey = '1m' | '6m' | '12m'

/** Total policy price for each term (matches purchase flow + krabinsurancebot). */
export const PLAN_TERM_PREMIUM_CENTS: Record<PlanKey, number> = {
  '1m': 100_00,
  '6m': 500_00,
  '12m': 900_00,
}

export function planKeyForMonthCount (months: number): PlanKey {
  if (months >= 12) return '12m'
  if (months >= 6) return '6m'
  return '1m'
}

export function monthsForPlanKey (planKey: string): number {
  if (planKey === '12m') return 12
  if (planKey === '6m') return 6
  return 1
}

export function termPremiumCentsForPlanKey (planKey: string): number {
  if (planKey === '12m') return PLAN_TERM_PREMIUM_CENTS['12m']
  if (planKey === '6m') return PLAN_TERM_PREMIUM_CENTS['6m']
  return PLAN_TERM_PREMIUM_CENTS['1m']
}

export function monthlyPremiumCentsForPlanKey (planKey: string): number {
  const months = monthsForPlanKey(planKey)
  return Math.max(1, Math.round(termPremiumCentsForPlanKey(planKey) / months))
}

/** Term total from explicit annualPremium dollars or standard plan price. */
export function resolveTermPremiumCents (args: {
  planKey: string
  annualPremiumDollars?: number
}): number {
  const fromAnnual = Math.max(0, Math.round((args.annualPremiumDollars || 0) * 100))
  if (fromAnnual > 0) return fromAnnual
  return termPremiumCentsForPlanKey(args.planKey)
}

export function termPremiumCentsFromMonthly (
  planKey: string,
  monthlyPremiumCents: number
): number {
  const months = monthsForPlanKey(planKey)
  const monthly = monthlyPremiumCents > 0
    ? monthlyPremiumCents
    : monthlyPremiumCentsForPlanKey(planKey)
  return monthly * months
}
