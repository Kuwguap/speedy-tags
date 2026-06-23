import { useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { api } from "../lib/api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      setError("Please enter a valid email.");
      return;
    }
    setError(null);
    setSending(true);
    try {
      await api.requestMagicLink(email.trim());
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-cream relative">
      <Header />
      <main className="flex-1 relative">
        <div className="mesh-bg absolute inset-0 -z-10 opacity-50" aria-hidden="true" />
        <div className="container-x py-14 sm:py-20">
          <div className="max-w-sm mx-auto card p-7 animate-fade-up">
            {sent ? (
              <div className="text-center">
                <div className="relative inline-flex h-16 w-16 items-center justify-center mx-auto">
                  <span className="absolute inset-0 rounded-full bg-gold/40 animate-pulse-ring" aria-hidden="true" />
                  <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-navy text-gold">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="m3 7 9 6 9-6" />
                    </svg>
                  </span>
                </div>
                <h1 className="mt-4 font-display text-2xl font-extrabold text-navy">Check your inbox</h1>
                <p className="mt-2 text-sm text-muted">
                  If an account exists for <strong className="text-ink">{email}</strong>, we just
                  sent you a sign-in link. It expires in 24 hours.
                </p>
                <Link to="/" className="btn-ghost mt-6 inline-flex">
                  Back to home
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" aria-labelledby="login-title">
                <h1 id="login-title" className="font-display text-2xl font-extrabold text-navy">
                  Sign in
                </h1>
                <p className="text-sm text-muted">
                  Enter your email and we&rsquo;ll send you a one-tap sign-in link &mdash; no password
                  required.
                </p>
                <div>
                  <label htmlFor="login-email" className="label">Email</label>
                  <input
                    id="login-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    className="input"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                {error && (
                  <div
                    role="alert"
                    className="rounded-lg border border-gold/40 bg-gold-soft text-navy-dark px-3 py-2 text-sm"
                  >
                    {error}
                  </div>
                )}
                <button type="submit" className="btn-gold w-full" disabled={sending}>
                  {sending ? "Sending…" : "Send sign-in link"}
                </button>
                <p className="text-xs text-muted text-center">
                  No account yet?{" "}
                  <Link to="/checkout" className="text-navy font-semibold hover:text-gold-dark">
                    Start with a tag
                  </Link>
                </p>
              </form>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
