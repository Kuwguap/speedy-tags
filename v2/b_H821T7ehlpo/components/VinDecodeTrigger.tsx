'use client'

import { useState } from 'react'
import type { DecodedVinPayload } from '@/lib/vin/decode-vin'

type Props = {
  vin: string
  onDecoded: (data: DecodedVinPayload) => void
  disabled?: boolean
  className?: string
}

/** Calls GET /api/vin/decode (NHTSA vPIC); fills editable vehicle fields via onDecoded. */
export default function VinDecodeTrigger ({
  vin,
  onDecoded,
  disabled,
  className = '',
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function run () {
    setError('')
    setLoading(true)
    try {
      const res = await fetch(
        `/api/vin/decode?vin=${encodeURIComponent(vin.trim())}`
      )
      const json = (await res.json()) as {
        ok?: boolean
        error?: string
        data?: DecodedVinPayload
      }
      if (!res.ok || !json.ok || !json.data) {
        setError(json.error ?? 'Could not decode VIN.')
        return
      }
      onDecoded(json.data)
    } catch {
      setError('Network error while decoding VIN.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => void run()}
        disabled={disabled || loading || !vin.trim()}
        className="shrink-0 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Decoding…' : 'Decode VIN'}
      </button>
      {error ? (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
