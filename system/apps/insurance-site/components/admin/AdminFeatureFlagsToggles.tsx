'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  getAppFeatureFlagsAction,
  setDashboardCoverageSectionVisibleAction,
} from '@/app/actions/admin-app-feature-flags'

type Props = {
  /**
   * When true, skips the outer card shell so a parent can share one bordered box.
   */
  embedded?: boolean
}

export default function AdminFeatureFlagsToggles ({ embedded = false }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [coverageOn, setCoverageOn] = useState(true)

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
    const res = await getAppFeatureFlagsAction()
    setLoading(false)
    if (res.ok) {
      setCoverageOn(res.dashboardCoverageSectionVisible)
    } else {
      setError(res.message)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggleCoverage = async (next: boolean) => {
    setSaving(true)
    setError('')
    const res = await setDashboardCoverageSectionVisibleAction(next)
    setSaving(false)
    if (res.ok) {
      setCoverageOn(next)
    } else {
      setError(res.message)
    }
  }

  const cardShell = (cn: string, content: ReactNode) => (
    <div className={cn}>{content}</div>
  )

  if (loading) {
    const inner = <p className="text-sm text-gray-600">Loading site options…</p>
    if (embedded) return inner
    return cardShell(
      'mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm',
      inner
    )
  }

  const inner = (
    <>
      <h2 className="text-lg font-semibold text-gray-900">Member dashboard</h2>
      <p className="mt-1 text-sm text-gray-600">
        Control which sections all signed-in members see on their dashboard. Changes apply after they refresh
        the page.
      </p>
      {error && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-gray-50/80 p-4">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-gray-300"
          checked={coverageOn}
          disabled={saving}
          onChange={e => {
            void toggleCoverage(e.target.checked)
          }}
        />
        <span>
          <span className="font-medium text-gray-900">Show &quot;Your coverage&quot; section</span>
          <span className="mt-0.5 block text-sm text-gray-600">
            When off, the coverage breakdown (liability, collision, etc.) is hidden for everyone. Policy and
            vehicle cards stay visible.
          </span>
        </span>
      </label>
    </>
  )

  if (embedded) return inner
  return cardShell('mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm', inner)
}
