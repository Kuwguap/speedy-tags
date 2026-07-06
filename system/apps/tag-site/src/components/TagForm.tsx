import { useMemo, useState } from "react";
import { SUPPORTED_STATES } from "../lib/states";
import { createCheckoutSession, type PublicConfig, type TagFormData } from "../lib/api";
import StateNotice from "./StateNotice";
import TempPlate from "./TempPlate";

const empty: TagFormData = {
  firstName: "", lastName: "", email: "", phone: "", state: "",
  address: "", address2: "", city: "", zip: "",
  vin: "", year: "", make: "", model: "", color: "", body: "",
  insuranceOptIn: false, insuranceCompany: "", insurancePolicy: "", notes: "",
  deliveryMethod: "email", deliveryEmail: "",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="card p-5 sm:p-6">
      <legend className="px-1 font-display text-sm font-600 uppercase tracking-[0.12em] text-slate">
        {title}
      </legend>
      <div className="mt-4 grid gap-4">{children}</div>
    </fieldset>
  );
}

export default function TagForm({ config }: { config: PublicConfig | null }) {
  const [f, setF] = useState<TagFormData>(empty);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof TagFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  const total = useMemo(() => {
    if (!config) return null;
    return config.tagPrice + (f.insuranceOptIn ? config.insuranceOptInPrice : 0);
  }, [config, f.insuranceOptIn]);

  const vehicleLabel = [f.year, f.make, f.model].filter(Boolean).join(" ");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.firstName || !f.lastName || !f.email.includes("@") || !f.state) {
      setError("Please fill in your name, a valid email, and your state.");
      return;
    }
    setSubmitting(true);
    try {
      const { url } = await createCheckoutSession({ ...f, deliveryEmail: f.deliveryEmail || f.email });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <form onSubmit={onSubmit} className="grid gap-5">
        <Section title="Your details">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">First name</label>
              <input className="field" value={f.firstName} onChange={set("firstName")} required />
            </div>
            <div>
              <label className="label">Last name</label>
              <input className="field" value={f.lastName} onChange={set("lastName")} required />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Email</label>
              <input className="field" type="email" value={f.email} onChange={set("email")} required />
            </div>
            <div>
              <label className="label">Phone (optional)</label>
              <input className="field" value={f.phone} onChange={set("phone")} />
            </div>
          </div>
        </Section>

        <Section title="Registration address">
          <div>
            <label className="label">State</label>
            <select className="field" value={f.state} onChange={set("state")} required>
              <option value="">Select your state…</option>
              {SUPPORTED_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <StateNotice state={f.state} />
          <div>
            <label className="label">Street address</label>
            <input className="field" value={f.address} onChange={set("address")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="label">City</label>
              <input className="field" value={f.city} onChange={set("city")} />
            </div>
            <div>
              <label className="label">Apt / unit</label>
              <input className="field" value={f.address2} onChange={set("address2")} />
            </div>
            <div>
              <label className="label">ZIP</label>
              <input className="field" value={f.zip} onChange={set("zip")} />
            </div>
          </div>
        </Section>

        <Section title="Vehicle">
          <div>
            <label className="label">VIN</label>
            <input className="field font-plate uppercase" maxLength={17} value={f.vin} onChange={set("vin")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className="label">Year</label>
              <input className="field" value={f.year} onChange={set("year")} />
            </div>
            <div>
              <label className="label">Make</label>
              <input className="field" value={f.make} onChange={set("make")} />
            </div>
            <div>
              <label className="label">Model</label>
              <input className="field" value={f.model} onChange={set("model")} />
            </div>
            <div>
              <label className="label">Color</label>
              <input className="field" value={f.color} onChange={set("color")} />
            </div>
          </div>
        </Section>

        <Section title="Coverage">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink/12 p-4 transition-colors hover:border-issued/50">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-issued"
              checked={f.insuranceOptIn}
              onChange={(e) => setF((p) => ({ ...p, insuranceOptIn: e.target.checked }))}
            />
            <span>
              <span className="font-display text-sm font-600 text-ink">
                Add a 1-month coverage card
                {config ? ` (+$${config.insuranceOptInPrice})` : ""}
              </span>
              <span className="mt-0.5 block text-sm text-slate">
                Includes a printable insurance ID card for your new plate.
              </span>
            </span>
          </label>
          {f.insuranceOptIn && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Insurance company (optional)</label>
                <input className="field" value={f.insuranceCompany} onChange={set("insuranceCompany")} />
              </div>
              <div>
                <label className="label">Policy # (optional)</label>
                <input className="field" value={f.insurancePolicy} onChange={set("insurancePolicy")} />
              </div>
            </div>
          )}
        </Section>

        {error && (
          <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        )}
      </form>

      {/* Live preview + sticky summary */}
      <aside className="lg:sticky lg:top-6 lg:h-fit">
        <div className="mb-6 flex justify-center">
          <TempPlate
            plate="H150706"
            ownerName={[f.firstName, f.lastName].filter(Boolean).join(" ") || undefined}
            vehicle={vehicleLabel || undefined}
            expLabel="30 DAYS"
            stamped={false}
            animate={false}
          />
        </div>
        <div className="card p-5">
          <div className="flex items-baseline justify-between">
            <span className="font-display text-sm font-600 uppercase tracking-wide text-slate">Total</span>
            <span className="font-display text-3xl font-700 text-ink">
              {total != null ? `$${total}` : "—"}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate">30-day temporary tag{f.insuranceOptIn ? " + coverage card" : ""}.</p>
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="btn-primary mt-4 w-full"
          >
            {submitting ? "Redirecting…" : "Continue to secure payment →"}
          </button>
          <p className="mt-3 text-center text-xs text-slate-light">Powered by Stripe. No card data touches our servers.</p>
        </div>
      </aside>
    </div>
  );
}
