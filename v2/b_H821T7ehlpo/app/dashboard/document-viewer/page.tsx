import { Suspense } from 'react'
import DocumentViewerClient from './DocumentViewerClient'

export default function DocumentViewerPage () {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950 text-slate-300">
          Loading document…
        </div>
      }
    >
      <DocumentViewerClient />
    </Suspense>
  )
}
