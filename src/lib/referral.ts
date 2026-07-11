// Referral / affiliate attribution.
// A visit to tristatetags.com/<slug> stores <slug> as the active referral; it
// then rides along with every checkout lead + session so the sale is attributed
// to that affiliate (first-touch — we don't overwrite an earlier referral).

const KEY = "ts_ref";

// Single-segment paths that are real routes, never referral codes.
const RESERVED = new Set([
  "",
  "checkout",
  "admin",
  "payment",
  "payments",
  "terms",
  "privacy",
  "interview",
  "secure",
  "fridaypayday",
  "api",
  "assets",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
]);

export function normalizeRefSlug(v: string | null | undefined): string {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

/** True when a single-segment path could be an affiliate slug (not a real route). */
export function isCapturableSlug(slug: string): boolean {
  const s = normalizeRefSlug(slug);
  return !!s && !RESERVED.has(s);
}

export function setReferralCode(slug: string): void {
  const s = normalizeRefSlug(slug);
  if (!s || RESERVED.has(s)) return;
  try {
    localStorage.setItem(KEY, s);
  } catch {
    /* storage blocked — ignore */
  }
}

export function getReferralCode(): string | undefined {
  try {
    return localStorage.getItem(KEY) || undefined;
  } catch {
    return undefined;
  }
}
