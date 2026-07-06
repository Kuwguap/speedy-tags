import { Resend } from 'resend'

export function getResendClient (): Resend | null {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) return null
  return new Resend(apiKey)
}

export function getResendFromAddress (): string | null {
  // Must be a verified sender in Resend (or your domain).
  return process.env.RESEND_FROM?.trim() ?? null
}

