'use server'

import { extractPolicyCardFieldsFromDocument } from '@/lib/ai/extract-policy-number'

/**
 * AI-assisted extraction from insurance PDF or image (policy #, name, VIN, policy address).
 * Requires OPENAI_API_KEY. Staff should verify before save.
 */
export async function extractPolicyNumberFromUploadAction (
  formData: FormData
): Promise<
  | {
      ok: true
      policyNumber: string | null
      firstName: string | null
      lastName: string | null
      vin: string | null
      policyAddress: string | null
      confidence: string
      rationale?: string
    }
  | { ok: false; message: string }
> {
  const raw = formData.get('file')
  if (!(raw instanceof File) || raw.size === 0) {
    return { ok: false, message: 'No file uploaded.' }
  }

  const buf = Buffer.from(await raw.arrayBuffer())
  const outcome = await extractPolicyCardFieldsFromDocument(
    buf,
    raw.type || 'application/octet-stream',
    raw.name || 'upload'
  )

  if (!outcome.ok) {
    return { ok: false, message: outcome.message }
  }

  const {
    policyNumber,
    firstName,
    lastName,
    vin,
    policyAddress,
    confidence,
    rationale,
  } = outcome.result
  return {
    ok: true,
    policyNumber,
    firstName,
    lastName,
    vin,
    policyAddress,
    confidence,
    rationale,
  }
}
