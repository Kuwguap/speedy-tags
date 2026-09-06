import { Suspense } from 'react'
import PurchaseSuccessClient from '@/app/purchase/success/PurchaseSuccessClient'

export default function TestPurchaseSuccessPage () {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
          Loading…
        </div>
      }
    >
      <PurchaseSuccessClient backHref="/qwertyuiop" />
    </Suspense>
  )
}
