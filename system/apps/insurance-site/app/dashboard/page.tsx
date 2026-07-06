import { Suspense } from 'react'
import DashboardClient from './DashboardClient'

export default function DashboardPage () {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
          Loading…
        </div>
      }
    >
      <DashboardClient />
    </Suspense>
  )
}
