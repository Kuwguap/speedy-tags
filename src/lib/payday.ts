/** Friday payday — tags, receipts, payroll, and revenue leak calculations. */

export const PAYROLL_RATE_ISSUER = 9;
export const PAYROLL_RATE_DISPATCHER = 5;
export const MIN_TAG_PRICE_USD = 100;
export const NJ_TZ = "America/New_York";

/** Issuers on the Highkage track (Haru). All others use Sensei dispatchers. */
export const HIGHKAGE_ISSUER_HANDLES = new Set(["haruhatsu"]);

export interface TransactionRow {
  id?: string | number;
  reference_id?: string | null;
  timestamp_ny?: string;
  delivery_status?: string;
  price?: string | number | null;
  receipt_price?: string | number | null;
  receipt_image_url?: string | null;
  tag_name?: string | null;
  issuer_submitter_handle?: string | null;
  issuer_group?: string | null;
  dispatcher_name?: string | null;
  dispatcher_handle?: string | null;
  driver_selected_name?: string | null;
}

export interface PaydayWeekBucket {
  key: string;
  label: string;
  tags: number;
  receipts: number;
  cashIn: number;
  expectedIn: number;
  payrollOut: number;
  leak: number;
}

export interface PaydayStats {
  tagsIssued: number;
  receiptsUploaded: number;
  receiptsMissing: number;
  cashInFromReceipts: number;
  expectedFromLeadPrices: number;
  minimumExpectedIn: number;
  expectedIn: number;
  leak: number;
  payrollIssuer: number;
  payrollDispatcher: number;
  payrollTotal: number;
  netAfterPayroll: number;
  periodLabel: string;
  teamPayrolls: TeamPayrollLine[];
}

export interface TeamPayrollLine {
  team: "highkage" | "sensei";
  issuerLabel: string;
  dispatcherLabel: string;
  tags: number;
  issuerPay: number;
  dispatcherPay: number;
  total: number;
}

export function parsePrice(raw: unknown): number {
  if (raw == null) return 0;
  const s = String(raw).trim();
  if (!s) return 0;
  const cleaned = s.replace(/[^0-9.\-,]/g, "").replace(/,/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return 0;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function formatUsd(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const hasCents = Math.abs(v - Math.round(v)) > 0.0001;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(v);
}

export function isTagIssued(row: TransactionRow): boolean {
  return String(row.delivery_status || "").toUpperCase() === "DELIVERED";
}

export function hasReceipt(row: TransactionRow): boolean {
  return !!String(row.receipt_image_url || "").trim();
}

export function normalizeIssuerHandle(raw?: string | null): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
}

/** Haru (@haruhatsu) → Highkage dispatch; all other issuers → Sensei dispatch. */
export function isHighkageTrack(row: TransactionRow): boolean {
  const h = normalizeIssuerHandle(row.issuer_submitter_handle);
  if (HIGHKAGE_ISSUER_HANDLES.has(h)) return true;
  const g = String(row.issuer_group || "").toLowerCase();
  return g === "highkage_group" || g.includes("highkage");
}

export function computeTeamPayrolls(rows: TransactionRow[]): TeamPayrollLine[] {
  const delivered = rows.filter(isTagIssued);
  let highkageTags = 0;
  let senseiTags = 0;
  for (const row of delivered) {
    if (isHighkageTrack(row)) highkageTags += 1;
    else senseiTags += 1;
  }
  const lines: TeamPayrollLine[] = [];
  if (highkageTags > 0) {
    lines.push({
      team: "highkage",
      issuerLabel: "Haru (@haruhatsu)",
      dispatcherLabel: "Highkage",
      tags: highkageTags,
      issuerPay: highkageTags * PAYROLL_RATE_ISSUER,
      dispatcherPay: highkageTags * PAYROLL_RATE_DISPATCHER,
      total: highkageTags * (PAYROLL_RATE_ISSUER + PAYROLL_RATE_DISPATCHER),
    });
  }
  if (senseiTags > 0) {
    lines.push({
      team: "sensei",
      issuerLabel: "Sensei issuers",
      dispatcherLabel: "Sensei",
      tags: senseiTags,
      issuerPay: senseiTags * PAYROLL_RATE_ISSUER,
      dispatcherPay: senseiTags * PAYROLL_RATE_DISPATCHER,
      total: senseiTags * (PAYROLL_RATE_ISSUER + PAYROLL_RATE_DISPATCHER),
    });
  }
  return lines;
}

function parseNyMs(iso?: string): number {
  if (!iso) return NaN;
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? NaN : t.getTime();
}

export function njWeekStartMs(ms: number): number {
  const d = new Date(ms);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: NJ_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const noonUtc = Date.UTC(y, m - 1, day, 17, 0, 0);
  const weekday = new Date(noonUtc).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  return noonUtc - daysSinceMonday * 24 * 60 * 60 * 1000;
}

export function njWeekEndMs(weekStartMs: number): number {
  return weekStartMs + 7 * 24 * 60 * 60 * 1000 - 1;
}

export function currentNjWeekBounds(): { startMs: number; endMs: number } {
  const startMs = njWeekStartMs(Date.now());
  return { startMs, endMs: njWeekEndMs(startMs) };
}

export function formatNjDate(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: NJ_TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(ms));
}

export function rowInNjWeek(row: TransactionRow, startMs: number, endMs: number): boolean {
  const ms = parseNyMs(row.timestamp_ny);
  if (Number.isNaN(ms)) return false;
  return ms >= startMs && ms <= endMs;
}

export function filterRowsForNjWeek(rows: TransactionRow[], startMs: number, endMs: number): TransactionRow[] {
  return rows.filter((r) => rowInNjWeek(r, startMs, endMs));
}

function leadPriceForTag(row: TransactionRow): number {
  const p = parsePrice(row.price);
  return p > 0 ? p : MIN_TAG_PRICE_USD;
}

export function computePaydayStats(rows: TransactionRow[], periodLabel: string): PaydayStats {
  const delivered = rows.filter(isTagIssued);
  const tagsIssued = delivered.length;
  const withReceipt = delivered.filter(hasReceipt);
  const receiptsUploaded = withReceipt.length;
  const receiptsMissing = tagsIssued - receiptsUploaded;

  const cashInFromReceipts = withReceipt.reduce((s, r) => s + parsePrice(r.receipt_price), 0);
  const expectedFromLeadPrices = delivered.reduce((s, r) => s + leadPriceForTag(r), 0);
  const minimumExpectedIn = tagsIssued * MIN_TAG_PRICE_USD;
  const expectedIn = Math.max(expectedFromLeadPrices, minimumExpectedIn);
  const leak = Math.max(0, expectedIn - cashInFromReceipts);

  const payrollIssuer = tagsIssued * PAYROLL_RATE_ISSUER;
  const payrollDispatcher = tagsIssued * PAYROLL_RATE_DISPATCHER;
  const payrollTotal = payrollIssuer + payrollDispatcher;
  const netAfterPayroll = cashInFromReceipts - payrollTotal;
  const teamPayrolls = computeTeamPayrolls(rows);

  return {
    tagsIssued,
    receiptsUploaded,
    receiptsMissing,
    cashInFromReceipts,
    expectedFromLeadPrices,
    minimumExpectedIn,
    expectedIn,
    leak,
    payrollIssuer,
    payrollDispatcher,
    payrollTotal,
    netAfterPayroll,
    periodLabel,
    teamPayrolls,
  };
}

function weekKey(ms: number): string {
  const weekStart = njWeekStartMs(ms);
  const d = new Date(weekStart);
  const y = d.getUTCFullYear();
  const jan1 = Date.UTC(y, 0, 1, 12, 0, 0);
  const weekNum = Math.floor((weekStart - njWeekStartMs(jan1)) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${y}-W${String(weekNum).padStart(2, "0")}`;
}

export function buildWeeklyBuckets(rows: TransactionRow[], maxWeeks = 8): PaydayWeekBucket[] {
  const map = new Map<string, PaydayWeekBucket>();
  for (const row of rows) {
    const ms = parseNyMs(row.timestamp_ny);
    if (Number.isNaN(ms)) continue;
    const key = weekKey(ms);
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: formatNjDate(njWeekStartMs(ms)),
        tags: 0,
        receipts: 0,
        cashIn: 0,
        expectedIn: 0,
        payrollOut: 0,
        leak: 0,
      });
    }
    const b = map.get(key)!;
    if (!isTagIssued(row)) continue;
    b.tags += 1;
    const expected = leadPriceForTag(row);
    b.expectedIn += expected;
    b.payrollOut += PAYROLL_RATE_ISSUER + PAYROLL_RATE_DISPATCHER;
    if (hasReceipt(row)) {
      b.receipts += 1;
      const rp = parsePrice(row.receipt_price);
      if (rp > 0) b.cashIn += rp;
    }
  }
  for (const b of map.values()) {
    b.leak = Math.max(0, b.expectedIn - b.cashIn);
  }
  const sorted = [...map.values()].sort((a, c) => a.key.localeCompare(c.key));
  return maxWeeks > 0 ? sorted.slice(-maxWeeks) : sorted;
}
