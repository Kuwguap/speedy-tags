import { getStateInfo } from "../lib/states";

/** Reveals state-specific guidance the moment a state is chosen. */
export default function StateNotice({ state }: { state: string }) {
  if (!state) return null;
  const info = getStateInfo(state);
  return (
    <div
      key={state}
      className="animate-riseIn rounded-xl border border-reg/20 bg-reg/5 p-4"
    >
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${info.autoTag ? "bg-reg" : "bg-issued"}`} />
        <p className="font-display text-sm font-600 text-ink">{info.headline}</p>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-slate">{info.body}</p>
    </div>
  );
}
