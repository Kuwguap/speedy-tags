/**
 * Signature element: a live New-Jersey-style temporary plate card that mirrors
 * the generated PDF. The plate number reveals character-by-character (stagger)
 * and the amber "ISSUED" mark presses in (stamp). Reused on the hero (demo
 * values) and on the success page (the buyer's real plate).
 */

interface Props {
  plate: string;
  state?: string;
  expLabel?: string;
  ownerName?: string;
  vehicle?: string;
  stamped?: boolean;
  animate?: boolean;
}

export default function TempPlate({
  plate,
  state = "NJ",
  expLabel = "30 DAYS",
  ownerName,
  vehicle,
  stamped = true,
  animate = true,
}: Props) {
  const chars = plate.split("");
  return (
    <div className="relative w-full max-w-md select-none">
      {/* embossed metallic plate */}
      <div
        className="relative overflow-hidden rounded-2xl border border-white/40 px-7 pb-6 pt-5 shadow-plate"
        style={{
          background:
            "linear-gradient(155deg, #FBFAF4 0%, #EFECE1 48%, #F7F5EE 100%)",
        }}
      >
        <div className="flex items-center justify-between">
          <span className="font-display text-[11px] font-700 uppercase tracking-[0.28em] text-reg">
            New Jersey
          </span>
          <span className="font-display text-[10px] font-600 uppercase tracking-[0.2em] text-slate">
            Temporary
          </span>
        </div>

        <div className="mt-3 flex items-end justify-center gap-1">
          {chars.map((c, i) => (
            <span
              key={i}
              className={`font-plate text-5xl font-700 leading-none text-ink sm:text-6xl ${
                animate ? "animate-charIn" : ""
              }`}
              style={animate ? { animationDelay: `${0.15 + i * 0.06}s` } : undefined}
            >
              {c}
            </span>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-ink/10 pt-3">
          <div className="min-w-0">
            <p className="truncate font-display text-[11px] font-600 uppercase tracking-wide text-slate">
              {ownerName || "Registered owner"}
            </p>
            <p className="truncate text-[11px] text-slate-light">{vehicle || "Your vehicle"}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-[9px] font-600 uppercase tracking-[0.18em] text-slate-light">
              Expires
            </p>
            <p className="font-plate text-sm font-700 text-reg">{expLabel}</p>
          </div>
        </div>

        {/* signature: pressed-in ISSUED stamp */}
        {stamped && (
          <div
            className={`pointer-events-none absolute -right-2 top-6 ${animate ? "animate-stampIn" : "-rotate-[11deg]"}`}
            style={animate ? { animationDelay: "0.55s" } : undefined}
          >
            <span className="inline-block rounded-md border-[3px] border-issued px-3 py-1 font-display text-lg font-700 uppercase tracking-[0.15em] text-issued-deep/90">
              Issued
            </span>
          </div>
        )}
      </div>

      {/* subtle plate shadow slab */}
      <div className="absolute -bottom-2 left-4 right-4 h-6 rounded-b-2xl bg-ink/20 blur-xl" />
    </div>
  );
}
