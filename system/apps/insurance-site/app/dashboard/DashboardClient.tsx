'use client'

import { useEffect, useRef } from 'react'
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
import type { DashboardInsuranceData, DashboardPolicy } from '@/lib/supabase/dashboard-data'
import { DEFAULT_MONTHLY_PREMIUM_CENTS } from '@/lib/supabase/dashboard-data'

function parseLooseDateToIso (s: string | null | undefined): string | null {
  const t = (s ?? '').trim()
  if (!t || t === '—') return null
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return null
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function addMonthsToIsoDate (iso: string, months: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  d.setUTCMonth(d.getUTCMonth() + Math.max(0, months))
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function monthsBetween (effIso: string, expIso: string): number {
  const a = new Date(`${effIso}T00:00:00Z`).getTime()
  const b = new Date(`${expIso}T00:00:00Z`).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 1
  return Math.max(1, Math.round((b - a) / (1000 * 60 * 60 * 24 * 30.4375)))
}

function currentPeriodEnd (effectiveIso: string, renewalIso: string): string {
  const termMonths = monthsBetween(effectiveIso, renewalIso)
  if (termMonths <= 1) return renewalIso
  const first = addMonthsToIsoDate(effectiveIso, 1)
  return first <= renewalIso ? first : renewalIso
}

/** Last-resort display policy built from a `vehicles` row when no `policies` link exists. */
function policyFromVehicleRow (vehicle: DashboardInsuranceData): DashboardPolicy | null {
  const polNum = vehicle.policyNumber?.trim()
  if (!polNum || polNum === '—') return null
  const effIso = parseLooseDateToIso(vehicle.policyEffectiveDate)
  const expIso = parseLooseDateToIso(vehicle.policyExpirationDate)
  if (!effIso || !expIso) return null
  const months = monthsBetween(effIso, expIso)
  return {
    id: `veh:${vehicle.vehicleId ?? vehicle.vin}`,
    policyNumber: polNum,
    planKey: months >= 12 ? '12m' : months >= 6 ? '6m' : '1m',
    status: new Date(`${expIso}T00:00:00Z`).getTime() < Date.now() ? 'lapsed' : 'active',
    monthlyPremiumCents: DEFAULT_MONTHLY_PREMIUM_CENTS,
    effectiveDateIso: effIso,
    renewalDateIso: expIso,
    currentPeriodEndIso: currentPeriodEnd(effIso, expIso),
    autopayEnabled: false,
    vehicleId: vehicle.vehicleId ?? null,
  }
}

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
  const billingReconciledRef = useRef(false)

  useEffect(() => {
    if (!authReady) return
    if (!user) {
      router.push('/login')
    }
  }, [authReady, user, router])

  useEffect(() => {
    if (!authReady || !user || billingReconciledRef.current) return
    billingReconciledRef.current = true

    const sessionId = searchParams.get('session_id')
    const paid = searchParams.get('paid')
    const autopay = searchParams.get('autopay')

    void (async () => {
      try {
        await fetch('/api/billing/confirm-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sessionId ? { sessionId } : {}),
        })
      } catch {
        // Webhook may still reconcile later.
      }
      await refreshUserData()

      if (paid === '1' || autopay === '1') {
        const url = new URL(window.location.href)
        url.searchParams.delete('paid')
        url.searchParams.delete('autopay')
        url.searchParams.delete('session_id')
        window.history.replaceState({}, '', url.toString())
      }
    })()
  }, [authReady, user, searchParams, refreshUserData])

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
  const hasActivePolicy = activePolicies.length > 0 || vehicles.length > 0

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
    const legacyPolicy = activePolicies.find(
      p => p.policyNumber && p.policyNumber === v.policyNumber && !consumedPolicyIds.has(p.id)
    )
    if (legacyPolicy) {
      pairs.push({ key: `veh:${v.vehicleId ?? v.vin}`, policy: legacyPolicy, vehicle: v })
      consumedPolicyIds.add(legacyPolicy.id)
      continue
    }
    const synthesized = policyFromVehicleRow(v)
    if (synthesized) {
      pairs.push({ key: `veh:${v.vehicleId ?? v.vin}`, policy: synthesized, vehicle: v })
      consumedPolicyIds.add(synthesized.id)
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

      <main className="safe-page-x safe-page-b mx-auto max-w-6xl py-6 sm:py-8 md:py-12">
        <section className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
              Member dashboard
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">
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

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="min-w-0 lg:col-span-3">
            <BillingHistoryCard invoices={billingHistory} />
          </div>
          <div className="min-w-0 lg:col-span-2">
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
