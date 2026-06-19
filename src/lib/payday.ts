/** Friday payday — tags, receipts, payroll, and revenue leak calculations. */

export const PAYROLL_RATE_ISSUER = 9;
export const PAYROLL_RATE_DISPATCHER = 5;
/** $10 per new client — paid to whoever started the lead (issuer bot submitter). */
export const PAYROLL_RATE_LEAD_STARTER = 10;
/** @deprecated alias */ export const PAYROLL_RATE_CLIENT_FINDER = PAYROLL_RATE_LEAD_STARTER;
export const MIN_TAG_PRICE_USD = 100;
export const NJ_TZ = "America/New_York";

/** Tag senders on the Haru / Highkage track (dispatch bot handle). */
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
  payrollLeadStarter: number;
  payrollTotal: number;
  netAfterPayroll: number;
  periodLabel: string;
  teamPayrolls: TeamPayrollLine[];
  issuerPayrolls: IssuerPayrollLine[];
  dispatcherPayrolls: DispatcherPayrollLine[];
  leadCreatorPayrolls: LeadCreatorPayrollLine[];
  leadStarterPayrolls: LeadStarterPayrollLine[];
  pairBuckets: PayrollPairBucket[];
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

export interface IssuerPayrollLine {
  handle: string;
  label: string;
  dispatcherTeam: "highkage" | "sensei";
  dispatcherLabel: string;
  tags: number;
  receipts: number;
  cashIn: number;
  pay: number;
}

export interface DispatcherPayrollLine {
  team: "highkage" | "sensei";
  label: string;
  tags: number;
  receipts: number;
  cashIn: number;
  pay: number;
  issuerNote: string;
}

export interface LeadCreatorPayrollLine {
  handle: string;
  label: string;
  dispatcherTeam: "highkage" | "sensei";
  pairedIssuerLabel: string;
  tags: number;
  receipts: number;
  cashIn: number;
  pay: number;
}

export interface LeadStarterPayrollLine {
  handle: string;
  label: string;
  clients: number;
  receipts: number;
  cashIn: number;
  pay: number;
}

export interface PayrollPairBucket {
  key: string;
  issuerHandle: string;
  issuerLabel: string;
  dispatcherTeam: "highkage" | "sensei";
  dispatcherTeamLabel: string;
  tags: number;
  receipts: number;
  cashIn: number;
  expectedIn: number;
  leak: number;
  issuerPay: number;
  dispatcherPay: number;
  leadStarterPay: number;
  totalPay: number;
  leadCreators: { handle: string; label: string; tags: number }[];
  rows: TransactionRow[];
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

/**
 * Who sent the tag (Issuer payroll) — matches /backend "Issuer" column:
 * dispatch bot sender (`dispatcher_handle` / `dispatcher_name`).
 */
export function resolveTagIssuerHandle(row: TransactionRow): string {
  const h = normalizeIssuerHandle(row.dispatcher_handle);
  if (h) return h;
  const name = String(row.dispatcher_name || "").trim().toLowerCase();
  if (name.includes("haru")) return "haruhatsu";
  if (name) {
    const slug = name.replace(/[^a-z0-9]/g, "");
    if (slug) return slug;
  }
  const g = String(row.issuer_group || "").toLowerCase();
  if (g.includes("highkage")) return "haruhatsu";
  return "unknown";
}

/**
 * Who created the lead (Dispatcher column in /backend) — issuer bot submitter.
 */
export function resolveLeadCreatorHandle(row: TransactionRow): string {
  return normalizeIssuerHandle(row.issuer_submitter_handle) || "unknown";
}

export function isHighkageIssuerHandle(raw?: string | null): boolean {
  return HIGHKAGE_ISSUER_HANDLES.has(normalizeIssuerHandle(raw));
}

export function dispatcherTeamForRow(row: TransactionRow): "highkage" | "sensei" {
  return isHighkageIssuerHandle(resolveTagIssuerHandle(row)) ? "highkage" : "sensei";
}

export function isHighkageTrack(row: TransactionRow): boolean {
  return dispatcherTeamForRow(row) === "highkage";
}

export function issuerDisplayLabel(handle: string, displayName?: string | null): string {
  const h = normalizeIssuerHandle(handle);
  const name = String(displayName || "").trim();
  if (h === "haruhatsu" || name.toLowerCase().includes("haru")) {
    return name ? `${name} (@haruhatsu)` : "Haru (@haruhatsu)";
  }
  if (!h || h === "unknown") return name || "Unknown issuer";
  if (name && normalizeIssuerHandle(name) !== h) return `${name} (@${h})`;
  return `@${h}`;
}

export function leadCreatorDisplayLabel(handle: string): string {
  const h = normalizeIssuerHandle(handle);
  if (!h || h === "unknown") return "Unknown lead creator";
  return `@${h}`;
}

/** URL slug for a dispatcher (lead creator) payday page, e.g. sensei_vi */
export function dispatcherSlugFromHandle(handle: string): string {
  const h = normalizeIssuerHandle(handle);
  return h || "unknown";
}

export function rowMatchesDispatcherSlug(row: TransactionRow, slug: string): boolean {
  return resolveLeadCreatorHandle(row) === dispatcherSlugFromHandle(slug);
}

export interface DispatcherSummary {
  handle: string;
  slug: string;
  label: string;
  totalRows: number;
  tagsIssued: number;
  receipts: number;
  cashIn: number;
  dispatcherPay: number;
  leadStarterPay: number;
}

export function listDispatcherSummaries(rows: TransactionRow[]): DispatcherSummary[] {
  const map = new Map<
    string,
    { totalRows: number; tags: number; receipts: number; cashIn: number }
  >();

  for (const row of rows) {
    const handle = resolveLeadCreatorHandle(row);
    const cur = map.get(handle) || { totalRows: 0, tags: 0, receipts: 0, cashIn: 0 };
    cur.totalRows += 1;
    if (isTagIssued(row)) {
      cur.tags += 1;
      if (hasReceipt(row)) {
        cur.receipts += 1;
        cur.cashIn += parsePrice(row.receipt_price);
      }
    }
    map.set(handle, cur);
  }

  return [...map.entries()]
    .filter(([handle]) => handle !== "unknown")
    .map(([handle, v]) => ({
      handle,
      slug: dispatcherSlugFromHandle(handle),
      label: leadCreatorDisplayLabel(handle),
      totalRows: v.totalRows,
      tagsIssued: v.tags,
      receipts: v.receipts,
      cashIn: v.cashIn,
      dispatcherPay: v.tags * PAYROLL_RATE_DISPATCHER,
      leadStarterPay: v.tags * PAYROLL_RATE_LEAD_STARTER,
    }))
    .sort((a, b) => b.tagsIssued - a.tagsIssued || a.label.localeCompare(b.label));
}

export function computeDispatcherPaydayStats(
  rows: TransactionRow[],
  slug: string,
  periodLabel: string,
): PaydayStats & { dispatcherHandle: string; dispatcherLabel: string; transactionRows: TransactionRow[] } {
  const handle = dispatcherSlugFromHandle(slug);
  const transactionRows = rows.filter((r) => resolveLeadCreatorHandle(r) === handle);
  const delivered = transactionRows.filter(isTagIssued);
  const base = computePaydayStats(delivered, periodLabel);
  return {
    ...base,
    dispatcherHandle: handle,
    dispatcherLabel: leadCreatorDisplayLabel(handle),
    transactionRows,
  };
}

export function dispatcherLabelForTeam(team: "highkage" | "sensei"): string {
  return team === "highkage" ? "Highkage" : "Sensei";
}

function leadPriceForTag(row: TransactionRow): number {
  const p = parsePrice(row.price);
  return p > 0 ? p : MIN_TAG_PRICE_USD;
}

export function buildPayrollPairBuckets(rows: TransactionRow[]): PayrollPairBucket[] {
  const map = new Map<string, PayrollPairBucket>();

  for (const row of rows.filter(isTagIssued)) {
    const issuerHandle = resolveTagIssuerHandle(row);
    const team = dispatcherTeamForRow(row);
    const key = `${issuerHandle}::${team}`;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = {
        key,
        issuerHandle,
        issuerLabel: issuerDisplayLabel(issuerHandle, row.dispatcher_name),
        dispatcherTeam: team,
        dispatcherTeamLabel: dispatcherLabelForTeam(team),
        tags: 0,
        receipts: 0,
        cashIn: 0,
        expectedIn: 0,
        leak: 0,
        issuerPay: 0,
        dispatcherPay: 0,
        leadStarterPay: 0,
        totalPay: 0,
        leadCreators: [],
        rows: [],
      };
      map.set(key, bucket);
    }
    bucket.tags += 1;
    bucket.expectedIn += leadPriceForTag(row);
    bucket.rows.push(row);

    const lcHandle = resolveLeadCreatorHandle(row);
    const lc = bucket.leadCreators.find((x) => x.handle === lcHandle);
    if (lc) lc.tags += 1;
    else {
      bucket.leadCreators.push({
        handle: lcHandle,
        label: leadCreatorDisplayLabel(lcHandle),
        tags: 1,
      });
    }

    if (hasReceipt(row)) {
      bucket.receipts += 1;
      const rp = parsePrice(row.receipt_price);
      if (rp > 0) bucket.cashIn += rp;
    }
  }

  for (const bucket of map.values()) {
    bucket.leak = Math.max(0, bucket.expectedIn - bucket.cashIn);
    bucket.issuerPay = bucket.tags * PAYROLL_RATE_ISSUER;
    bucket.dispatcherPay = bucket.tags * PAYROLL_RATE_DISPATCHER;
    bucket.leadStarterPay = bucket.tags * PAYROLL_RATE_LEAD_STARTER;
    bucket.totalPay = bucket.issuerPay + bucket.dispatcherPay + bucket.leadStarterPay;
    bucket.leadCreators.sort((a, b) => b.tags - a.tags || a.label.localeCompare(b.label));
  }

  return [...map.values()].sort((a, b) => b.tags - a.tags || a.issuerLabel.localeCompare(b.issuerLabel));
}

export function computeIndividualIssuerPayrolls(rows: TransactionRow[]): IssuerPayrollLine[] {
  const map = new Map<
    string,
    { tags: number; receipts: number; cashIn: number; team: "highkage" | "sensei"; label: string }
  >();

  for (const row of rows.filter(isTagIssued)) {
    const handle = resolveTagIssuerHandle(row);
    const team = dispatcherTeamForRow(row);
    const label = issuerDisplayLabel(handle, row.dispatcher_name);
    const cur = map.get(handle);
    if (cur) {
      cur.tags += 1;
      if (hasReceipt(row)) {
        cur.receipts += 1;
        cur.cashIn += parsePrice(row.receipt_price);
      }
      if (team === "highkage") cur.team = "highkage";
    } else {
      map.set(handle, {
        tags: 1,
        receipts: hasReceipt(row) ? 1 : 0,
        cashIn: hasReceipt(row) ? parsePrice(row.receipt_price) : 0,
        team,
        label,
      });
    }
  }

  return [...map.entries()]
    .map(([handle, v]) => ({
      handle,
      label: v.label,
      dispatcherTeam: v.team,
      dispatcherLabel: dispatcherLabelForTeam(v.team),
      tags: v.tags,
      receipts: v.receipts,
      cashIn: v.cashIn,
      pay: v.tags * PAYROLL_RATE_ISSUER,
    }))
    .sort((a, b) => b.tags - a.tags || a.label.localeCompare(b.label));
}

export function computeIndividualDispatcherPayrolls(rows: TransactionRow[]): DispatcherPayrollLine[] {
  const teams: Record<"highkage" | "sensei", { tags: number; receipts: number; cashIn: number }> = {
    highkage: { tags: 0, receipts: 0, cashIn: 0 },
    sensei: { tags: 0, receipts: 0, cashIn: 0 },
  };

  for (const row of rows.filter(isTagIssued)) {
    const team = dispatcherTeamForRow(row);
    teams[team].tags += 1;
    if (hasReceipt(row)) {
      teams[team].receipts += 1;
      teams[team].cashIn += parsePrice(row.receipt_price);
    }
  }

  const lines: DispatcherPayrollLine[] = [];
  if (teams.highkage.tags > 0) {
    lines.push({
      team: "highkage",
      label: "Highkage",
      tags: teams.highkage.tags,
      receipts: teams.highkage.receipts,
      cashIn: teams.highkage.cashIn,
      pay: teams.highkage.tags * PAYROLL_RATE_DISPATCHER,
      issuerNote: "Haru (@haruhatsu) tags",
    });
  }
  if (teams.sensei.tags > 0) {
    lines.push({
      team: "sensei",
      label: "Sensei",
      tags: teams.sensei.tags,
      receipts: teams.sensei.receipts,
      cashIn: teams.sensei.cashIn,
      pay: teams.sensei.tags * PAYROLL_RATE_DISPATCHER,
      issuerNote: "All other issuer tags",
    });
  }
  return lines;
}

export function computeLeadStarterPayrolls(rows: TransactionRow[]): LeadStarterPayrollLine[] {
  const map = new Map<string, { clients: number; receipts: number; cashIn: number }>();

  for (const row of rows.filter(isTagIssued)) {
    const handle = resolveLeadCreatorHandle(row);
    if (handle === "unknown") continue;
    const cur = map.get(handle) || { clients: 0, receipts: 0, cashIn: 0 };
    cur.clients += 1;
    if (hasReceipt(row)) {
      cur.receipts += 1;
      cur.cashIn += parsePrice(row.receipt_price);
    }
    map.set(handle, cur);
  }

  return [...map.entries()]
    .map(([handle, v]) => ({
      handle,
      label: leadCreatorDisplayLabel(handle),
      clients: v.clients,
      receipts: v.receipts,
      cashIn: v.cashIn,
      pay: v.clients * PAYROLL_RATE_LEAD_STARTER,
    }))
    .sort((a, b) => b.clients - a.clients || a.label.localeCompare(b.label));
}

export function computeLeadCreatorPayrolls(rows: TransactionRow[]): LeadCreatorPayrollLine[] {
  const map = new Map<
    string,
    {
      handle: string;
      tags: number;
      receipts: number;
      cashIn: number;
      team: "highkage" | "sensei";
      issuers: Set<string>;
    }
  >();

  for (const row of rows.filter(isTagIssued)) {
    const handle = resolveLeadCreatorHandle(row);
    const team = dispatcherTeamForRow(row);
    const key = `${handle}::${team}`;
    const issuerLabel = issuerDisplayLabel(resolveTagIssuerHandle(row), row.dispatcher_name);
    const cur = map.get(key);
    if (cur) {
      cur.tags += 1;
      cur.issuers.add(issuerLabel);
      if (hasReceipt(row)) {
        cur.receipts += 1;
        cur.cashIn += parsePrice(row.receipt_price);
      }
    } else {
      map.set(key, {
        handle,
        tags: 1,
        receipts: hasReceipt(row) ? 1 : 0,
        cashIn: hasReceipt(row) ? parsePrice(row.receipt_price) : 0,
        team,
        issuers: new Set([issuerLabel]),
      });
    }
  }

  return [...map.values()]
    .map((v) => ({
      handle: v.handle,
      label: leadCreatorDisplayLabel(v.handle),
      dispatcherTeam: v.team,
      pairedIssuerLabel: [...v.issuers].sort().join(", "),
      tags: v.tags,
      receipts: v.receipts,
      cashIn: v.cashIn,
      pay: v.tags * PAYROLL_RATE_LEAD_STARTER,
    }))
    .sort((a, b) => b.tags - a.tags || a.label.localeCompare(b.label));
}

export function computeTeamPayrolls(rows: TransactionRow[]): TeamPayrollLine[] {
  const buckets = buildPayrollPairBuckets(rows);
  const teamMap = new Map<"highkage" | "sensei", TeamPayrollLine>();

  for (const b of buckets) {
    const cur = teamMap.get(b.dispatcherTeam);
    if (cur) {
      cur.tags += b.tags;
      cur.issuerPay += b.issuerPay;
      cur.dispatcherPay += b.dispatcherPay;
      cur.total += b.totalPay;
      if (b.dispatcherTeam === "sensei" && b.issuerLabel !== "Unknown issuer") {
        cur.issuerLabel =
          cur.issuerLabel === "Sensei issuers"
            ? b.issuerLabel
            : `${cur.issuerLabel}, ${b.issuerLabel}`;
      }
    } else {
      teamMap.set(b.dispatcherTeam, {
        team: b.dispatcherTeam,
        issuerLabel: b.dispatcherTeam === "highkage" ? "Haru (@haruhatsu)" : b.issuerLabel,
        dispatcherLabel: b.dispatcherTeamLabel,
        tags: b.tags,
        issuerPay: b.issuerPay,
        dispatcherPay: b.dispatcherPay,
        total: b.totalPay,
      });
    }
  }

  if (teamMap.has("sensei")) {
    const s = teamMap.get("sensei")!;
    if (!s.issuerLabel.includes(",")) s.issuerLabel = "Sensei issuers";
  }

  return [...teamMap.values()].sort((a, b) => (a.team === "highkage" ? -1 : b.team === "highkage" ? 1 : 0));
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
  const leadStarterPayrolls = computeLeadStarterPayrolls(rows);
  const payrollLeadStarter = leadStarterPayrolls.reduce((s, line) => s + line.pay, 0);
  const payrollTotal = payrollIssuer + payrollDispatcher + payrollLeadStarter;
  const netAfterPayroll = cashInFromReceipts - payrollTotal;

  const pairBuckets = buildPayrollPairBuckets(rows);

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
    payrollLeadStarter,
    payrollTotal,
    netAfterPayroll,
    periodLabel,
    teamPayrolls: computeTeamPayrolls(rows),
    issuerPayrolls: computeIndividualIssuerPayrolls(rows),
    dispatcherPayrolls: computeIndividualDispatcherPayrolls(rows),
    leadCreatorPayrolls: computeLeadCreatorPayrolls(rows),
    leadStarterPayrolls,
    pairBuckets,
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
    b.payrollOut += PAYROLL_RATE_ISSUER + PAYROLL_RATE_DISPATCHER + PAYROLL_RATE_LEAD_STARTER;
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
