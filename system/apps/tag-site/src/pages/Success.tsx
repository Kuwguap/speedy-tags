import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { verifySession, type VerifyResult } from "../lib/api";
import TempPlate from "../components/TempPlate";

export default function Success() {
  const sessionId = new URLSearchParams(window.location.search).get("session_id") || "";
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError("Missing checkout session.");
      return;
    }
    let cancelled = false;
    let tries = 0;
    async function poll() {
      try {
        const r = await verifySession(sessionId);
        if (cancelled) return;
        setResult(r);
        if (r.status !== "paid" && tries < 8) {
          tries += 1;
          setTimeout(poll, 1600);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Verification failed.");
      }
    }
    poll();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const paid = result?.status === "paid";

  return (
    <div className="mx-auto max-w-2xl px-5 py-16 text-center">
      {!paid && !error && (
        <div className="animate-riseIn">
          <div className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-2 border-ink/15 border-t-issued" />
          <h1 className="font-display text-2xl font-700 text-ink">Confirming your payment…</h1>
          <p className="mt-2 text-slate">Hang tight — we're issuing your temporary plate.</p>
        </div>
      )}

      {error && (
        <div className="animate-riseIn">
          <h1 className="font-display text-2xl font-700 text-ink">We hit a snag.</h1>
          <p className="mt-2 text-slate">{error}</p>
          <Link to="/checkout" className="btn-primary mt-6">Back to checkout</Link>
        </div>
      )}

      {paid && (
        <div className="animate-riseIn">
          <span className="eyebrow justify-center">
            <span className="h-1.5 w-1.5 rounded-full bg-reg" /> Issued
          </span>
          <h1 className="mt-4 font-display text-4xl font-700 tracking-tight text-ink">
            You're road-legal.
          </h1>
          <p className="mt-3 text-slate">
            Your temporary plate is on its way to{" "}
            <span className="font-600 text-ink">{result?.email}</span>. Print it, place it in
            the rear window, and drive.
          </p>

          <div className="mt-10 flex justify-center">
            <TempPlate
              plate={result?.plate || "H150706"}
              expLabel="30 DAYS"
              vehicle=""
              stamped
              animate
            />
          </div>

          <div className="mt-10 rounded-xl border border-ink/10 bg-white/70 p-5 text-left">
            <h2 className="font-display text-sm font-600 uppercase tracking-wide text-slate">What happens next</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate">
              <li>• Your plate PDF is emailed to you and dispatched to our delivery team.</li>
              <li>• Keep proof of insurance with you while driving.</li>
              <li>• We'll remind you before it expires so you can renew in one tap.</li>
            </ul>
          </div>

          <Link to="/" className="btn-ghost mt-8">Back home</Link>
        </div>
      )}
    </div>
  );
}
