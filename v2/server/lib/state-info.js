/**
 * Per-state copy shown on the checkout / account / qwertyuiop pages.
 * `autoTag === true` means we can mint a temporary tag PDF instantly.
 */

export const SUPPORTED_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
  "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
  "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
  "WI", "WY", "DC",
];

const STATE_INFO = {
  NJ: {
    autoTag: true,
    insuranceAvailable: true,
    headline: "Auto-issued in minutes.",
    body:
      "We'll generate your NJ Temporary Tag and email it to you the second your payment clears. Print it, place it in the rear window, and you're road-legal for 30 days.",
  },
  NY: {
    autoTag: false,
    insuranceAvailable: true,
    headline: "Instructions for your NY DMV visit.",
    body:
      "New York issues physical temp plates at the DMV. Bring your title, bill of sale and proof of insurance to your local DMV — we'll email you a checklist with everything you need. If you don't have insurance, you can opt in to our 1-month coverage and we'll generate your FS-20 Insurance ID Card with a scannable PDF417 barcode.",
  },
};

const DEFAULT_INFO = {
  autoTag: false,
  insuranceAvailable: true,
  headline: "Instructions emailed after payment.",
  body:
    "Auto-issued tags aren't available in your state yet. We'll email you a checklist of the documents you'll need at your local DMV. If you opt in to our 1-month coverage, your printable insurance card will be attached too.",
};

export function getStateInfo(stateCode) {
  const code = String(stateCode || "").trim().toUpperCase();
  return { code, ...(STATE_INFO[code] || DEFAULT_INFO) };
}
