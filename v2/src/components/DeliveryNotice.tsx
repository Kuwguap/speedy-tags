/**
 * Repeating reminder that this is an email-only delivery service — required
 * by spec and surfaced on landing, checkout, and success pages so customers
 * never expect physical mail.
 */
export function DeliveryNotice({ tone = "navy" }: { tone?: "navy" | "gold" }) {
  const ring =
    tone === "gold"
      ? "border-gold/40 bg-gold-soft text-navy-dark"
      : "border-navy/15 bg-navy/5 text-navy";
  return (
    <div
      role="note"
      className={`flex items-start gap-3 rounded-xl border ${ring} px-4 py-3 text-sm font-medium`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5 shrink-0 mt-0.5"
        aria-hidden="true"
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
      <div>
        <strong className="block">Instant inbox delivery only.</strong>
        <span className="text-ink/80">No physical shipping &mdash; your tag arrives in your inbox.</span>
      </div>
    </div>
  );
}
