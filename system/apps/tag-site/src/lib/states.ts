// Client-side copy of state info (the server uses @speedy/shared/state-info).
// autoTag=true → an NJ-style temp plate is minted instantly on payment.

export const SUPPORTED_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
  "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
  "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
  "WI", "WY", "DC",
];

type Info = { autoTag: boolean; headline: string; body: string };

const STATE_INFO: Record<string, Info> = {
  NJ: {
    autoTag: true,
    headline: "Issued in minutes",
    body: "Your New Jersey 30-day plate lands in your inbox the moment payment clears.",
  },
  NY: {
    autoTag: false,
    headline: "We prep your NY paperwork",
    body: "New York issues physical plates at the DMV. We email a checklist and, if you opt in, an FS-20 insurance card with a scannable barcode.",
  },
};

const DEFAULT_INFO: Info = {
  autoTag: true,
  headline: "Issued in minutes",
  body: "You'll receive a New Jersey 30-day temporary plate by email — print it, place it in the rear window, and drive.",
};

export function getStateInfo(code: string): Info & { code: string } {
  const c = String(code || "").trim().toUpperCase();
  return { code: c, ...(STATE_INFO[c] || DEFAULT_INFO) };
}
