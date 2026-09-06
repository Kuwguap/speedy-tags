import { Link } from "react-router-dom";
import TempPlate from "../components/TempPlate";

const STEPS = [
  {
    k: "Tell us the vehicle",
    d: "Name, address, VIN, and your state. Two minutes, no account required.",
  },
  {
    k: "Pay securely",
    d: "One flat price through Stripe. Your card never touches our servers.",
  },
  {
    k: "Drive legally",
    d: "Your 30-day temporary plate arrives by email the moment payment clears.",
  },
];

export default function Home() {
  return (
    <div>
      {/* ── Hero: the plate is the thesis ────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-14 md:grid-cols-2 md:py-20">
          <div className="animate-riseIn">
            <span className="eyebrow">
              <span className="h-1.5 w-1.5 rounded-full bg-reg" /> New Jersey · 30-day tag
            </span>
            <h1 className="mt-5 font-display text-5xl font-700 leading-[1.02] tracking-tight text-ink sm:text-6xl">
              Legal to drive
              <br />
              in <span className="text-issued-deep">minutes.</span>
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-slate">
              Just bought a car? Skip the DMV line. Get a valid New Jersey 30-day
              temporary plate emailed to you the instant your payment clears.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/checkout" className="btn-primary">
                Get my tag →
              </Link>
              <a href="#how" className="btn-ghost">
                How it works
              </a>
            </div>
            <p className="mt-5 text-sm text-slate-light">
              Every U.S. state supported · Optional 1-month coverage card
            </p>
          </div>

          <div className="flex justify-center md:justify-end">
            <TempPlate
              plate="H150706"
              ownerName="Your name here"
              vehicle="2019 Ford F-150"
              expLabel="AUG 05"
            />
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section id="how" className="mx-auto max-w-6xl px-5 py-16">
        <div className="mb-10 max-w-lg">
          <span className="eyebrow">The process</span>
          <h2 className="mt-3 font-display text-3xl font-700 tracking-tight text-ink">
            Three steps, one flat price.
          </h2>
        </div>
        <ol className="grid gap-5 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.k} className="card p-6">
              <span className="font-plate text-2xl font-700 text-issued-deep">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 font-display text-lg font-600 text-ink">{s.k}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Trust strip ──────────────────────────────────────────────────── */}
      <section className="bg-ink">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-12 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-2xl font-700 text-plate">Ready when you are.</h2>
            <p className="mt-2 max-w-md text-sm text-plate/70">
              No account, no waiting room. Start now and have your plate before you
              finish your coffee.
            </p>
          </div>
          <Link to="/checkout" className="btn-primary bg-issued !text-ink hover:bg-issued-deep">
            Start my tag →
          </Link>
        </div>
      </section>
    </div>
  );
}
