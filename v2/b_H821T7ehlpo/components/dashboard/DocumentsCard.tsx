'use client'

import { useState } from 'react'
import { isSupabaseConfigured } from '@/lib/supabase/client'
import { insuranceCardDownloadFilename } from '@/lib/pdf-download-name'

const INSURANCE_CARD_API = '/api/insurance-card-pdf'
const POLICY_DECL_API = '/api/documents/policy-declaration'

function isIOSLikeMobile (): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || '')
}

export type DocumentsCardVehicle = {
  vehicleId: string | null
  vehicleName: string
  policyNumber: string
  insuranceCardPdfPath: string | null | undefined
}

type Props = {
  policyholderName: string
  insuranceCardPath: string | null | undefined
  hasActivePolicy: boolean
  /**
   * When present with more than one entry, the card renders a separate
   * View/Download row per vehicle so multi-policy customers can access every
   * insurance card. Falls back to the single-card layout for single-vehicle
   * customers or missing data.
   */
  vehicles?: DocumentsCardVehicle[]
}

export default function DocumentsCard ({
  policyholderName,
  insuranceCardPath,
  hasActivePolicy,
  vehicles,
}: Props) {
  const [busy, setBusy] = useState<
    | 'card-view'
    | 'card-dl'
    | 'decl-view'
    | 'decl-dl'
    | { kind: 'veh-view' | 'veh-dl'; vehicleId: string }
    | null
  >(null)
  const [err, setErr] = useState('')

  const perVehicleCards = (vehicles ?? []).filter(
    v => !!v.insuranceCardPdfPath && !!v.vehicleId
  )
  const hasPerVehicleCards = perVehicleCards.length > 1

  const insuranceCardAvailable = isSupabaseConfigured() && !!insuranceCardPath

  const fname = insuranceCardDownloadFilename(policyholderName, insuranceCardPath ?? null)

  function open (url: string) {
    if (isIOSLikeMobile()) {
      window.location.href = url
    } else {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  function download (url: string, filename: string) {
    if (isIOSLikeMobile()) {
      window.location.href = url
      return
    }
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <section className="surface-card p-6 md:p-8">
      <h2 className="text-lg font-semibold text-slate-900">Documents</h2>
      <p className="mt-1 text-sm text-slate-500">
        View or download your insurance documents below.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {hasPerVehicleCards ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:col-span-1">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
                <span aria-hidden>📄</span>
              </div>
              <div>
                <p className="font-semibold text-slate-900">Insurance cards</p>
                <p className="text-xs text-slate-500">
                  {perVehicleCards.length} vehicles on this account
                </p>
              </div>
            </div>
            <ul className="mt-4 space-y-3">
              {perVehicleCards.map(v => {
                const vehicleId = v.vehicleId as string
                const viewBusy =
                  typeof busy === 'object' && busy?.kind === 'veh-view' && busy.vehicleId === vehicleId
                const dlBusy =
                  typeof busy === 'object' && busy?.kind === 'veh-dl' && busy.vehicleId === vehicleId
                const url = `${INSURANCE_CARD_API}?vehicleId=${encodeURIComponent(vehicleId)}`
                return (
                  <li
                    key={vehicleId}
                    className="rounded-xl border border-slate-200 bg-white p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {v.vehicleName || 'Vehicle'}
                      </p>
                      <p className="truncate font-mono text-[11px] uppercase tracking-wide text-slate-500">
                        {v.policyNumber || '—'}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => {
                          setBusy({ kind: 'veh-view', vehicleId })
                          setErr('')
                          try {
                            open(`${url}&inline=1`)
                          } catch {
                            setErr('Could not open document.')
                          } finally {
                            window.setTimeout(() => setBusy(null), 400)
                          }
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {viewBusy ? 'Opening…' : 'View'}
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => {
                          setBusy({ kind: 'veh-dl', vehicleId })
                          setErr('')
                          try {
                            const cardFname = insuranceCardDownloadFilename(
                              `${policyholderName} — ${v.vehicleName || 'vehicle'}`,
                              v.insuranceCardPdfPath ?? null
                            )
                            download(url, cardFname)
                          } catch {
                            setErr('Download failed.')
                          } finally {
                            window.setTimeout(() => setBusy(null), 600)
                          }
                        }}
                        className="btn-primary-brand px-3 py-2 text-xs"
                      >
                        {dlBusy ? 'Downloading…' : 'Download'}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
                <span aria-hidden>📄</span>
              </div>
              <div>
                <p className="font-semibold text-slate-900">Insurance card</p>
                <p className="text-xs text-slate-500">NY FS-20 PDF</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!insuranceCardAvailable || busy !== null}
                onClick={() => {
                  setBusy('card-view')
                  setErr('')
                  try {
                    open(`${INSURANCE_CARD_API}?inline=1`)
                  } catch {
                    setErr('Could not open document.')
                  } finally {
                    window.setTimeout(() => setBusy(null), 400)
                  }
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === 'card-view' ? 'Opening…' : 'View'}
              </button>
              <button
                type="button"
                disabled={!insuranceCardAvailable || busy !== null}
                onClick={() => {
                  setBusy('card-dl')
                  setErr('')
                  try {
                    download(INSURANCE_CARD_API, fname)
                  } catch {
                    setErr('Download failed.')
                  } finally {
                    window.setTimeout(() => setBusy(null), 600)
                  }
                }}
                className="btn-primary-brand px-3 py-2 text-xs"
              >
                {busy === 'card-dl' ? 'Downloading…' : 'Download'}
              </button>
            </div>
            {!insuranceCardAvailable && (
              <p className="mt-3 text-xs text-slate-500">
                Issued once your agent uploads it after purchase.
              </p>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <span aria-hidden>📄</span>
            </div>
            <div>
              <p className="font-semibold text-slate-900">Policy declaration</p>
              <p className="text-xs text-slate-500">Generated on demand</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!hasActivePolicy || busy !== null}
              onClick={() => {
                setBusy('decl-view')
                setErr('')
                try {
                  open(`${POLICY_DECL_API}?inline=1`)
                } catch {
                  setErr('Could not open document.')
                } finally {
                  window.setTimeout(() => setBusy(null), 400)
                }
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === 'decl-view' ? 'Opening…' : 'View'}
            </button>
            <button
              type="button"
              disabled={!hasActivePolicy || busy !== null}
              onClick={() => {
                setBusy('decl-dl')
                setErr('')
                try {
                  download(POLICY_DECL_API, `policy-declaration.pdf`)
                } catch {
                  setErr('Download failed.')
                } finally {
                  window.setTimeout(() => setBusy(null), 600)
                }
              }}
              className="btn-primary-brand px-3 py-2 text-xs"
            >
              {busy === 'decl-dl' ? 'Downloading…' : 'Download'}
            </button>
          </div>
          {!hasActivePolicy && (
            <p className="mt-3 text-xs text-slate-500">
              Available once a policy is active.
            </p>
          )}
        </div>
      </div>

      {err && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {err}
        </p>
      )}
    </section>
  )
}
