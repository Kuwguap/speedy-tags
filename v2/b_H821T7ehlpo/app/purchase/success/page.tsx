import { Suspense } from 'react'
import PurchaseSuccessClient from './PurchaseSuccessClient'

export default function PurchaseSuccessPage () {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
          Loading…
        </div>
      }
    >
      <PurchaseSuccessClient />
    </Suspense>
  )
}
