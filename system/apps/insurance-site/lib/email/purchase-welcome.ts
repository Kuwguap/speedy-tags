export type PurchaseWelcomeEmailInput = {
  firstName: string
  policyNumber: string
  /** e.g. "May 8, 2026" */
  effectiveDateLabel: string
  /** e.g. "2013 Ford F-150" */
  vehicleLine: string
  /**
   * Portal sign-in email. When provided alongside `loginPassword`, the email
   * appends a "Portal Login" block so the client can sign in to their dashboard
   * directly from the welcome message.
   */
  loginEmail?: string
  /** Temporary password issued for the new portal account (e.g. `Temp#A9`). */
  loginPassword?: string
  /** Login URL printed in the portal block. Defaults to `NJCoverage.com/login`. */
  loginUrl?: string
}

export function buildPurchaseWelcomeEmail (input: PurchaseWelcomeEmailInput): {
  subject: string
  text: string
} {
  const subject = `Your policy is active — ${input.policyNumber}`

  const portalBlock =
    input.loginEmail && input.loginPassword
      ? `\nPortal Login:
Website: ${input.loginUrl?.trim() || 'NJCoverage.com/login'}
Email: ${input.loginEmail.trim()}
Password: ${input.loginPassword}
`
      : ''

  const text = `Hi ${input.firstName},

Thank you for choosing NJ Coverage for your auto insurance needs.

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
${portalBlock}
Thank you again for choosing NJ Coverage.

Sincerely,
The NJ Coverage Team

Www.NJCoverage.com (http://www.njcoverage.com/)
NJ Coverage Inc
1 N Central Rd 6th floor suite 629
Fort Lee, NJ 07024
`
  return { subject, text }
}
