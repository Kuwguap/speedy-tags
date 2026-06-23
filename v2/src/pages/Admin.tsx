import { useEffect, useState } from "react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { api, type AdminUserView, type OrderRecord } from "../lib/api";
import { formatDate, formatMoney, relativeDays } from "../lib/formatMoney";

const STORAGE_KEY = "kingsman_admin_password";

type Tab = "orders" | "users";

export default function Admin() {
  const [password, setPassword] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<Tab>("orders");
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  async function load(pw: string) {
    setLoading(true);
    setError(null);
    try {
      const [o, u] = await Promise.all([api.adminOrders(pw), api.adminUsers(pw)]);
      setOrders(o.orders);
      setUsers(u.users);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.toLowerCase().includes("unauthorized")) {
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
    if (password) void load(password);
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
    setUsers([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  async function handleFulfill(o: OrderRecord) {
    setBusyId(o.id);
    try {
      const updated = await api.adminFulfill(o.id, password);
      setOrders((list) => list.map((x) => (x.id === o.id ? updated : x)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleReminder(u: AdminUserView) {
    setBusyId(u.id);
    setError(null);
    try {
      const r = await api.adminSendReminder(u.id, password);
      if (!r.sent && r.reason) setError(`Reminder skipped: ${r.reason}`);
      await load(password);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (!password) {
    return (
      <div className="min-h-screen flex flex-col bg-cream">
        <Header />
        <main className="flex-1 container-x py-14 sm:py-20">
          <form
            onSubmit={handleLogin}
            className="max-w-sm mx-auto card p-7 space-y-4 animate-fade-up"
          >
            <h1 className="font-display text-2xl font-extrabold text-navy">Admin sign in</h1>
            <p className="text-sm text-muted">Enter the admin password.</p>
            <div>
              <label htmlFor="pw" className="label">Password</label>
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
                className="rounded-lg border border-gold/40 bg-gold-soft text-navy-dark px-3 py-2 text-sm"
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

  const visibleOrders = orders.filter((o) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [o.email, o.firstName, o.lastName, o.reference]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const visibleUsers = users.filter((u) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [u.email, u.firstName, u.lastName]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const paidCount = orders.filter((o) => o.status === "paid").length;
  const revenue = orders
    .filter((o) => o.status === "paid")
    .reduce((s, o) => s + (Number(o.amount) || 0), 0);

  return (
    <div className="min-h-screen flex flex-col bg-cream">
      <Header />
      <main className="flex-1 container-x py-8 sm:py-12">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6 animate-fade-up">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-navy">Admin</h1>
            <p className="text-sm text-muted">Orders, members and renewal reminders.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => load(password)} className="btn-ghost h-10 px-4" disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button onClick={handleLogout} className="btn-ghost h-10 px-4">
              Sign out
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mb-6 animate-fade-up step-1">
          <StatBlock label="Orders" value={String(orders.length)} />
          <StatBlock label="Paid" value={String(paidCount)} accent />
          <StatBlock label="Revenue" value={formatMoney(revenue)} />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="flex bg-white border border-line rounded-xl p-1">
            {(["orders", "users"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors ${
                  tab === t ? "bg-navy text-cream" : "text-navy hover:bg-navy/5"
                }`}
              >
                {t === "orders" ? "Orders" : "Members"}
              </button>
            ))}
          </div>
          <input
            className="input sm:max-w-xs"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            inputMode="search"
            aria-label="Search"
          />
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-gold/40 bg-gold-soft text-navy-dark px-3 py-2 text-sm mb-4"
          >
            {error}
          </div>
        )}

        {tab === "orders" ? (
          visibleOrders.length === 0 ? (
            <div className="card p-10 text-center text-muted">
              {orders.length === 0
                ? "No orders yet."
                : "No orders match this search."}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-navy/5 text-left text-xs uppercase tracking-wide text-muted">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Date</th>
                        <th className="px-4 py-3 font-semibold">Customer</th>
                        <th className="px-4 py-3 font-semibold">Email</th>
                        <th className="px-4 py-3 font-semibold">Reference</th>
                        <th className="px-4 py-3 font-semibold">Type</th>
                        <th className="px-4 py-3 font-semibold text-right">Amount</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {visibleOrders.map((o) => (
                        <tr key={o.id} className="hover:bg-navy/5 transition-colors">
                          <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">
                            {new Date(o.createdAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 font-semibold text-navy">
                            {o.firstName} {o.lastName}
                          </td>
                          <td className="px-4 py-3 text-ink/80 break-all">{o.email}</td>
                          <td className="px-4 py-3 font-mono text-xs text-muted">{o.reference}</td>
                          <td className="px-4 py-3 text-xs">
                            {o.source === "renewal" ? (
                              <span className="pill">Renewal</span>
                            ) : (
                              <span className="pill-navy">First</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {formatMoney(o.amount)}
                          </td>
                          <td className="px-4 py-3">
                            <OrderStatusBadge order={o} />
                          </td>
                          <td className="px-4 py-3">
                            {o.status === "paid" && !o.fulfilled && (
                              <button
                                type="button"
                                onClick={() => handleFulfill(o)}
                                disabled={busyId === o.id}
                                className="rounded-md bg-navy text-cream text-xs font-semibold px-3 py-1.5 hover:bg-navy-deep transition-colors cursor-pointer disabled:opacity-60"
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
                {visibleOrders.map((o) => (
                  <li key={o.id} className="card p-4 animate-fade-up">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display font-bold text-navy truncate">
                          {o.firstName} {o.lastName}
                        </p>
                        <p className="text-xs text-muted truncate">{o.email}</p>
                        <p className="text-[11px] text-muted mt-1">
                          {new Date(o.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-display font-extrabold text-navy">
                          {formatMoney(o.amount)}
                        </p>
                        <div className="mt-1">
                          <OrderStatusBadge order={o} />
                        </div>
                      </div>
                    </div>
                    <p className="font-mono text-[11px] text-muted mt-2 truncate">{o.reference}</p>
                    {o.status === "paid" && !o.fulfilled && (
                      <button
                        type="button"
                        onClick={() => handleFulfill(o)}
                        disabled={busyId === o.id}
                        className="mt-3 w-full rounded-md bg-navy text-cream text-sm font-semibold py-2 hover:bg-navy-deep transition-colors cursor-pointer disabled:opacity-60"
                      >
                        {busyId === o.id ? "Saving…" : "Mark fulfilled"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )
        ) : visibleUsers.length === 0 ? (
          <div className="card p-10 text-center text-muted">
            {users.length === 0 ? "No members yet." : "No members match this search."}
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto hidden md:block">
              <table className="min-w-full text-sm">
                <thead className="bg-navy/5 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Member</th>
                    <th className="px-4 py-3 font-semibold">Renewal</th>
                    <th className="px-4 py-3 font-semibold">Last paid</th>
                    <th className="px-4 py-3 font-semibold">Next reminder</th>
                    <th className="px-4 py-3 font-semibold text-right">Spent</th>
                    <th className="px-4 py-3 font-semibold">Last reminder</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visibleUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-navy/5 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-navy">
                          {u.firstName} {u.lastName}
                        </div>
                        <div className="text-xs text-muted break-all">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        {u.renewalEnabled ? (
                          <span className="pill-navy">On</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-line px-3 py-1 text-xs font-semibold text-muted">
                            Off
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">{formatDate(u.lastPaidAt)}</td>
                      <td className="px-4 py-3 text-xs">
                        {formatDate(u.nextRenewalDueAt)}
                        {u.nextRenewalDueAt && (
                          <span className="text-muted ml-1">
                            ({relativeDays(u.nextRenewalDueAt)})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {formatMoney(u.totalSpent)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {u.lastReminderAt ? formatDate(u.lastReminderAt) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleReminder(u)}
                          disabled={busyId === u.id || u.ordersCount === 0}
                          className="rounded-md bg-gold text-navy-dark text-xs font-semibold px-3 py-1.5 hover:bg-gold-dark hover:text-cream transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {busyId === u.id ? "Sending…" : "Send reminder"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile member cards */}
            <ul className="md:hidden divide-y divide-line">
              {visibleUsers.map((u) => (
                <li key={u.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-navy truncate">
                        {u.firstName} {u.lastName}
                      </p>
                      <p className="text-xs text-muted break-all">{u.email}</p>
                    </div>
                    {u.renewalEnabled ? (
                      <span className="pill-navy">On</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-line px-3 py-1 text-xs font-semibold text-muted">
                        Off
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div>
                      <p className="text-muted">Last paid</p>
                      <p className="font-semibold text-navy">{formatDate(u.lastPaidAt)}</p>
                    </div>
                    <div>
                      <p className="text-muted">Next reminder</p>
                      <p className="font-semibold text-navy">{formatDate(u.nextRenewalDueAt)}</p>
                    </div>
                    <div>
                      <p className="text-muted">Spent</p>
                      <p className="font-semibold text-navy">{formatMoney(u.totalSpent)}</p>
                    </div>
                    <div>
                      <p className="text-muted">Reminder sent</p>
                      <p className="font-semibold text-navy">
                        {u.lastReminderAt ? formatDate(u.lastReminderAt) : "—"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleReminder(u)}
                    disabled={busyId === u.id || u.ordersCount === 0}
                    className="mt-3 w-full rounded-md bg-gold text-navy-dark text-sm font-semibold py-2 hover:bg-gold-dark hover:text-cream transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {busyId === u.id ? "Sending…" : "Send renewal reminder"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

function StatBlock({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wide text-muted font-semibold">{label}</p>
      <p
        className={`font-display text-2xl font-extrabold mt-1 ${
          accent ? "text-gold-dark" : "text-navy"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function OrderStatusBadge({ order }: { order: OrderRecord }) {
  if (order.status === "paid") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          order.fulfilled
            ? "bg-navy text-cream"
            : "bg-gold-soft text-navy-dark"
        }`}
      >
        {order.fulfilled ? "Fulfilled" : "Paid"}
      </span>
    );
  }
  if (order.status === "failed") {
    return (
      <span className="inline-flex items-center rounded-full bg-gold-soft px-2.5 py-0.5 text-xs font-semibold text-navy-dark">
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-line px-2.5 py-0.5 text-xs font-semibold text-muted">
      Pending
    </span>
  );
}
