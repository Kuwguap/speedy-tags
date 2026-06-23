interface Props {
  state: string;
  /** Optional info object — if absent we compute locally. */
  info?: { autoTag: boolean; headline: string; body: string };
}

const FALLBACK = {
  NJ: {
    autoTag: true,
    headline: "Auto-issued in minutes.",
    body:
      "We'll generate your NJ Temporary Tag and email it to you the second your payment clears.",
  },
  NY: {
    autoTag: false,
    headline: "Instructions for your NY DMV visit.",
    body:
      "New York issues physical temp plates at the DMV. We'll email you a checklist with everything you need — and if you opt in, your printable insurance card.",
  },
};

const DEFAULT_INFO = {
  autoTag: false,
  headline: "Instructions emailed after payment.",
  body:
    "Auto-issued tags aren't available in your state yet — we'll email you the DMV checklist instead. Your insurance card is included if you opt in.",
};

export function StateInfoNotice({ state, info }: Props) {
  const code = String(state || "").toUpperCase();
  if (!code) return null;
  const data =
    info ||
    (FALLBACK as Record<string, { autoTag: boolean; headline: string; body: string }>)[code] ||
    DEFAULT_INFO;

  return (
    <div
      className={`rounded-xl border p-4 text-sm font-medium ${
        data.autoTag
          ? "border-gold/40 bg-gold-soft text-navy-dark"
          : "border-navy/15 bg-navy/5 text-navy"
      }`}
      role="note"
    >
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
            data.autoTag ? "bg-gold text-navy-dark" : "bg-navy text-cream"
          }`}
          aria-hidden="true"
        >
          {data.autoTag ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5 10 17l9-10" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v5l3 2" />
            </svg>
          )}
        </span>
        <div>
          <p className="font-semibold">
            {data.headline} <span className="font-normal opacity-70">· {code}</span>
          </p>
          <p className="mt-0.5 text-ink/80 font-normal">{data.body}</p>
        </div>
      </div>
    </div>
  );
}
