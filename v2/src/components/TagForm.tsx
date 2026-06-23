/**
 * Shared checkout form (used by `/checkout` and `/qwertyuiop`). Collects
 * everything we need to mint a temp tag and (optionally) an insurance card:
 * personal, address, vehicle, and insurance fields. The state picker drives
 * downstream behaviour (auto-tag vs. instructions).
 */
import { useMemo } from "react";
import type { PublicConfig } from "../lib/api";
import { DeliveryNotice } from "./DeliveryNotice";
import { StateInfoNotice } from "./StateInfoNotice";
import { formatMoney } from "../lib/formatMoney";

export interface TagFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  notes: string;
  state: string;
  address: string;
  city: string;
  zip: string;
  vin: string;
  year: string;
  make: string;
  model: string;
  color: string;
  bodyType: string;
  insuranceCompany: string;
  insurancePolicy: string;
  insuranceExp: string;
  insuranceOptIn: boolean;
}

export const EMPTY_TAG_FORM: TagFormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  notes: "",
  state: "",
  address: "",
  city: "",
  zip: "",
  vin: "",
  year: "",
  make: "",
  model: "",
  color: "",
  bodyType: "",
  insuranceCompany: "",
  insurancePolicy: "",
  insuranceExp: "",
  insuranceOptIn: false,
};

export function validateTagForm(form: TagFormState): string | null {
  if (!form.firstName.trim()) return "Please enter your first name.";
  if (!form.lastName.trim()) return "Please enter your last name.";
  if (!form.email.includes("@")) return "Please enter a valid email.";
  if (!form.state) return "Pick your state.";
  if (!form.address.trim()) return "Please enter your street address.";
  if (!form.city.trim()) return "Please enter your city.";
  if (!form.zip.trim()) return "Please enter your ZIP code.";
  if (!form.vin.trim()) return "Please enter your VIN.";
  if (!form.year.trim()) return "Please enter the vehicle year.";
  if (!form.make.trim()) return "Please enter the vehicle make.";
  if (!form.model.trim()) return "Please enter the vehicle model.";
  if (!form.insuranceOptIn && !form.insuranceCompany.trim()) {
    return "Tell us your insurance company or add 1-month coverage.";
  }
  return null;
}

interface Props {
  form: TagFormState;
  cfg: PublicConfig | null;
  total: number;
  submitting: boolean;
  error: string | null;
  ctaLabel: string;
  onChange: <K extends keyof TagFormState>(key: K, value: TagFormState[K]) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function TagForm({
  form,
  cfg,
  total,
  submitting,
  error,
  ctaLabel,
  onChange,
  onSubmit,
}: Props) {
  const states = cfg?.supportedStates ?? ["NJ", "NY"];

  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear() + 1;
    const out: string[] = [];
    for (let y = now; y >= now - 35; y--) out.push(String(y));
    return out;
  }, []);

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <DeliveryNotice />

      {/* Personal ---------------------------------------------------- */}
      <fieldset className="space-y-4">
        <legend className="text-xs uppercase tracking-wider text-muted font-semibold">
          Personal
        </legend>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className="label">First name</label>
            <input
              id="firstName"
              className="input"
              autoComplete="given-name"
              value={form.firstName}
              onChange={(e) => onChange("firstName", e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="lastName" className="label">Last name</label>
            <input
              id="lastName"
              className="input"
              autoComplete="family-name"
              value={form.lastName}
              onChange={(e) => onChange("lastName", e.target.value)}
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
            type="email"
            inputMode="email"
            autoComplete="email"
            className="input"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => onChange("email", e.target.value)}
            required
          />
          <p className="mt-1.5 text-xs text-muted">
            Your tag and account both ride on this address. Double-check the spelling.
          </p>
        </div>
        <div>
          <label htmlFor="phone" className="label">
            Phone <span className="text-muted font-normal">(optional)</span>
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="input"
            placeholder="(201) 555-0123"
            value={form.phone}
            onChange={(e) => onChange("phone", e.target.value)}
          />
        </div>
      </fieldset>

      {/* Address ---------------------------------------------------- */}
      <fieldset className="space-y-4">
        <legend className="text-xs uppercase tracking-wider text-muted font-semibold">
          Address
        </legend>
        <div>
          <label htmlFor="address" className="label">Street address</label>
          <input
            id="address"
            className="input"
            autoComplete="street-address"
            value={form.address}
            onChange={(e) => onChange("address", e.target.value)}
            required
          />
        </div>
        <div className="grid sm:grid-cols-[1fr,120px,120px] gap-4">
          <div>
            <label htmlFor="city" className="label">City</label>
            <input
              id="city"
              className="input"
              autoComplete="address-level2"
              value={form.city}
              onChange={(e) => onChange("city", e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="state" className="label">State</label>
            <select
              id="state"
              className="input"
              value={form.state}
              onChange={(e) => onChange("state", e.target.value)}
              required
            >
              <option value="" disabled>Choose…</option>
              {states.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="zip" className="label">ZIP</label>
            <input
              id="zip"
              inputMode="numeric"
              autoComplete="postal-code"
              className="input"
              value={form.zip}
              onChange={(e) => onChange("zip", e.target.value)}
              required
            />
          </div>
        </div>
        {form.state && <StateInfoNotice state={form.state} />}
      </fieldset>

      {/* Vehicle ---------------------------------------------------- */}
      <fieldset className="space-y-4">
        <legend className="text-xs uppercase tracking-wider text-muted font-semibold">
          Vehicle
        </legend>
        <div>
          <label htmlFor="vin" className="label">VIN</label>
          <input
            id="vin"
            className="input font-mono tracking-wider uppercase"
            maxLength={17}
            value={form.vin}
            onChange={(e) => onChange("vin", e.target.value.toUpperCase())}
            required
          />
        </div>
        <div className="grid sm:grid-cols-[140px,1fr,1fr] gap-4">
          <div>
            <label htmlFor="year" className="label">Year</label>
            <select
              id="year"
              className="input"
              value={form.year}
              onChange={(e) => onChange("year", e.target.value)}
              required
            >
              <option value="" disabled>Year</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="make" className="label">Make</label>
            <input
              id="make"
              className="input"
              placeholder="Honda"
              value={form.make}
              onChange={(e) => onChange("make", e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="model" className="label">Model</label>
            <input
              id="model"
              className="input"
              placeholder="Civic"
              value={form.model}
              onChange={(e) => onChange("model", e.target.value)}
              required
            />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="color" className="label">
              Color <span className="text-muted font-normal">(optional)</span>
            </label>
            <input
              id="color"
              className="input"
              value={form.color}
              onChange={(e) => onChange("color", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="bodyType" className="label">
              Body type <span className="text-muted font-normal">(optional)</span>
            </label>
            <input
              id="bodyType"
              className="input"
              placeholder="Sedan / SUV / Truck"
              value={form.bodyType}
              onChange={(e) => onChange("bodyType", e.target.value)}
            />
          </div>
        </div>
      </fieldset>

      {/* Insurance -------------------------------------------------- */}
      <fieldset className="space-y-4">
        <legend className="text-xs uppercase tracking-wider text-muted font-semibold">
          Insurance
        </legend>
        <label
          className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
            form.insuranceOptIn
              ? "border-gold bg-gold-soft"
              : "border-line hover:border-navy/30"
          }`}
        >
          <input
            type="checkbox"
            className="mt-1 cursor-pointer h-4 w-4 accent-navy"
            checked={form.insuranceOptIn}
            onChange={(e) => onChange("insuranceOptIn", e.target.checked)}
          />
          <div className="flex-1">
            <p className="font-semibold text-navy">
              I don&rsquo;t have insurance &mdash; add 1-month coverage
              <span className="ml-2 inline-flex items-center rounded-full bg-navy text-cream px-2 py-0.5 text-xs">
                +{formatMoney(cfg?.insuranceOptInPrice ?? 100)}
              </span>
            </p>
            <p className="text-sm text-muted">
              We&rsquo;ll generate a printable insurance card valid for 30 days, sized for
              your wallet and your DMV.
            </p>
          </div>
        </label>
        {!form.insuranceOptIn && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="insuranceCompany" className="label">Insurance company</label>
              <input
                id="insuranceCompany"
                className="input"
                placeholder="GEICO"
                value={form.insuranceCompany}
                onChange={(e) => onChange("insuranceCompany", e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="insurancePolicy" className="label">Policy number</label>
              <input
                id="insurancePolicy"
                className="input font-mono"
                value={form.insurancePolicy}
                onChange={(e) => onChange("insurancePolicy", e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="insuranceExp" className="label">Expires (MM/DD/YYYY)</label>
              <input
                id="insuranceExp"
                className="input"
                placeholder="MM/DD/YYYY"
                value={form.insuranceExp}
                onChange={(e) => onChange("insuranceExp", e.target.value)}
              />
            </div>
          </div>
        )}
      </fieldset>

      <div>
        <label htmlFor="notes" className="label">
          Notes <span className="text-muted font-normal">(optional)</span>
        </label>
        <textarea
          id="notes"
          rows={3}
          className="input"
          placeholder="Anything we should know?"
          value={form.notes}
          onChange={(e) => onChange("notes", e.target.value)}
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
            Working…
          </>
        ) : (
          <>
            {ctaLabel.replace("{amount}", formatMoney(total))}
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
  );
}
