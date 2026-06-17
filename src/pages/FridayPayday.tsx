import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, DollarSign, RefreshCw, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  buildWeeklyBuckets,
  computePaydayStats,
  currentNjWeekBounds,
  filterRowsForNjWeek,
  formatNjDate,
  formatUsd,
  hasReceipt,
  isTagIssued,
  MIN_TAG_PRICE_USD,
  PAYROLL_RATE_DISPATCHER,
  PAYROLL_RATE_ISSUER,
  type TransactionRow,
} from "@/lib/payday";
import {
  clearDispatchPassword,
  fetchAllTransactions,
  getDispatchPassword,
  setDispatchPassword,
  validateDispatchPassword,
} from "@/lib/dispatch-api";
import { useSeo } from "@/hooks/useSeo";

function StatBlock({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "success" | "warn" | "danger" | "gold";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "danger"
          ? "text-red-600"
          : tone === "gold"
            ? "text-amber-700"
            : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 font-display text-2xl font-bold tabular-nums ${toneClass}`}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

export default function FridayPayday() {
  useSeo({
    title: "Friday Payday — TriState Tags",
    description: "Weekly payroll and revenue reconciliation from tags issued and receipts uploaded.",
    noindex: true,
  });

  const [password, setPassword] = useState(getDispatchPassword);
  const [passwordInput, setPasswordInput] = useState("");
  const [authed, setAuthed] = useState(!!getDispatchPassword());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<TransactionRow[]>([]);

  const weekBounds = useMemo(() => currentNjWeekBounds(), []);
  const periodLabel = `NJ week Mon–Sun: ${formatNjDate(weekBounds.startMs)} → ${formatNjDate(weekBounds.endMs)}`;

  const weekRows = useMemo(
    () => filterRowsForNjWeek(rows, weekBounds.startMs, weekBounds.endMs),
    [rows, weekBounds.endMs, weekBounds.startMs]
  );

  const stats = useMemo(() => computePaydayStats(weekRows, periodLabel), [weekRows, periodLabel]);
  const chartData = useMemo(() => buildWeeklyBuckets(rows, 8), [rows]);

  const load = useCallback(async () => {
    if (!getDispatchPassword()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllTransactions("3m");
      setRows(data as TransactionRow[]);
    } catch (e) {
      setError((e as Error).message || "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) load();
  }, [authed, load]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const pw = passwordInput.trim();
    if (!pw) return;
    setLoading(true);
    setError(null);
    const ok = await validateDispatchPassword(pw);
    if (!ok) {
      setError("Wrong password or API unreachable.");
      setLoading(false);
      return;
    }
    setDispatchPassword(pw);
    setPassword(pw);
    setAuthed(true);
    setPasswordInput("");
    setLoading(false);
  }

  function handleLogout() {
    clearDispatchPassword();
    setPassword("");
    setAuthed(false);
    setRows([]);
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900 flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-slate-200 bg-white shadow-xl">
          <CardHeader>
            <CardTitle className="font-display text-2xl">Friday Payday</CardTitle>
            <CardDescription>
              Same password as <a href="/backend" className="text-primary underline">/backend</a>. Pulls live data from
              dispatch + receipt bots — no dispatcher invoices needed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="payday-pw">Admin password</Label>
                <Input
                  id="payday-pw"
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Krab admin password"
                  autoComplete="current-password"
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Checking…" : "Unlock payday dashboard"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const leakPct = stats.expectedIn > 0 ? Math.round((stats.leak / stats.expectedIn) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Wallet className="h-7 w-7 text-emerald-600" />
              <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">Friday Payday</h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">{periodLabel}</p>
            <p className="mt-1 text-xs text-slate-500">
              Auto-calculated from tags issued (DELIVERED) + receipt uploads. Payroll ${PAYROLL_RATE_ISSUER}/tag issuers, $
              {PAYROLL_RATE_DISPATCHER}/tag dispatchers. Haru (@haruhatsu) → Highkage dispatch; all other issuers → Sensei.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              Lock
            </Button>
          </div>
        </header>

        {error ? (
          <div className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {/* Tags + receipts row */}
        <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatBlock label="Tags issued (sold)" value={String(stats.tagsIssued)} sub="DELIVERED this NJ week" />
          <StatBlock
            label="Receipts uploaded"
            value={String(stats.receiptsUploaded)}
            sub={`${stats.receiptsMissing} missing / not uploaded`}
            tone="success"
          />
          <StatBlock
            label="Cash IN (receipts)"
            value={formatUsd(stats.cashInFromReceipts)}
            sub="Sum of receipt $ from uploaded images"
            tone="gold"
          />
          <StatBlock
            label="Expected IN (minimum)"
            value={formatUsd(stats.expectedIn)}
            sub={`${stats.tagsIssued} × $${MIN_TAG_PRICE_USD} floor · lead prices: ${formatUsd(stats.expectedFromLeadPrices)}`}
            tone="default"
          />
        </section>

        {/* Leak alert */}
        {stats.tagsIssued > 0 && stats.leak > 0 ? (
          <Card className="mb-6 border-amber-300 bg-amber-50">
            <CardContent className="flex flex-wrap items-center gap-4 py-5">
              <AlertTriangle className="h-10 w-10 shrink-0 text-amber-600" />
              <div className="flex-1 min-w-[200px]">
                <div className="font-semibold text-amber-900">Revenue leak detected</div>
                <p className="mt-1 text-sm text-slate-600">
                  Receipts show <strong className="text-slate-900">{formatUsd(stats.cashInFromReceipts)}</strong> in, but{" "}
                  <strong className="text-slate-900">{stats.tagsIssued}</strong> tags issued implies at least{" "}
                  <strong className="text-slate-900">{formatUsd(stats.expectedIn)}</strong> should have come in.
                </p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold tabular-nums text-amber-700">{formatUsd(stats.leak)}</div>
                <Badge variant="secondary" className="mt-1 bg-amber-100 text-amber-800">
                  {leakPct}% short
                </Badge>
              </div>
            </CardContent>
          </Card>
        ) : stats.tagsIssued > 0 ? (
          <Card className="mb-6 border-emerald-200 bg-emerald-50">
            <CardContent className="flex items-center gap-3 py-4 text-sm text-emerald-800">
              <TrendingUp className="h-5 w-5" />
              Receipt total meets or exceeds expected minimum for this week.
            </CardContent>
          </Card>
        ) : null}

        {/* Money in vs out */}
        <section className="mb-8 grid gap-6 lg:grid-cols-2">
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                Money IN
              </CardTitle>
              <CardDescription>From receipt uploads this week (all bots combined)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-700">
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span>Receipt $ total (uploaded)</span>
                <span className="font-semibold tabular-nums text-amber-700">{formatUsd(stats.cashInFromReceipts)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2 text-slate-500">
                <span>Expected from lead prices</span>
                <span className="tabular-nums">{formatUsd(stats.expectedFromLeadPrices)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2 text-slate-500">
                <span>Floor ({stats.tagsIssued} × ${MIN_TAG_PRICE_USD})</span>
                <span className="tabular-nums">{formatUsd(stats.minimumExpectedIn)}</span>
              </div>
              <div className="flex justify-between font-medium text-slate-900">
                <span>Expected IN (higher of above)</span>
                <span className="tabular-nums">{formatUsd(stats.expectedIn)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
                <TrendingDown className="h-5 w-5 text-red-600" />
                Payroll OUT
              </CardTitle>
              <CardDescription>Per team — Haru/Highkage vs Sensei (no invoice needed)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-700">
              {stats.teamPayrolls.length === 0 ? (
                <p className="text-slate-500">No tags issued this week.</p>
              ) : (
                stats.teamPayrolls.map((team) => (
                  <div
                    key={team.team}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2"
                  >
                    <div className="font-semibold text-slate-900">
                      {team.team === "highkage" ? "Haru / Highkage" : "Sensei"} — {team.tags} tag
                      {team.tags === 1 ? "" : "s"}
                    </div>
                    <div className="flex justify-between">
                      <span>
                        Issuer {team.issuerLabel} (${PAYROLL_RATE_ISSUER} × {team.tags})
                      </span>
                      <span className="tabular-nums">{formatUsd(team.issuerPay)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>
                        Dispatcher {team.dispatcherLabel} (${PAYROLL_RATE_DISPATCHER} × {team.tags})
                      </span>
                      <span className="tabular-nums">{formatUsd(team.dispatcherPay)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-2 font-medium text-slate-900">
                      <span>Team subtotal</span>
                      <span className="tabular-nums">{formatUsd(team.total)}</span>
                    </div>
                  </div>
                ))
              )}
              <div className="flex justify-between border-t border-slate-200 pt-3 font-semibold text-slate-900">
                <span>Total payroll OUT</span>
                <span className="tabular-nums text-red-600">{formatUsd(stats.payrollTotal)}</span>
              </div>
              <div className="flex justify-between rounded-lg bg-slate-100 px-3 py-2 font-medium text-slate-900">
                <span className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Net after payroll (receipts − payroll)
                </span>
                <span
                  className={`tabular-nums ${stats.netAfterPayroll >= 0 ? "text-emerald-600" : "text-red-600"}`}
                >
                  {formatUsd(stats.netAfterPayroll)}
                </span>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Example math callout */}
        {stats.tagsIssued > 0 ? (
          <Card className="mb-8 border-slate-200 bg-slate-50">
            <CardContent className="py-4 font-mono text-xs sm:text-sm text-slate-600 leading-relaxed">
              <div className="text-slate-900 font-semibold mb-2">This week&apos;s math</div>
              {stats.teamPayrolls.map((team) => (
                <div key={team.team} className="mb-1">
                  {team.issuerLabel} / {team.dispatcherLabel}: {team.tags} tags → issuer{" "}
                  {formatUsd(team.issuerPay)} + dispatcher {formatUsd(team.dispatcherPay)} ={" "}
                  {formatUsd(team.total)}
                </div>
              ))}
              Payroll OUT {formatUsd(stats.payrollTotal)} · {stats.tagsIssued} × ${MIN_TAG_PRICE_USD} ={" "}
              {formatUsd(stats.minimumExpectedIn)} minimum IN · Receipts {formatUsd(stats.cashInFromReceipts)}
              {stats.leak > 0 ? ` · Leak ${formatUsd(stats.leak)}` : ""}
            </CardContent>
          </Card>
        ) : null}

        {/* Chart */}
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Weekly trend (last 8 NJ weeks)</CardTitle>
            <CardDescription>Tags issued, cash from receipts, expected IN, and payroll OUT</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                {loading ? "Loading…" : "No transaction history yet."}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="count" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="usd" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    formatter={(value: number, name: string) =>
                      name.includes("$") || ["cashIn", "expectedIn", "payrollOut", "leak"].includes(name)
                        ? formatUsd(value)
                        : value
                    }
                  />
                  <Legend />
                  <Bar yAxisId="count" dataKey="tags" name="Tags issued" fill="#34d399" radius={[2, 2, 0, 0]} />
                  <Bar yAxisId="count" dataKey="receipts" name="Receipts" fill="#60a5fa" radius={[2, 2, 0, 0]} />
                  <Bar yAxisId="usd" dataKey="cashIn" name="Cash IN $" fill="#fbbf24" radius={[2, 2, 0, 0]} />
                  <Bar yAxisId="usd" dataKey="expectedIn" name="Expected IN $" fill="#a78bfa" radius={[2, 2, 0, 0]} />
                  <Bar yAxisId="usd" dataKey="payrollOut" name="Payroll OUT $" fill="#f87171" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Missing receipts table */}
        {stats.receiptsMissing > 0 ? (
          <Card className="mt-8 border-slate-200 bg-white">
            <CardHeader>
              <CardTitle className="text-lg">Issued — no receipt ({stats.receiptsMissing})</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 pr-4">Ref</th>
                    <th className="py-2 pr-4">When (NJ)</th>
                    <th className="py-2 pr-4">Lead $</th>
                    <th className="py-2">Vehicle</th>
                  </tr>
                </thead>
                <tbody>
                  {weekRows
                    .filter((r) => isTagIssued(r) && !hasReceipt(r))
                    .slice(0, 50)
                    .map((r) => (
                      <tr key={String(r.id ?? r.reference_id)} className="border-b border-slate-100">
                        <td className="py-2 pr-4 font-mono text-xs">{r.reference_id || "—"}</td>
                        <td className="py-2 pr-4 text-xs">{r.timestamp_ny || "—"}</td>
                        <td className="py-2 pr-4">{r.price || `~$${MIN_TAG_PRICE_USD}`}</td>
                        <td className="py-2 text-xs text-slate-500">{r.tag_name || "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : null}

        <p className="mt-8 text-center text-xs text-slate-500">
          Data: krab-dispatch-api + issuer receipts · Same login as{" "}
          <a href="/backend" className="underline">
            /backend
          </a>
          {password ? " · session active" : ""}
        </p>
      </div>
    </div>
  );
}
