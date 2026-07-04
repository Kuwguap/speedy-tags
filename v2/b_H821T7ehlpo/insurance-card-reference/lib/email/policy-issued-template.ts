export type PolicyIssuedEmailInput = {
  fullName: string
  policyNumber: string
  effectiveDate: string
  vehicleName: string
  /** When true, body mentions the attached proof-of-insurance PDF */
  mentionAttachedCard?: boolean
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
  const text = `Hi ${firstName(input.fullName)},

Thank you for choosing Tri State Coverage for your auto insurance needs.

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

Thank you again for choosing Tri State Coverage.

Sincerely,
The Tri State Coverage Team

Www.TriStateCoverage.com
Tri State Coverage Inc
1 N Central Rd 6th floor suite 629
Fort Lee, NJ 07024 (https://maps.google.com/maps/place//data=!4m2!3m1!1s0x89c2f6c1435fbd05:0x360ba3fc59652c55?entry=s&sa=X&ved=1t:8290&hl=en-us&ictx=111)
`
  return { subject, text }
}

