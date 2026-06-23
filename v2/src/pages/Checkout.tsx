import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { DeliveryNotice } from "../components/DeliveryNotice";
import { api, type PublicConfig } from "../lib/api";
import { openPaystackPopup } from "../lib/paystack";
import { setSession } from "../lib/auth";
import { formatMoney } from "../lib/formatMoney";

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  notes: string;
};

const EMPTY: FormState = { firstName: "", lastName: "", email: "", phone: "", notes: "" };

export default function Checkout() {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getConfig().then(setCfg).catch(() => setError("Couldn't load checkout. Please refresh."));
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): string | null {
    if (!form.firstName.trim()) return "Please enter your first name.";
    if (!form.lastName.trim()) return "Please enter your last name.";
    if (!form.email.includes("@")) return "Please enter a valid email.";
    return null;
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!cfg) return;
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const init = await api.initCheckout({
        email: form.email.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });

      // Auto-account: log them in straight away so /account works after payment.
      if (init.sessionToken) setSession(init.sessionToken);

      try {
        const reference = await openPaystackPopup({
          publicKey: cfg.paystackPublicKey,
          email: form.email.trim(),
          amount: cfg.tagPrice,
          currency: cfg.paystackCurrency,
          reference: init.reference,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone.trim() || undefined,
        });
        navigate(`/success?reference=${encodeURIComponent(reference)}`);
      } catch (popupErr) {
        const msg = (popupErr as Error).message;
        if (msg === "PAYMENT_CANCELLED") {
          setError("Payment cancelled. You can try again anytime.");
        } else if (init.authorizationUrl) {
          // Fallback: hosted page if the inline popup fails to load.
          window.location.href = init.authorizationUrl;
          return;
        } else {
          setError("Could not open the payment window. Please try again.");
        }
      }
    } catch (err) {
      setError((err as Error).message || "Something went wrong starting checkout.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-cream">
      <Header />
      <main className="flex-1 relative">
        <div className="mesh-bg absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
        <div className="container-x py-10 sm:py-14">
          <div className="grid lg:grid-cols-[1fr,360px] gap-8 items-start">
            {/* Form ---------------------------------------------------- */}
            <form
              onSubmit={handlePay}
              className="card p-6 sm:p-8 space-y-6 animate-fade-up"
              noValidate
            >
              <header>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-navy">
                  Checkout
                </h1>
                <p className="text-sm text-muted mt-1">
                  Enter your details. Your tag and account are created the moment payment clears.
                </p>
              </header>

              <DeliveryNotice />

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="label">First name</label>
                  <input
                    id="firstName"
                    name="firstName"
                    className="input"
                    autoComplete="given-name"
                    value={form.firstName}
                    onChange={(e) => update("firstName", e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="label">Last name</label>
                  <input
                    id="lastName"
                    name="lastName"
                    className="input"
                    autoComplete="family-name"
                    value={form.lastName}
                    onChange={(e) => update("lastName", e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="label">
                  Email <span className="text-gold-dark">*</span>
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className="input"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  required
                />
                <p className="mt-1.5 text-xs text-muted">
                  Your tag is sent here. Double-check the spelling &mdash; this is also your account.
                </p>
              </div>

              <div>
                <label htmlFor="phone" className="label">
                  Phone <span className="text-muted font-normal">(optional)</span>
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  className="input"
                  placeholder="(201) 555-0123"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="notes" className="label">
                  Notes <span className="text-muted font-normal">(optional)</span>
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  className="input"
                  placeholder="Anything we should know? VIN, plate type, etc."
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                />
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-gold/40 bg-gold-soft text-navy-dark px-4 py-3 text-sm"
                >
                  {error}
                </div>
              )}

              <button type="submit" className="btn-gold w-full h-12 text-base" disabled={submitting || !cfg}>
                {submitting ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    Starting payment…
                  </>
                ) : (
                  <>
                    Pay {cfg ? formatMoney(cfg.tagPrice) : ""} securely
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </>
                )}
              </button>

              <p className="text-xs text-muted text-center">
                Card details are handled by our PCI-compliant payment processor. We never see them.
              </p>
            </form>

            {/* Order summary ----------------------------------------- */}
            <aside className="card p-6 lg:sticky lg:top-24 animate-fade-up step-1">
              <h2 className="font-display text-lg font-bold text-navy">Order summary</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">NJ Temporary Tag (30-day)</span>
                  <span className="font-semibold text-navy">
                    {cfg ? formatMoney(cfg.tagPrice) : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Inbox delivery</span>
                  <span className="font-semibold text-gold-dark">FREE</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Auto-renew (28 days)</span>
                  <span className="font-semibold text-navy">Opt-in</span>
                </div>
                <div className="border-t border-line pt-3 flex justify-between text-base">
                  <span className="font-display font-bold text-navy">Total</span>
                  <span className="font-display font-extrabold text-navy">
                    {cfg ? formatMoney(cfg.tagPrice) : "—"}
                  </span>
                </div>
              </div>
              <div className="mt-5 rounded-lg bg-navy/5 p-3 text-xs text-ink/80">
                <p className="font-semibold text-navy">Account created automatically.</p>
                <p>
                  You&rsquo;ll be signed in right after payment so you can manage your renewals.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
