export type PurchaseWelcomeEmailInput = {
  firstName: string
  policyNumber: string
  /** e.g. "May 8, 2026" */
  effectiveDateLabel: string
  /** e.g. "2013 Ford F-150" */
  vehicleLine: string
}

export function buildPurchaseWelcomeEmail (input: PurchaseWelcomeEmailInput): {
  subject: string
  text: string
} {
  const subject = `Your policy is active — ${input.policyNumber}`
  const text = `Hi ${input.firstName},

Thank you for choosing Tri State Coverage for your auto insurance needs.

Your policy is now active and coverage has been successfully issued.

Your proof of insurance (PDF) is attached to this email.

Here's a quick summary of your policy:
• Policy Number: ${input.policyNumber}
• Effective Date: ${input.effectiveDateLabel}
• Vehicle Insured: ${input.vehicleLine}

What's Next?
• Review your coverage online
• Download proof of insurance
• Set up automatic payments
• Access your policy anytime through your online dashboard

Log into your TRISTATECOVERAGE account anytime to manage your policy online.

Thank you again for choosing Tri State Coverage.

Sincerely,
The Tri State Coverage Team

Www.TriStateCoverage.com (http://www.tristatecoverage.com/)
Tri State Coverage Inc
1 N Central Rd 6th floor suite 629
Fort Lee, NJ 07024 (https://maps.google.com/maps/place//data=!4m2!3m1!1s0x89c2f6c1435fbd05:0x360ba3fc59652c55?entry=s&sa=X&ved=1t:8290&hl=en-us&ictx=111)
`
  return { subject, text }
}
