import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { DeliveryNotice } from "../components/DeliveryNotice";
import { api, type PublicConfig } from "../lib/api";
import { openPaystackPopup } from "../lib/paystack";
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
    api.getConfig().then(setCfg).catch(() => setError("Couldn't load checkout config. Refresh?"));
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
        amount: cfg.tagPrice,
        notes: form.notes.trim() || undefined,
      });

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
          // Fallback: send them to hosted Paystack page if inline fails to load.
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
    <div className="min-h-screen flex flex-col bg-primary-bg">
      <Header />
      <main className="flex-1 container-x py-10 sm:py-14">
        <div className="grid lg:grid-cols-[1fr,360px] gap-8 items-start">
          {/* Form card */}
          <form onSubmit={handlePay} className="card p-6 sm:p-8 space-y-6" noValidate>
            <header>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-ink">
                Checkout
              </h1>
              <p className="text-sm text-muted mt-1">
                Enter your details. Your tag will be emailed after payment.
              </p>
            </header>

            <DeliveryNotice />

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="label">
                  First name
                </label>
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
                <label htmlFor="lastName" className="label">
                  Last name
                </label>
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
                Email <span className="text-accent">*</span>
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
                Your tag is sent to this email. Double-check the spelling.
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
                className="rounded-lg border border-accent/40 bg-accent/10 text-accent-dark px-4 py-3 text-sm"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn-cta w-full h-12 text-base"
              disabled={submitting || !cfg}
            >
              {submitting ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                    <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Starting payment…
                </>
              ) : (
                <>
                  Pay {cfg ? formatMoney(cfg.tagPrice) : ""} with Paystack
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </>
              )}
            </button>

            <p className="text-xs text-muted text-center">
              Payments processed securely by Paystack. We never see your card details.
            </p>
          </form>

          {/* Order summary */}
          <aside className="card p-6 lg:sticky lg:top-24">
            <h2 className="font-display text-lg font-bold text-ink">Order summary</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">NJ Temporary Tag (30-day)</span>
                <span className="font-semibold text-ink">
                  {cfg ? formatMoney(cfg.tagPrice) : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Email delivery</span>
                <span className="font-semibold text-primary">FREE</span>
              </div>
              <div className="border-t border-line pt-3 flex justify-between text-base">
                <span className="font-display font-bold text-ink">Total</span>
                <span className="font-display font-extrabold text-primary">
                  {cfg ? formatMoney(cfg.tagPrice) : "—"}
                </span>
              </div>
            </div>
            <div className="mt-5 rounded-lg bg-primary-bg p-3 text-xs text-ink/80">
              <p className="font-semibold text-primary-dark">No physical shipping.</p>
              <p>
                Your tag will be delivered to the email above within a few minutes of payment.
              </p>
            </div>
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}
