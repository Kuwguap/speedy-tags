/**
 * Magic renewal link landing. The token in the URL is consumed for a session,
 * then we immediately push the user to /account where the renewal button is.
 * Tiny wrapper page so the user just sees a smooth handoff.
 */
import { useEffect, useState } from "react";
import { Navigate, Link, useSearchParams } from "react-router-dom";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { api } from "../lib/api";
import { setSession } from "../lib/auth";

export default function Renew() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("This renewal link is missing its token.");
      setState("error");
      return;
    }
    (async () => {
      try {
        const r = await api.consumeToken(token);
        setSession(r.sessionToken);
        setState("ready");
      } catch (e) {
        setError((e as Error).message);
        setState("error");
      }
    })();
  }, [token]);

  if (state === "ready") return <Navigate to="/account" replace />;

  return (
    <div className="min-h-screen flex flex-col bg-cream">
      <Header />
      <main className="flex-1 container-x py-14 sm:py-20">
        <div className="max-w-md mx-auto card p-8 text-center animate-fade-up">
          {state === "loading" ? (
            <>
              <div className="relative inline-flex h-16 w-16 items-center justify-center mx-auto">
                <span className="absolute inset-0 rounded-full bg-gold/40 animate-pulse-ring" aria-hidden="true" />
                <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-navy text-gold">
                  <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
                    <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                </span>
              </div>
              <h1 className="mt-4 font-display text-2xl font-extrabold text-navy">
                Opening your renewal…
              </h1>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl font-extrabold text-navy">
                This link is no longer valid
              </h1>
              <p className="mt-2 text-sm text-muted">{error}</p>
              <Link to="/login" className="btn-gold mt-6 inline-flex">
                Sign in instead
              </Link>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
