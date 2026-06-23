import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import {
  EMPTY_TAG_FORM,
  TagForm,
  type TagFormState,
  validateTagForm,
} from "../components/TagForm";
import { api, type PublicConfig } from "../lib/api";
import { openPaystackPopup } from "../lib/paystack";
import { setSession } from "../lib/auth";
import { formatMoney } from "../lib/formatMoney";

export default function Checkout() {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [form, setForm] = useState<TagFormState>(EMPTY_TAG_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getConfig().then(setCfg).catch(() => setError("Couldn't load checkout. Please refresh."));
  }, []);

  function update<K extends keyof TagFormState>(key: K, value: TagFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const total = useMemo(() => {
    if (!cfg) return 0;
    return cfg.tagPrice + (form.insuranceOptIn ? cfg.insuranceOptInPrice : 0);
  }, [cfg, form.insuranceOptIn]);

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!cfg) return;
    const v = validateTagForm(form);
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
        state: form.state,
        address: form.address.trim(),
        city: form.city.trim(),
        zip: form.zip.trim(),
        vin: form.vin.trim().toUpperCase(),
        year: form.year.trim(),
        make: form.make.trim(),
        model: form.model.trim(),
        color: form.color.trim(),
        bodyType: form.bodyType.trim() || undefined,
        insuranceCompany: form.insuranceCompany.trim() || undefined,
        insurancePolicy: form.insurancePolicy.trim() || undefined,
        insuranceExp: form.insuranceExp.trim() || undefined,
        insuranceOptIn: form.insuranceOptIn,
      });

      if (init.sessionToken) setSession(init.sessionToken);

      try {
        const reference = await openPaystackPopup({
          publicKey: cfg.paystackPublicKey,
          email: form.email.trim(),
          amount: total,
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
            <div className="card p-6 sm:p-8 animate-fade-up">
              <header className="mb-6">
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-navy">Checkout</h1>
                <p className="text-sm text-muted mt-1">
                  Enter your details below. Your tag, insurance card and account are all created the
                  moment payment clears.
                </p>
              </header>
              <TagForm
                form={form}
                cfg={cfg}
                total={total}
                submitting={submitting}
                error={error}
                ctaLabel="Pay {amount} securely"
                onChange={update}
                onSubmit={handlePay}
              />
            </div>

            <OrderSummary form={form} cfg={cfg} total={total} />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function OrderSummary({
  form,
  cfg,
  total,
}: {
  form: TagFormState;
  cfg: PublicConfig | null;
  total: number;
}) {
  return (
    <aside className="card p-6 lg:sticky lg:top-24 animate-fade-up step-1">
      <h2 className="font-display text-lg font-bold text-navy">Order summary</h2>
      <div className="mt-4 space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">
            {form.state ? `${form.state} Temporary Tag` : "Temporary Tag"} (30-day)
          </span>
          <span className="font-semibold text-navy">
            {cfg ? formatMoney(cfg.tagPrice) : "—"}
          </span>
        </div>
        {form.insuranceOptIn && (
          <div className="flex justify-between">
            <span className="text-muted">1-month insurance coverage</span>
            <span className="font-semibold text-navy">
              {cfg ? formatMoney(cfg.insuranceOptInPrice) : "—"}
            </span>
          </div>
        )}
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
          <span className="font-display font-extrabold text-navy">{formatMoney(total)}</span>
        </div>
      </div>
      <div className="mt-5 rounded-lg bg-navy/5 p-3 text-xs text-ink/80">
        <p className="font-semibold text-navy">Account created automatically.</p>
        <p>You&rsquo;ll be signed in right after payment so you can download your documents.</p>
      </div>
    </aside>
  );
}
