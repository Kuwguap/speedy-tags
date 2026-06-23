import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { DeliveryNotice } from "../components/DeliveryNotice";
import { api } from "../lib/api";
import { formatMoney } from "../lib/formatMoney";

const FEATURES = [
  {
    title: "Instant inbox delivery",
    body: "Pay once, refresh your email, your tag is right there. No driver, no shipping, no waiting.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="m13 2-3 7h6l-3 13" />
      </svg>
    ),
  },
  {
    title: "30-day NJ validity",
    body: "Stay road-legal for 30 days. The temp tag covers you while you finalize registration.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l2.5 1.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
  {
    title: "Secure Paystack checkout",
    body: "PCI-compliant payments. We never store your card. Receipt in your inbox the second it clears.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      </svg>
    ),
  },
];

const STEPS = [
  { n: "1", title: "Fill the form", body: "Name, email, and any notes — that's it." },
  { n: "2", title: "Pay with Paystack", body: "Use card, bank, or wallet. We support $." },
  { n: "3", title: "Check your inbox", body: "Your tag confirmation lands within minutes." },
];

export default function Landing() {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    api.getConfig().then((c) => setPrice(c.tagPrice)).catch(() => setPrice(150));
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-primary-bg">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            className="absolute inset-0 -z-10 opacity-50"
            style={{
              backgroundImage:
                "radial-gradient(900px 500px at 80% -100px, rgba(59,130,246,0.25), transparent 60%), radial-gradient(700px 400px at 0% 100%, rgba(249,115,22,0.18), transparent 60%)",
            }}
            aria-hidden="true"
          />
          <div className="container-x py-16 sm:py-24 grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <span className="pill">Instant email delivery</span>
              <h1 className="mt-4 font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.05] text-ink">
                NJ temporary tags.{" "}
                <span className="text-primary">Delivered to your inbox.</span>
              </h1>
              <p className="mt-5 text-lg text-muted max-w-xl">
                Pay once, receive your 30-day temp tag by email. No driver. No shipping.
                Just a fast, simple delivery service.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link to="/checkout" className="btn-cta h-12 px-6 text-base shadow-card">
                  Buy now {price != null ? `· ${formatMoney(price)}` : ""}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
                <a href="#how" className="btn-ghost h-12 px-5 text-base">
                  How it works
                </a>
              </div>
              <div className="mt-6">
                <DeliveryNotice />
              </div>
            </div>

            <div className="relative">
              <div className="card p-6 sm:p-8 rotate-[-1.5deg]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted font-semibold">
                      Temporary Tag · NJ
                    </p>
                    <p className="font-display font-extrabold text-3xl text-ink mt-1">T-3X9 442</p>
                  </div>
                  <span className="pill bg-accent/15 text-accent-dark">30-day</span>
                </div>
                <div className="mt-6 h-32 rounded-lg bg-gradient-to-br from-primary to-primary-dark text-white flex items-center justify-center font-display text-3xl tracking-widest font-extrabold shadow-card">
                  T-3X9 442
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-primary-bg p-3">
                    <p className="text-xs text-muted">Issued</p>
                    <p className="font-semibold text-ink">Today</p>
                  </div>
                  <div className="rounded-lg bg-primary-bg p-3">
                    <p className="text-xs text-muted">Expires</p>
                    <p className="font-semibold text-ink">+30 days</p>
                  </div>
                </div>
                <div className="mt-5 text-xs text-muted">
                  Sample preview — actual tag arrives in your email.
                </div>
              </div>
              <div className="absolute -bottom-6 -right-4 hidden sm:block card px-4 py-3 text-sm rotate-[3deg]">
                <p className="font-semibold text-ink">Receipt sent</p>
                <p className="text-muted text-xs">orders@tristatetags · 2 min ago</p>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="container-x py-12">
          <div className="grid sm:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="card p-5 hover:border-primary/40 transition-colors">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {f.icon}
                </span>
                <h3 className="mt-3 font-display text-lg font-bold text-ink">{f.title}</h3>
                <p className="mt-1 text-sm text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="container-x py-12">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-ink">
              Three steps. <span className="text-primary">No mailbox required.</span>
            </h2>
            <p className="mt-3 text-muted">
              We are a pure email-delivery service. Everything happens in your browser and
              your inbox.
            </p>
          </div>
          <ol className="grid sm:grid-cols-3 gap-4">
            {STEPS.map((s) => (
              <li key={s.n} className="card p-6">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white font-display font-bold">
                  {s.n}
                </span>
                <h3 className="mt-3 font-display text-lg font-bold text-ink">{s.title}</h3>
                <p className="mt-1 text-sm text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Pricing / CTA */}
        <section className="container-x py-12">
          <div className="card p-8 sm:p-10 grid md:grid-cols-[1fr,auto] gap-6 items-center bg-gradient-to-br from-white to-primary-bg">
            <div>
              <span className="pill">Single tier · all included</span>
              <h2 className="mt-3 font-display text-3xl font-extrabold text-ink">
                One flat price. Email delivery included.
              </h2>
              <p className="mt-2 text-muted">
                Tag + 30-day validity + email receipt. No physical shipping at any tier.
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-5xl font-extrabold text-primary">
                {price != null ? formatMoney(price) : "—"}
              </p>
              <Link to="/checkout" className="btn-cta mt-3 h-12 px-6 text-base shadow-card">
                Buy now
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
