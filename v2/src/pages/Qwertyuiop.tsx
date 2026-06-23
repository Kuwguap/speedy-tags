/**
 * Sandbox / test environment.
 *
 * Mirrors the real checkout flow but POSTs to /api/test/simulate-purchase
 * which records a paid order, generates the PDF artefacts, and issues a
 * session — no payment processor involved. Useful for testing the
 * NJ-tag and insurance-card pipeline end-to-end.
 */
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
import { api, type OrderDocuments, type PublicConfig } from "../lib/api";
import { setSession } from "../lib/auth";
import { formatMoney } from "../lib/formatMoney";

const SEED_FORM: TagFormState = {
  ...EMPTY_TAG_FORM,
  firstName: "Test",
  lastName: "Driver",
  email: `test+${Date.now().toString(36)}@example.com`,
  phone: "(201) 555-0123",
  state: "NJ",
  address: "123 Main Street",
  city: "Jersey City",
  zip: "07302",
  vin: "1HGCM82633A123456",
  year: String(new Date().getFullYear() - 5),
  make: "Honda",
  model: "Civic",
  color: "Silver",
  bodyType: "Sedan",
  insuranceCompany: "GEICO",
  insurancePolicy: "TEST-POL-001",
  insuranceExp: "12/31/2027",
  insuranceOptIn: false,
};

export default function Qwertyuiop() {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [form, setForm] = useState<TagFormState>(SEED_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<{ orderId: string; documents: OrderDocuments } | null>(null);

  useEffect(() => {
    api
      .getConfig()
      .then((c) => {
        setCfg(c);
        if (!c.testModeEnabled) {
          setError("Test mode is disabled on this server. Set ENABLE_TEST_MODE=1 in .env.");
        }
      })
      .catch(() => setError("Couldn't load config."));
  }, []);

  function update<K extends keyof TagFormState>(key: K, value: TagFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const total = useMemo(() => {
    if (!cfg) return 0;
    return cfg.tagPrice + (form.insuranceOptIn ? cfg.insuranceOptInPrice : 0);
  }, [cfg, form.insuranceOptIn]);

  async function handleSimulate(e: React.FormEvent) {
    e.preventDefault();
    setDocs(null);
    const v = validateTagForm(form);
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.simulatePurchase({
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
      setSession(res.sessionToken);
      setDocs({ orderId: res.order.id, documents: res.documents });
    } catch (err) {
      setError((err as Error).message || "Simulation failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function openDocument(orderId: string, kind: "tag" | "insurance") {
    try {
      const url = await api.fetchDocumentObjectUrl(orderId, kind);
      window.open(url, "_blank", "noopener,noreferrer");
      // Revoke after a beat so the new tab has time to load.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-cream">
      <Header />
      <main className="flex-1 relative">
        <div className="mesh-bg absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
        <div className="container-x py-10 sm:py-14">
          <div className="mb-6 max-w-3xl">
            <span className="pill">Test environment</span>
            <h1 className="mt-3 font-display text-2xl sm:text-3xl font-extrabold text-navy">
              Run a fake purchase
            </h1>
            <p className="text-sm text-muted mt-1">
              This is the full checkout flow with the payment processor swapped out for a
              local simulator. Submissions create a paid order, generate the PDF
              documents, and log you into the account that owns them &mdash; everything is
              real except the money.
            </p>
          </div>

          <div className="grid lg:grid-cols-[1fr,360px] gap-8 items-start">
            <div className="card p-6 sm:p-8 animate-fade-up">
              <TagForm
                form={form}
                cfg={cfg}
                total={total}
                submitting={submitting}
                error={error}
                ctaLabel="Simulate purchase ({amount})"
                onChange={update}
                onSubmit={handleSimulate}
              />
            </div>

            <aside className="space-y-6">
              <div className="card p-6 animate-fade-up step-1">
                <h2 className="font-display text-lg font-bold text-navy">Total</h2>
                <p className="font-display text-3xl font-extrabold text-navy mt-2">
                  {cfg ? formatMoney(total) : "—"}
                </p>
                <p className="text-xs text-muted mt-1">
                  Includes 1-month insurance if you opt in (+{cfg ? formatMoney(cfg.insuranceOptInPrice) : "—"}).
                </p>
                {cfg && !cfg.testModeEnabled && (
                  <p className="mt-3 rounded-md bg-gold-soft text-navy-dark px-3 py-2 text-xs">
                    Test mode is disabled. Set <code>ENABLE_TEST_MODE=1</code> in your <code>.env</code>.
                  </p>
                )}
              </div>

              {docs && (
                <div className="card p-6 animate-fade-up step-2">
                  <h2 className="font-display text-lg font-bold text-navy">Result</h2>
                  <p className="text-xs text-muted mt-1">Order ID</p>
                  <p className="font-mono text-xs break-all text-ink">{docs.orderId}</p>
                  <div className="mt-4 space-y-2">
                    {docs.documents.hasTag ? (
                      <button
                        type="button"
                        className="btn-gold w-full h-11"
                        onClick={() => openDocument(docs.orderId, "tag")}
                      >
                        Open {docs.documents.state || "tag"} temp tag PDF
                      </button>
                    ) : docs.documents.instructions ? (
                      <div className="rounded-lg border border-navy/15 bg-navy/5 text-navy px-3 py-2 text-sm">
                        {docs.documents.instructions}
                      </div>
                    ) : (
                      <p className="text-sm text-muted">No tag generated for this state.</p>
                    )}
                    {docs.documents.hasInsurance && (
                      <button
                        type="button"
                        className="btn-primary w-full h-11"
                        onClick={() => openDocument(docs.orderId, "insurance")}
                      >
                        Open insurance card PDF
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-ghost w-full h-11"
                      onClick={() => navigate("/account")}
                    >
                      Go to my account
                    </button>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
