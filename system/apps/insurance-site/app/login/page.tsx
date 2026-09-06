import { Suspense } from 'react'
import LoginClient from './LoginClient'

/**
 * Server-rendered wrapper that satisfies Next.js 16's static-generation
 * requirement: any client component that calls `useSearchParams()` must be
 * mounted inside a `<Suspense>` boundary so the build can bail out to CSR
 * for that subtree without failing prerender.
 */
export default function LoginPage () {
  return (
    <Suspense fallback={null}>
      <LoginClient />
    </Suspense>
  )
}
