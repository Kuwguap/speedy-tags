import OpenAI from 'openai'
import { installPdfJsDomPolyfills } from '@/lib/pdf/install-dom-polyfills'

const MAX_BYTES = 5 * 1024 * 1024
const MAX_TEXT_CHARS = 32000

/** Fields read from an insurance card / declarations (AI-assisted). */
export type ExtractPolicyCardResult = {
  policyNumber: string | null
  firstName: string | null
  lastName: string | null
  vin: string | null
  /** Named insured mailing / policy address (street, city, ST ZIP). */
  policyAddress: string | null
  confidence: 'high' | 'medium' | 'low' | 'none'
  rationale?: string
}

function getClient (): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) return null
  return new OpenAI({ apiKey: key })
}

/** pdf-parse v2+ uses the PDFParse class (the old `pdfParse(buffer)` API was removed). */
async function extractTextFromPdfBuffer (buffer: Buffer): Promise<string> {
  await installPdfJsDomPolyfills()
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const result = await parser.getText()
    return String(result.text ?? '')
      .replace(/\s+/g, ' ')
      .trim()
  } finally {
    await parser.destroy().catch(() => {})
  }
}

function cleanStr (v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim().replace(/\s+/g, ' ')
  return s.length ? s : null
}

function parseExtractReply (content: string | null): ExtractPolicyCardResult {
  if (!content) {
    return {
      policyNumber: null,
      firstName: null,
      lastName: null,
      vin: null,
      policyAddress: null,
      confidence: 'none',
      rationale: 'Empty model response.',
    }
  }
  try {
    const obj = JSON.parse(content) as Record<string, unknown>
    const policyNumber = cleanStr(obj.policyNumber)
    const firstName = cleanStr(obj.firstName)
    const lastName = cleanStr(obj.lastName)
    const policyAddress = cleanStr(obj.policyAddress)
    let vinRaw = cleanStr(obj.vin)
    if (vinRaw) {
      vinRaw = vinRaw.replace(/\s/g, '').toUpperCase()
      if (vinRaw.length !== 17) {
        /* keep as-is for user correction; may be OCR noise */
      }
    } else {
      vinRaw = null
    }
    const conf = String(obj.confidence ?? 'none').toLowerCase()
    const confidence =
      conf === 'high' || conf === 'medium' || conf === 'low' ? conf : 'none'
    const rationale =
      typeof obj.rationale === 'string' ? obj.rationale : undefined
    return {
      policyNumber,
      firstName,
      lastName,
      vin: vinRaw,
      policyAddress,
      confidence,
      rationale,
    }
  } catch {
    return {
      policyNumber: null,
      firstName: null,
      lastName: null,
      vin: null,
      policyAddress: null,
      confidence: 'none',
      rationale: 'Could not parse AI response.',
    }
  }
}

const SYSTEM_TEXT = `You extract data from automobile insurance document text (declarations, ID card, policy summary).
Return JSON only:
{"policyNumber": string|null, "firstName": string|null, "lastName": string|null, "vin": string|null, "policyAddress": string|null, "confidence": "high"|"medium"|"low"|"none", "rationale": string}

Rules:
- policyNumber: labeled Policy Number, Policy No., Policy #, Pol #, Certificate # (policy id only — not claim numbers).
- firstName / lastName: named insured / policyholder on the card when shown as a person (split into first and last; middle initial can stay with firstName). If only one full name line, put whole given name in firstName and last name in lastName, or best split.
- vin: exactly the 17-character Vehicle Identification Number for the insured vehicle (letters A-Z except I,O,Q and digits). Strip spaces; use null if not visible or ambiguous.
- policyAddress: mailing address for the named insured / policy mailing address when explicitly labeled (e.g. Mailing Address, Policy Address, Insured Address). One line: street, city, ST ZIP (US). Prefer insured mailing over agency/broker office address when both appear. Use null if missing, illegible, or only partial (no city/state).
- Never invent values. Never put VIN into policyNumber. Do not use phone numbers, NAIC-only codes, or driver's license as policy number.
- If text is unclear, use null fields and lower confidence.`

const SYSTEM_IMAGE = `You read US automobile insurance cards and declaration excerpts from images.
Return JSON only:
{"policyNumber": string|null, "firstName": string|null, "lastName": string|null, "vin": string|null, "policyAddress": string|null, "confidence": "high"|"medium"|"low"|"none", "rationale": string}

Extract:
- Policy number (Policy No., Policy #, etc.)
- Named insured first and last name when shown for a person
- VIN: 17-character vehicle ID on the card (exclude serial numbers that are not VIN)
- policyAddress: insured mailing / policy mailing address as printed (street, city, ST ZIP), one line; prefer mailing over agency address when both visible; null if unreadable

Never invent. Use null if unreadable. Never swap VIN with policy number.`

async function extractFromText (
  documentLabel: string,
  text: string,
  openai: OpenAI
): Promise<ExtractPolicyCardResult> {
  const truncated = text.slice(0, MAX_TEXT_CHARS)
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.1,
    messages: [
      { role: 'system', content: SYSTEM_TEXT },
      {
        role: 'user',
        content: `${documentLabel}\n---\n${truncated}\n---`,
      },
    ],
  })
  return parseExtractReply(completion.choices[0]?.message?.content ?? null)
}

async function extractFromImage (
  buffer: Buffer,
  mime: string,
  openai: OpenAI
): Promise<ExtractPolicyCardResult> {
  const b64 = buffer.toString('base64')
  const dataUrl = `data:${mime};base64,${b64}`
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    temperature: 0.1,
    messages: [
      { role: 'system', content: SYSTEM_IMAGE },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract policy number, policyholder first/last name, VIN, and policy mailing address from this insurance document.',
          },
          {
            type: 'image_url',
            image_url: { url: dataUrl, detail: 'high' },
          },
        ],
      },
    ],
  })
  return parseExtractReply(completion.choices[0]?.message?.content ?? null)
}

function guessImageMime (mimeType: string, filename: string): string | null {
  if (mimeType.startsWith('image/') && mimeType !== 'application/octet-stream') {
    return mimeType
  }
  const lower = filename.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (/\.(jpg|jpeg)$/i.test(lower)) return 'image/jpeg'
  return null
}

export async function extractPolicyCardFieldsFromDocument (
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<
  | { ok: true; result: ExtractPolicyCardResult }
  | { ok: false; message: string }
> {
  if (buffer.length > MAX_BYTES) {
    return { ok: false, message: 'File must be 5 MB or smaller.' }
  }

  const openai = getClient()
  if (!openai) {
    return {
      ok: false,
      message:
        'OPENAI_API_KEY is not set. Add it to the server environment to use AI extraction.',
    }
  }

  const lower = filename.toLowerCase()
  const isPdf =
    mimeType === 'application/pdf' ||
    lower.endsWith('.pdf')

  if (isPdf) {
    let text = ''
    try {
      text = await extractTextFromPdfBuffer(buffer)
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      const lower = detail.toLowerCase()
      const hint =
        lower.includes('password') || lower.includes('encrypt')
          ? ' This PDF appears to be password-protected — save an unlocked copy or use a screenshot (PNG/JPEG) instead.'
          : lower.includes('invalid pdf') || lower.includes('format')
            ? ' The file may not be a valid PDF, or it uses an unsupported format.'
            : ' Try exporting the insurance card as PDF again, or upload a clear photo (PNG/JPEG) in the AI scan row above.'
      return {
        ok: false,
        message: `Could not extract text from this PDF (${detail}).${hint}`,
      }
    }

    if (text.length < 40) {
      return {
        ok: true,
        result: {
          policyNumber: null,
          firstName: null,
          lastName: null,
          vin: null,
          policyAddress: null,
          confidence: 'none',
          rationale:
            'This PDF has very little selectable text (often a scanned image). Upload a PNG or JPEG of the insurance card for full AI extraction, or enter fields manually.',
        },
      }
    }

    const result = await extractFromText('Extracted PDF text:', text, openai)
    return { ok: true, result }
  }

  const imgMime = guessImageMime(mimeType, filename)
  if (!imgMime) {
    return {
      ok: false,
      message:
        'Unsupported format. Use PDF, PNG, JPEG, WebP, or GIF for extraction.',
    }
  }

  const result = await extractFromImage(buffer, imgMime, openai)
  return { ok: true, result }
}

/** @deprecated use extractPolicyCardFieldsFromDocument */
export async function extractPolicyNumberFromDocument (
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<
  | { ok: true; result: ExtractPolicyCardResult }
  | { ok: false; message: string }
> {
  return extractPolicyCardFieldsFromDocument(buffer, mimeType, filename)
}
