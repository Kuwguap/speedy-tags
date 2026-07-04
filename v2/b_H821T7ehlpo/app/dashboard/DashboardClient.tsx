'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import Header from '@/components/Header'
import PolicyOverviewCard from '@/components/dashboard/PolicyOverviewCard'
import BalanceDueCard from '@/components/dashboard/BalanceDueCard'
import BillingHistoryCard from '@/components/dashboard/BillingHistoryCard'
import DocumentsCard from '@/components/dashboard/DocumentsCard'
import AccountSettingsCard from '@/components/dashboard/AccountSettingsCard'
import BuyInsuranceCta from '@/components/dashboard/BuyInsuranceCta'
import NoPolicyCard from '@/components/dashboard/NoPolicyCard'

export default function DashboardClient () {
  const {
    user,
    insuranceData,
    vehicles,
    activePolicy,
    activePolicies,
    totalMonthlyPremiumCents,
    openInvoice,
    openInvoices,
    openInvoicesTotalCents,
    billingHistory,
    billingAddress,
    logout,
    authReady,
    refreshUserData,
  } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!authReady) return
    if (!user) {
      router.push('/login')
    }
  }, [authReady, user, router])

  useEffect(() => {
    const paid = searchParams.get('paid')
    const autopay = searchParams.get('autopay')
    if (paid === '1' || autopay === '1') {
      void refreshUserData()
      const url = new URL(window.location.href)
      url.searchParams.delete('paid')
      url.searchParams.delete('autopay')
      window.history.replaceState({}, '', url.toString())
    }
  }, [searchParams, refreshUserData])

  if (!authReady || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-b from-slate-100 to-slate-50">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-teal-600 border-t-transparent"
          aria-hidden
        />
        <p className="text-sm font-medium text-slate-600">Loading your dashboard…</p>
      </div>
    )
  }

  const firstName = user.name.split(' ')[0] || user.name
  const hasActivePolicy = activePolicy !== null

  // Pair each vehicle (oldest first) with its policy so multi-car customers
  // see one card per vehicle instead of a naked list of policy numbers.
  const policyById = new Map(activePolicies.map(p => [p.id, p]))
  const policyByVehicle = new Map<string, typeof activePolicies[number]>()
  for (const p of activePolicies) {
    if (p.vehicleId && !policyByVehicle.has(p.vehicleId)) {
      policyByVehicle.set(p.vehicleId, p)
    }
  }
  const consumedPolicyIds = new Set<string>()
  type Pair = {
    key: string
    policy: typeof activePolicies[number]
    vehicle: typeof vehicles[number] | null
  }
  const pairs: Pair[] = []
  for (const v of vehicles) {
    const linked = v.vehicleId ? policyByVehicle.get(v.vehicleId) : undefined
    if (linked) {
      pairs.push({ key: `veh:${v.vehicleId}`, policy: linked, vehicle: v })
      consumedPolicyIds.add(linked.id)
      continue
    }
    // Vehicle without a linked policy row: synthesize a display-only one so
    // the card still renders (falls back to $100/mo default).
    const legacyPolicy = activePolicies.find(
      p => p.policyNumber && p.policyNumber === v.policyNumber
    )
    if (legacyPolicy && !consumedPolicyIds.has(legacyPolicy.id)) {
      pairs.push({ key: `veh:${v.vehicleId ?? v.vin}`, policy: legacyPolicy, vehicle: v })
      consumedPolicyIds.add(legacyPolicy.id)
    }
  }
  // Any policies we couldn't pair (missing vehicle_id / vehicle row) still
  // render as their own card below.
  for (const p of activePolicies) {
    if (consumedPolicyIds.has(p.id)) continue
    pairs.push({ key: `pol:${p.id}`, policy: p, vehicle: null })
    consumedPolicyIds.add(p.id)
  }

  const hasMultiplePolicies = pairs.length > 1
  const primaryPair = pairs[0] ?? null
  // Total premium: use the aggregated value from context (already applies the
  // $100 floor per policy), falling back to just the primary's premium so the
  // "Balance due" card never shows $0 when the customer has coverage.
  const derivedTotal =
    openInvoicesTotalCents > 0
      ? openInvoicesTotalCents
      : totalMonthlyPremiumCents > 0
        ? totalMonthlyPremiumCents
        : (primaryPair?.policy.monthlyPremiumCents ?? 0)
  const aggregatedPolicyForBalance = primaryPair
    ? { ...primaryPair.policy, monthlyPremiumCents: derivedTotal }
    : null
  const vehiclesForDocuments = vehicles
  // Silence unused var lint — policyById is kept for downstream flows that
  // may want O(1) lookup after we add per-policy invoices.
  void policyById

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-white">
      <Header user={user} onLogout={logout} />

      <main className="mx-auto max-w-6xl px-4 py-8 md:py-12">
        <section className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
              Member dashboard
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              Welcome, {firstName}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {hasMultiplePolicies
                ? `You have ${pairs.length} active policies. Manage each one below.`
                : 'Manage your coverage, payments, and documents in one place.'}
            </p>
          </div>
        </section>

        {hasActivePolicy && aggregatedPolicyForBalance && primaryPair ? (
          <>
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <PolicyOverviewCard
                policy={primaryPair.policy}
                vehicle={primaryPair.vehicle}
                isPrimary
                heading={hasMultiplePolicies ? 'Primary policy' : 'Your policy'}
              />
              <BalanceDueCard
                policy={aggregatedPolicyForBalance}
                openInvoice={openInvoice}
                openInvoicesTotalCents={openInvoicesTotalCents}
                openInvoicesCount={openInvoices.length}
                fallbackMonthlyPremiumCents={
                  openInvoicesTotalCents > 0 ? undefined : derivedTotal
                }
              />
            </div>
            {pairs.slice(1).map((pair, idx) => (
              <div key={pair.key} className="mt-6">
                <PolicyOverviewCard
                  policy={pair.policy}
                  vehicle={pair.vehicle}
                  heading={`Additional policy #${idx + 2}`}
                />
              </div>
            ))}
          </>
        ) : (
          <div className="mt-8">
            <NoPolicyCard />
          </div>
        )}

        <div className="mt-6">
          <BuyInsuranceCta hasActivePolicy={hasActivePolicy} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <BillingHistoryCard invoices={billingHistory} />
          </div>
          <div className="lg:col-span-2">
            <DocumentsCard
              policyholderName={user.name}
              insuranceCardPath={insuranceData?.insuranceCardPdfPath ?? null}
              hasActivePolicy={hasActivePolicy}
              vehicles={vehiclesForDocuments.map(v => ({
                vehicleId: v.vehicleId ?? null,
                vehicleName: v.vehicleName,
                policyNumber: v.policyNumber,
                insuranceCardPdfPath: v.insuranceCardPdfPath,
              }))}
            />
          </div>
        </div>

        <div className="mt-6">
          <AccountSettingsCard billingAddress={billingAddress} phone={user.phone} />
        </div>
      </main>
    </div>
  )
}
