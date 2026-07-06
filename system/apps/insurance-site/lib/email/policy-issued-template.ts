export type PolicyIssuedEmailInput = {
  fullName: string
  policyNumber: string
  effectiveDate: string
  vehicleName: string
  /** When true, body mentions the attached proof-of-insurance PDF */
  mentionAttachedCard?: boolean
  /** Portal sign-in email (included in welcome email when set with loginPassword). */
  loginEmail?: string
  loginPassword?: string
  loginUrl?: string
}

function firstName (fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  return parts[0] || 'there'
}

export function buildPolicyIssuedEmail (input: PolicyIssuedEmailInput): { subject: string; text: string } {
  const subject = `Your policy is active — ${input.policyNumber}`
  const attachmentNote = input.mentionAttachedCard
    ? '\n\nYour proof of insurance (PDF) is attached to this email.\n'
    : ''
  const portalBlock =
    input.loginEmail && input.loginPassword
      ? `\nPortal Login:
Website: ${input.loginUrl?.trim() || 'https://njcoverage.com/login'}
Email: ${input.loginEmail.trim()}
Password: ${input.loginPassword}
`
      : ''
  const text = `Hi ${firstName(input.fullName)},

Thank you for choosing NJ Coverage for your auto insurance needs.

Your policy is now active and coverage has been successfully issued.${attachmentNote}
Here’s a quick summary of your policy:
• Policy Number: ${input.policyNumber}
• Effective Date: ${input.effectiveDate}
• Vehicle Insured: ${input.vehicleName}

What’s Next?
• Review your coverage online
• Download proof of insurance
• Set up automatic payments
• Access your policy anytime through your online dashboard

Log into your TRISTATECOVERAGE account anytime to manage your policy online.
${portalBlock}
Thank you again for choosing NJ Coverage.

Sincerely,
The NJ Coverage Team

Www.NJCoverage.com
NJ Coverage Inc
1 N Central Rd 6th floor suite 629
Fort Lee, NJ 07024
`
  return { subject, text }
}

