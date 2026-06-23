import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { api, type OrderRecord, type UserAccount } from "../lib/api";
import { clearSession, getSession, setSession } from "../lib/auth";
import { openPaystackPopup } from "../lib/paystack";
import { formatDate, formatMoney, relativeDays } from "../lib/formatMoney";

export default function Account() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserAccount | null>(null);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingRenewal, setSavingRenewal] = useState(false);
  const [renewing, setRenewing] = useState(false);

  // Consume an inbound magic-link token, then strip from the URL.
  useEffect(() => {
    const t = params.get("token");
    if (!t) {
      void load();
      return;
    }
    (async () => {
      try {
        const r = await api.consumeToken(t);
        setSession(r.sessionToken);
        params.delete("token");
        setParams(params, { replace: true });
        await load();
      } catch (e) {
        setError((e as Error).message);
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    if (!getSession()) {
      navigate("/login", { replace: true });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await api.getAccount();
      setUser(r.user);
      setOrders(r.orders);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.toLowerCase().includes("unauthorized")) {
        clearSession();
        navigate("/login", { replace: true });
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function toggleRenewal(next: boolean) {
    setSavingRenewal(true);
    setError(null);
    try {
      const r = await api.setRenewal(next);
      setUser(r.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingRenewal(false);
    }
  }

  async function handleRenewNow() {
    if (!user) return;
    setRenewing(true);
    setError(null);
    try {
      const r = await api.startRenewal();
      const cfg = await api.getConfig();
      try {
        const reference = await openPaystackPopup({
          publicKey: cfg.paystackPublicKey,
          email: user.email,
          amount: r.amount,
          currency: cfg.paystackCurrency,
          reference: r.reference,
          firstName: user.firstName,
          lastName: user.lastName,
        });
        navigate(`/success?reference=${encodeURIComponent(reference)}`);
      } catch (popupErr) {
        const msg = (popupErr as Error).message;
        if (msg === "PAYMENT_CANCELLED") {
          setError("Renewal cancelled. You can try again from here whenever you're ready.");
        } else if (r.authorizationUrl) {
          window.location.href = r.authorizationUrl;
        } else {
          setError("Could not open the payment window. Please try again.");
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRenewing(false);
    }
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      /* best-effort */
    }
    clearSession();
    navigate("/login", { replace: true });
  }

  const paidOrders = orders.filter((o) => o.status === "paid");
  const totalSpent = paidOrders.reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const renewalDue = user?.nextRenewalDueAt
    ? new Date(user.nextRenewalDueAt).getTime() <= Date.now()
    : false;

  return (
    <div className="min-h-screen flex flex-col bg-cream relative">
      <Header />
      <main className="flex-1 relative">
        <div className="mesh-bg absolute inset-0 -z-10 opacity-50" aria-hidden="true" />
        <div className="container-x py-8 sm:py-12">
          {loading && !user ? (
            <div className="max-w-xl mx-auto card p-8 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-navy/5">
                <svg className="h-6 w-6 animate-spin text-navy" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                  <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </div>
              <p className="mt-3 text-muted text-sm">Opening your account…</p>
            </div>
          ) : user ? (
            <div className="grid lg:grid-cols-[1fr,340px] gap-8 items-start">
              <div className="space-y-6">
                {/* Header card */}
                <section className="card p-6 sm:p-8 animate-fade-up">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <span className="pill">Member</span>
                      <h1 className="mt-2 font-display text-3xl font-extrabold text-navy">
                        Welcome back, {user.firstName || "friend"}.
                      </h1>
                      <p className="text-sm text-muted">{user.email}</p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="btn-ghost h-10 px-4"
                      type="button"
                    >
                      Sign out
                    </button>
                  </div>

                  {error && (
                    <div
                      role="alert"
                      className="mt-4 rounded-lg border border-gold/40 bg-gold-soft text-navy-dark px-4 py-3 text-sm"
                    >
                      {error}
                    </div>
                  )}
                </section>

                {/* Orders --------------------------------------------- */}
                <section className="card p-6 sm:p-8 animate-fade-up step-1">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-display text-xl font-bold text-navy">Your orders</h2>
                    <Link to="/checkout" className="text-sm font-semibold text-navy hover:text-gold-dark">
                      + New tag
                    </Link>
                  </div>
                  {orders.length === 0 ? (
                    <p className="text-sm text-muted">No orders yet.</p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {orders.map((o) => (
                        <li key={o.id} className="py-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-navy">
                              {formatMoney(o.amount)}
                              <span className="ml-2 text-xs uppercase tracking-wider text-muted">
                                {o.source === "renewal" ? "Renewal" : "First tag"}
                              </span>
                            </p>
                            <p className="text-xs text-muted truncate">
                              {formatDate(o.paidAt || o.createdAt)} ·{" "}
                              <span className="font-mono">{o.reference}</span>
                            </p>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              o.status === "paid"
                                ? "bg-navy text-cream"
                                : o.status === "failed"
                                  ? "bg-gold-soft text-navy-dark"
                                  : "bg-line text-muted"
                            }`}
                          >
                            {o.status === "paid"
                              ? o.fulfilled
                                ? "Delivered"
                                : "Paid"
                              : o.status === "failed"
                                ? "Failed"
                                : "Pending"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              {/* Sidebar ----------------------------------------------- */}
              <aside className="space-y-6">
                {/* Renewal card */}
                <section className="card p-6 sm:p-7 animate-fade-up step-1 relative overflow-hidden">
                  <div
                    className="absolute inset-0 -z-10 opacity-60"
                    style={{
                      backgroundImage:
                        "radial-gradient(420px 220px at 100% 0%, rgba(212,175,55,0.18), transparent 65%)",
                    }}
                    aria-hidden="true"
                  />
                  <h2 className="font-display text-lg font-bold text-navy">Auto-renewal</h2>
                  <p className="mt-1 text-xs text-muted">
                    Reminder every 28 days. Same flat price each time.
                  </p>

                  <label className="mt-4 flex items-center justify-between gap-3 cursor-pointer group">
                    <span className="text-sm font-semibold text-navy">
                      {user.renewalEnabled ? "Reminders on" : "Reminders off"}
                    </span>
                    <span
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 ${
                        user.renewalEnabled ? "bg-navy" : "bg-line"
                      } ${savingRenewal ? "opacity-60" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        checked={user.renewalEnabled}
                        disabled={savingRenewal}
                        onChange={(e) => toggleRenewal(e.target.checked)}
                        aria-label="Auto-renewal reminders"
                      />
                      <span
                        className={`inline-block h-5 w-5 rounded-full bg-cream shadow transition-transform duration-200 ${
                          user.renewalEnabled ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </span>
                  </label>

                  <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-navy/5 p-3">
                      <p className="text-xs text-muted">Total spent</p>
                      <p className="font-semibold text-navy">{formatMoney(totalSpent)}</p>
                    </div>
                    <div className="rounded-lg bg-gold-soft p-3">
                      <p className="text-xs text-muted">Next reminder</p>
                      <p className="font-semibold text-navy-dark">
                        {user.nextRenewalDueAt
                          ? `${formatDate(user.nextRenewalDueAt)}`
                          : "—"}
                      </p>
                      {user.nextRenewalDueAt && (
                        <p className="text-[11px] text-muted mt-0.5">
                          {relativeDays(user.nextRenewalDueAt)}
                        </p>
                      )}
                    </div>
                  </div>

                  {paidOrders.length > 0 && (
                    <button
                      type="button"
                      onClick={handleRenewNow}
                      disabled={renewing}
                      className={`mt-5 w-full ${renewalDue ? "btn-gold" : "btn-primary"} h-11`}
                    >
                      {renewing
                        ? "Opening payment…"
                        : renewalDue
                          ? "Renew now"
                          : "Renew early"}
                    </button>
                  )}
                </section>

                <section className="card p-6 animate-fade-up step-2">
                  <h2 className="font-display text-lg font-bold text-navy">Need a hand?</h2>
                  <p className="mt-1 text-sm text-muted">
                    Misplaced your tag? Reply to any of our emails and we&rsquo;ll resend it
                    to your inbox right away.
                  </p>
                </section>
              </aside>
            </div>
          ) : (
            <div className="max-w-xl mx-auto card p-8 text-center">
              {error ? (
                <>
                  <h1 className="font-display text-2xl font-extrabold text-navy">Something went wrong</h1>
                  <p className="mt-2 text-sm text-muted">{error}</p>
                  <Link to="/login" className="btn-gold mt-6 inline-flex">
                    Try signing in again
                  </Link>
                </>
              ) : (
                <p className="text-muted text-sm">No account found.</p>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
