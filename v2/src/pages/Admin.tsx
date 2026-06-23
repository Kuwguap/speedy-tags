import { useEffect, useState } from "react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { api, type OrderRecord } from "../lib/api";
import { formatMoney } from "../lib/formatMoney";

const STORAGE_KEY = "tristate_admin_password";

export default function Admin() {
  const [password, setPassword] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });
  const [draft, setDraft] = useState("");
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "pending">("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(pw: string) {
    setLoading(true);
    setError(null);
    try {
      const { orders } = await api.adminOrders(pw);
      setOrders(orders);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "UNAUTHORIZED" || msg.toLowerCase().includes("unauthorized")) {
        setPassword("");
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (password) load(password);
  }, [password]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.adminLogin(draft);
      try {
        localStorage.setItem(STORAGE_KEY, draft);
      } catch {
        /* ignore */
      }
      setPassword(draft);
      setDraft("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    setPassword("");
    setOrders([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  async function handleFulfill(o: OrderRecord) {
    setBusyId(o.id);
    try {
      const updated = await api.adminMarkFulfilled(o.id, password);
      setOrders((list) => list.map((x) => (x.id === o.id ? updated : x)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (!password) {
    return (
      <div className="min-h-screen flex flex-col bg-primary-bg">
        <Header />
        <main className="flex-1 container-x py-14 sm:py-20">
          <form
            onSubmit={handleLogin}
            className="max-w-sm mx-auto card p-7 space-y-4"
            aria-labelledby="admin-title"
          >
            <h1 id="admin-title" className="font-display text-2xl font-extrabold text-ink">
              Admin sign in
            </h1>
            <p className="text-sm text-muted">
              Enter the admin password. This is just for you — customers never see this page.
            </p>
            <div>
              <label htmlFor="pw" className="label">
                Password
              </label>
              <input
                id="pw"
                type="password"
                className="input"
                autoComplete="current-password"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                required
              />
            </div>
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-accent/40 bg-accent/10 text-accent-dark px-3 py-2 text-sm"
              >
                {error}
              </div>
            )}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? "Checking…" : "Sign in"}
            </button>
          </form>
        </main>
        <Footer />
      </div>
    );
  }

  const visible = orders
    .filter((o) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "paid") return o.status === "paid";
      return o.status !== "paid";
    })
    .filter((o) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return [o.email, o.firstName, o.lastName, o.reference, o.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

  const paidCount = orders.filter((o) => o.status === "paid").length;
  const revenue = orders
    .filter((o) => o.status === "paid")
    .reduce((sum, o) => sum + (Number(o.amount) || 0), 0);

  return (
    <div className="min-h-screen flex flex-col bg-primary-bg">
      <Header />
      <main className="flex-1 container-x py-8 sm:py-12">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-ink">Orders</h1>
            <p className="text-sm text-muted">
              All payments collected via Paystack. Email each customer their tag, then mark as fulfilled.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => load(password)}
              className="btn-ghost h-10 px-4"
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button onClick={handleLogout} className="btn-ghost h-10 px-4">
              Sign out
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mb-6">
          <div className="card p-4">
            <p className="text-xs uppercase tracking-wide text-muted font-semibold">Orders</p>
            <p className="font-display text-2xl font-extrabold text-ink mt-1">{orders.length}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs uppercase tracking-wide text-muted font-semibold">Paid</p>
            <p className="font-display text-2xl font-extrabold text-primary mt-1">{paidCount}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs uppercase tracking-wide text-muted font-semibold">Revenue</p>
            <p className="font-display text-2xl font-extrabold text-ink mt-1">{formatMoney(revenue)}</p>
          </div>
        </div>

        <div className="card p-4 mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <input
            className="input sm:max-w-xs"
            placeholder="Search email, name, reference…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search orders"
          />
          <div className="flex flex-wrap gap-2">
            {(["all", "paid", "pending"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors cursor-pointer ${
                  statusFilter === f
                    ? "bg-primary text-white"
                    : "bg-white text-ink border border-line hover:bg-primary-bg"
                }`}
              >
                {f === "all" ? "All" : f === "paid" ? "Paid" : "Pending / failed"}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-accent/40 bg-accent/10 text-accent-dark px-3 py-2 text-sm mb-4"
          >
            {error}
          </div>
        )}

        {visible.length === 0 ? (
          <div className="card p-10 text-center text-muted">
            {orders.length === 0
              ? "No orders yet. Once a customer pays, they'll appear here."
              : "No orders match this filter."}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-primary-bg text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold">Customer</th>
                      <th className="px-4 py-3 font-semibold">Email</th>
                      <th className="px-4 py-3 font-semibold">Reference</th>
                      <th className="px-4 py-3 font-semibold text-right">Amount</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {visible.map((o) => (
                      <tr key={o.id} className="hover:bg-primary-bg/40">
                        <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">
                          {new Date(o.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-semibold text-ink">
                          {o.firstName} {o.lastName}
                        </td>
                        <td className="px-4 py-3 text-ink/80 break-all">{o.email}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted">{o.reference}</td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {formatMoney(o.amount)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge order={o} />
                        </td>
                        <td className="px-4 py-3">
                          {o.status === "paid" && !o.fulfilled && (
                            <button
                              type="button"
                              onClick={() => handleFulfill(o)}
                              disabled={busyId === o.id}
                              className="rounded-md bg-primary text-white text-xs font-semibold px-3 py-1.5 hover:bg-primary-dark transition-colors cursor-pointer disabled:opacity-60"
                            >
                              {busyId === o.id ? "Saving…" : "Mark fulfilled"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <ul className="md:hidden space-y-3">
              {visible.map((o) => (
                <li key={o.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display font-bold text-ink truncate">
                        {o.firstName} {o.lastName}
                      </p>
                      <p className="text-xs text-muted truncate">{o.email}</p>
                      <p className="text-[11px] text-muted mt-1">
                        {new Date(o.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-display font-extrabold text-ink">{formatMoney(o.amount)}</p>
                      <div className="mt-1">
                        <StatusBadge order={o} />
                      </div>
                    </div>
                  </div>
                  <p className="font-mono text-[11px] text-muted mt-2 truncate">{o.reference}</p>
                  {o.notes && (
                    <p className="text-xs text-ink/80 mt-2 bg-primary-bg rounded-md p-2">
                      {o.notes}
                    </p>
                  )}
                  {o.status === "paid" && !o.fulfilled && (
                    <button
                      type="button"
                      onClick={() => handleFulfill(o)}
                      disabled={busyId === o.id}
                      className="mt-3 w-full rounded-md bg-primary text-white text-sm font-semibold py-2 hover:bg-primary-dark transition-colors cursor-pointer disabled:opacity-60"
                    >
                      {busyId === o.id ? "Saving…" : "Mark fulfilled"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

function StatusBadge({ order }: { order: OrderRecord }) {
  if (order.status === "paid") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          order.fulfilled
            ? "bg-primary/10 text-primary-dark"
            : "bg-accent/15 text-accent-dark"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            order.fulfilled ? "bg-primary" : "bg-accent"
          }`}
          aria-hidden="true"
        />
        {order.fulfilled ? "Fulfilled" : "Paid · action needed"}
      </span>
    );
  }
  if (order.status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent-dark">
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-line px-2.5 py-0.5 text-xs font-semibold text-muted">
      Pending
    </span>
  );
}
