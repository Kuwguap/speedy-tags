import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'nodejs'

/**
 * AI-backed parser for the driver + vehicle intake form shown after Stripe
 * checkout completes. Accepts a paste from a driver's license / insurance
 * card / vehicle registration, OR an image of the same document, and
 * returns the nine form fields the success page collects.
 *
 * Requires `OPENAI_API_KEY` to be configured on the server. Uses
 * `OPENAI_PARSE_MODEL` (defaults to `gpt-4o-mini`) for text, and
 * `OPENAI_PARSE_VISION_MODEL` (defaults to the same model — `gpt-4o-mini`
 * supports vision) for image input.
 */

export const PARSE_INFO_KEYS = [
  'fullName',
  'addressLine1',
  'addressLine2',
  'cityStateZip',
  'phone',
  'email',
  'vin',
  'vehicleColor',
  'daq',
] as const

export type ParseInfoFields = Partial<Record<(typeof PARSE_INFO_KEYS)[number], string>>

const SYSTEM_PROMPT =
  'You extract a driver and vehicle profile from one of: a driver\'s license photo (front or back), ' +
  'an auto insurance card, a vehicle registration, an insurance policy document, or pasted plain text ' +
  'of any of those. Return ONLY a JSON object containing these keys. Use null (not empty string) when ' +
  'a field is not clearly present. Do not invent values.\n\n' +
  '- fullName: full legal name as printed on the driver license, mixed case.\n' +
  '- addressLine1: street line (number + street + any unit suffix that is on the same line).\n' +
  '- addressLine2: apartment / suite / unit when printed as a separate line — otherwise null.\n' +
  '- cityStateZip: "City, ST ZIP" or "City, ST ZIP-4". Example: "Jersey City, NJ 07304".\n' +
  '- phone: 10 digits, no formatting. Example: "5185550199".\n' +
  '- email: lowercased.\n' +
  '- vin: exactly 17 valid VIN characters (A-H, J-N, P, R-Z, 0-9), uppercase.\n' +
  '- vehicleColor: single color word, lowercase. Example: "gray".\n' +
  '- daq: driver license number, uppercase alphanumeric only (strip dashes / spaces).\n\n' +
  'If the input is illegible or contains conflicting data, return null for the conflicting fields rather than guessing.'

/** Per-image soft cap on the base64-encoded data URL. */
const MAX_IMAGE_DATA_URL_BYTES = 6 * 1024 * 1024 // ~4.3 MB raw, safely under Vercel's 4.5 MB body limit when used solo
/** Total request-body soft cap so a 5-image batch still fits inside Vercel's body limit. */
const MAX_TOTAL_IMAGE_BYTES = 4 * 1024 * 1024
const MAX_IMAGES = 5

interface ParseInfoRequest {
  /** Plain-text paste from the operator. */
  raw?: string
  /** Single image as a `data:image/...;base64,...` URL. Back-compat for the original one-image flow. */
  imageDataUrl?: string
  /** Up to {@link MAX_IMAGES} images as `data:image/...;base64,...` URLs. */
  imageDataUrls?: string[]
}

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: string } }>
}

function jsonError (status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...(extra ?? {}) }, { status })
}

function normalizeParsed (raw: unknown): ParseInfoFields {
  if (typeof raw !== 'object' || raw === null) return {}
  const out: ParseInfoFields = {}
  for (const k of PARSE_INFO_KEYS) {
    const v = (raw as Record<string, unknown>)[k]
    if (typeof v !== 'string') continue
    const trimmed = v.trim()
    if (!trimmed) continue
    // Some models echo the literal string "null" — guard against that.
    if (trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'none') continue
    out[k] = trimmed
  }
  return out
}

async function parseWithOpenAi (input: {
  text?: string
  imageDataUrls?: string[]
}): Promise<ParseInfoFields> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new Error('OPENAI_API_KEY is not configured on the server.')

  const images = (input.imageDataUrls ?? []).filter(Boolean)
  const hasImage = images.length > 0
  const model = hasImage
    ? (process.env.OPENAI_PARSE_VISION_MODEL?.trim() || 'gpt-4o-mini')
    : (process.env.OPENAI_PARSE_MODEL?.trim() || 'gpt-4o-mini')

  type ContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }

  const userContent: ContentPart[] = [
    {
      type: 'text',
      text:
        `Extract these keys: ${PARSE_INFO_KEYS.join(', ')}.\n` +
        'Return a single JSON object. Unknown fields must be null. When multiple ' +
        'images are provided, merge information across all of them (e.g. driver ' +
        'license front + back, plus an insurance card or registration).',
    },
  ]
  if (input.text) {
    userContent.push({
      type: 'text',
      text: `--- PASTED TEXT ---\n${input.text.slice(0, 12000)}`,
    })
  }
  for (const url of images) {
    userContent.push({
      type: 'image_url',
      image_url: { url, detail: 'high' },
    })
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 300)}`)
  }

  const data = (await res.json()) as OpenAiChatResponse
  const text = data.choices?.[0]?.message?.content
  if (!text) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {}
  }
  return normalizeParsed(parsed)
}

export async function POST (request: NextRequest) {
  let body: ParseInfoRequest
  try {
    body = (await request.json()) as ParseInfoRequest
  } catch {
    return jsonError(400, 'Body must be valid JSON.')
  }

  const raw = typeof body.raw === 'string' ? body.raw.trim() : ''

  // Merge legacy single-URL field into the array form so the rest of the handler is array-only.
  const collected: string[] = []
  if (typeof body.imageDataUrl === 'string' && body.imageDataUrl.trim()) {
    collected.push(body.imageDataUrl.trim())
  }
  if (Array.isArray(body.imageDataUrls)) {
    for (const u of body.imageDataUrls) {
      if (typeof u === 'string' && u.trim()) collected.push(u.trim())
    }
  }

  if (!raw && collected.length === 0) {
    return jsonError(400, 'Provide `raw` text or one or more image data URLs.')
  }
  if (collected.length > MAX_IMAGES) {
    return jsonError(400, `Too many images — send at most ${MAX_IMAGES} per request.`)
  }
  let totalBytes = 0
  for (const url of collected) {
    if (!url.startsWith('data:image/')) {
      return jsonError(400, 'Each image must be a base64 data URL beginning with `data:image/...`.')
    }
    if (url.length > MAX_IMAGE_DATA_URL_BYTES) {
      return jsonError(413, 'One of the images is too large — compress under ~4 MB before encoding.')
    }
    totalBytes += url.length
  }
  if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
    return jsonError(
      413,
      'Combined image payload is too large — keep the batch total under ~4 MB (try fewer photos or smaller resolution).',
    )
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return jsonError(
      503,
      'OPENAI_API_KEY is not configured on the server. Add it in Vercel → Environment Variables and redeploy.',
    )
  }

  try {
    const fields = await parseWithOpenAi({
      text: raw || undefined,
      imageDataUrls: collected.length > 0 ? collected : undefined,
    })
    return NextResponse.json({
      ok: true,
      fields,
      imageCount: collected.length,
      filledCount: Object.values(fields).filter(v => typeof v === 'string' && v.trim() !== '').length,
      source:
        collected.length > 0 && raw
          ? 'text+images'
          : collected.length > 1
            ? 'images'
            : collected.length === 1
              ? 'image'
              : 'text',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Parse failed.'
    return jsonError(502, msg)
  }
}

/** Tiny GET probe so the success-page UI can grey out the parser controls when the key is unset. */
export async function GET () {
  const enabled = Boolean(process.env.OPENAI_API_KEY?.trim())
  return NextResponse.json({
    ok: true,
    enabled,
    fields: PARSE_INFO_KEYS,
  })
}
