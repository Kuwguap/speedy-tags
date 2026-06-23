import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { DeliveryNotice } from "../components/DeliveryNotice";
import { api } from "../lib/api";
import { formatMoney } from "../lib/formatMoney";

interface Feature {
  title: string;
  body: string;
  Icon: () => JSX.Element;
}

const FEATURES: Feature[] = [
  {
    title: "Instant inbox delivery",
    body: "Pay once, refresh your email, your tag is right there. No driver, no shipping, no waiting.",
    Icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="m13 2-3 7h6l-3 13" />
      </svg>
    ),
  },
  {
    title: "30-day NJ validity",
    body: "Stay road-legal for 30 days. The temp tag covers you while you finalize registration.",
    Icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l2.5 1.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
  {
    title: "Auto-renewal at a flat price",
    body: "Opt in and we&rsquo;ll remind you every 28 days so you can renew at the same price in one tap.",
    Icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5" />
      </svg>
    ),
  },
];

const STEPS = [
  { n: "1", title: "Fill the form", body: "Name and email — that&rsquo;s it. Account created automatically." },
  { n: "2", title: "Pay securely", body: "Use card, bank or wallet. One flat price, no hidden fees." },
  { n: "3", title: "Check your inbox", body: "Your tag confirmation lands within minutes." },
];

export default function Landing() {
  const [price, setPrice] = useState<number | null>(null);
  const [period, setPeriod] = useState<number>(28);

  useEffect(() => {
    api
      .getConfig()
      .then((c) => {
        setPrice(c.tagPrice);
        setPeriod(c.renewalPeriodDays || 28);
      })
      .catch(() => setPrice(150));
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-cream relative">
      <Header />

      <main className="flex-1">
        {/* Hero ------------------------------------------------------ */}
        <section className="relative overflow-hidden">
          <div className="mesh-bg absolute inset-0 -z-10" aria-hidden="true" />
          <div className="container-x py-16 sm:py-24 grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className="stagger">
              <span className="pill animate-fade-up">Membership · Auto-renew · Flat price</span>
              <h1 className="mt-4 font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.05] text-navy animate-fade-up step-1">
                NJ temporary tags,
                <br />
                <span className="bg-gradient-to-r from-gold-dark via-gold to-gold-dark bg-clip-text text-transparent">
                  delivered like royalty.
                </span>
              </h1>
              <p className="mt-5 text-lg text-muted max-w-xl animate-fade-up step-2">
                Get your tag in your inbox in minutes. Opt in to auto-renewal and
                we&rsquo;ll remind you every {period} days so you can renew at the same flat
                price &mdash; one tap, no surprises.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3 animate-fade-up step-3">
                <Link to="/checkout" className="btn-gold h-12 px-6 text-base">
                  Get my tag {price != null ? `· ${formatMoney(price)}` : ""}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
                <a href="#how" className="btn-ghost h-12 px-5 text-base">
                  How it works
                </a>
              </div>
              <div className="mt-6 animate-fade-up step-4">
                <DeliveryNotice />
              </div>
            </div>

            {/* Floating tag preview -------------------------------- */}
            <div className="relative">
              <div className="card p-6 sm:p-8 rotate-[-1.5deg] animate-float-y will-change-transform">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted font-semibold">
                      Temporary Tag · NJ
                    </p>
                    <p className="font-display font-extrabold text-3xl text-navy mt-1">K-72 9931</p>
                  </div>
                  <span className="pill">30-day</span>
                </div>
                <div className="relative mt-6 h-32 rounded-lg overflow-hidden text-cream flex items-center justify-center font-display text-3xl tracking-widest font-extrabold shadow-card">
                  <div
                    className="absolute inset-0 -z-10 animate-gradient-drift"
                    style={{
                      backgroundImage:
                        "linear-gradient(120deg,#0F172A 0%,#1E1B4B 35%,#0F172A 70%,#1E293B 100%)",
                      backgroundSize: "300% 100%",
                    }}
                  />
                  <span className="relative drop-shadow">K-72 9931</span>
                  <span
                    className="pointer-events-none absolute inset-0 opacity-50"
                    style={{
                      background:
                        "linear-gradient(110deg, transparent 30%, rgba(212,175,55,.45) 50%, transparent 70%)",
                      backgroundSize: "200% 100%",
                    }}
                  />
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-navy/5 p-3">
                    <p className="text-xs text-muted">Issued</p>
                    <p className="font-semibold text-navy">Today</p>
                  </div>
                  <div className="rounded-lg bg-gold-soft p-3">
                    <p className="text-xs text-muted">Renews</p>
                    <p className="font-semibold text-navy-dark">+{period} days</p>
                  </div>
                </div>
                <div className="mt-5 text-xs text-muted">
                  Sample preview &mdash; actual tag arrives in your inbox.
                </div>
              </div>
              <div className="absolute -bottom-6 -right-4 hidden sm:flex items-center gap-2 card px-4 py-3 text-sm rotate-[3deg] animate-fade-up step-4">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-gold/60 animate-pulse-ring" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-gold" />
                </span>
                <div>
                  <p className="font-semibold text-navy leading-tight">Reminder sent</p>
                  <p className="text-muted text-xs leading-tight">Renewal opt-in active</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features -------------------------------------------------- */}
        <section className="container-x py-12">
          <div className="grid sm:grid-cols-3 gap-4 stagger">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className={`card p-5 hover:border-navy/30 hover:-translate-y-0.5 transition-all duration-200 animate-fade-up step-${i + 1}`}
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-navy/5 text-navy">
                  <f.Icon />
                </span>
                <h3 className="mt-3 font-display text-lg font-bold text-navy">{f.title}</h3>
                <p
                  className="mt-1 text-sm text-muted"
                  dangerouslySetInnerHTML={{ __html: f.body }}
                />
              </div>
            ))}
          </div>
        </section>

        {/* How it works --------------------------------------------- */}
        <section id="how" className="container-x py-12">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-navy">
              Three steps. <span className="text-gold-dark">No mailbox required.</span>
            </h2>
            <p className="mt-3 text-muted">
              We&rsquo;re a pure inbox-delivery service. Everything happens in your browser
              and your inbox.
            </p>
          </div>
          <ol className="grid sm:grid-cols-3 gap-4 stagger">
            {STEPS.map((s, i) => (
              <li key={s.n} className={`card p-6 animate-fade-up step-${i + 1}`}>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gold text-navy-dark font-display font-bold">
                  {s.n}
                </span>
                <h3 className="mt-3 font-display text-lg font-bold text-navy">{s.title}</h3>
                <p
                  className="mt-1 text-sm text-muted"
                  dangerouslySetInnerHTML={{ __html: s.body }}
                />
              </li>
            ))}
          </ol>
        </section>

        {/* Renewal callout ------------------------------------------ */}
        <section className="container-x py-12">
          <div className="relative overflow-hidden rounded-xl2 border border-navy/15 bg-navy text-cream p-8 sm:p-12">
            <div
              className="absolute inset-0 -z-10 opacity-70"
              style={{
                backgroundImage:
                  "radial-gradient(700px 320px at 100% 0%, rgba(212,175,55,0.35), transparent 60%), radial-gradient(540px 320px at 0% 100%, rgba(30,27,75,0.7), transparent 60%)",
              }}
              aria-hidden="true"
            />
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <span className="pill">Auto-renewal · 28 days</span>
                <h2 className="mt-3 font-display text-3xl font-extrabold">
                  Renew without lifting a finger.
                </h2>
                <p className="mt-2 text-cream/80">
                  Your account opens automatically after payment. Toggle auto-renewal on
                  and you&rsquo;ll get a friendly reminder every {period} days &mdash; renew at
                  the same flat price with one tap.
                </p>
                <div className="mt-5 flex gap-3 flex-wrap">
                  <Link to="/checkout" className="btn-gold h-11 px-5">
                    Start now
                  </Link>
                  <Link
                    to="/login"
                    className="btn h-11 px-5 bg-white/10 hover:bg-white/15 text-cream"
                  >
                    I have an account
                  </Link>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { k: "Same price every cycle", v: price != null ? formatMoney(price) : "—" },
                  { k: "Reminder cadence", v: `${period} days` },
                  { k: "Cancel anytime", v: "1 click" },
                  { k: "Delivery", v: "Inbox" },
                ].map((s) => (
                  <div
                    key={s.k}
                    className="rounded-lg border border-white/10 bg-white/5 backdrop-blur p-4"
                  >
                    <p className="text-xs uppercase tracking-wider text-cream/60">{s.k}</p>
                    <p className="font-display font-bold text-xl mt-1">{s.v}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
