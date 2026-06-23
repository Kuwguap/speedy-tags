/** Animated Kingsman crown monogram. The crown points pulse softly. */
export function Logo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg bg-navy text-gold shadow-card ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 36 36" className="h-5 w-5" fill="none">
        <text
          x="50%"
          y="55%"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="Bodoni Moda, Georgia, serif"
          fontWeight="700"
          fontSize="22"
          fill="currentColor"
        >
          K
        </text>
        <circle cx="9" cy="7" r="1.2" fill="currentColor" className="animate-fade-in" />
        <circle cx="18" cy="5" r="1.4" fill="currentColor" className="animate-fade-in step-2" />
        <circle cx="27" cy="7" r="1.2" fill="currentColor" className="animate-fade-in step-3" />
      </svg>
    </span>
  );
}
