/** Format a money amount with a $ prefix per brand. */
export function formatMoney(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "Mar 12, 2026" */
export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Relative count like "in 12 days" / "3 days ago". */
export function relativeDays(iso?: string | null): string {
  if (!iso) return "";
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "";
  const diffMs = target - Date.now();
  const days = Math.round(diffMs / 86400000);
  if (days === 0) return "today";
  if (days > 0) return `in ${days} day${days === 1 ? "" : "s"}`;
  return `${-days} day${days === -1 ? "" : "s"} ago`;
}
