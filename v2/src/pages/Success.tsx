import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { DeliveryNotice } from "../components/DeliveryNotice";
import { api, type OrderRecord } from "../lib/api";
import { formatMoney } from "../lib/formatMoney";

export default function Success() {
  const [params] = useSearchParams();
  const reference = params.get("reference");
  const [state, setState] = useState<"loading" | "paid" | "pending" | "error">("loading");
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) {
      setState("error");
      setError("No payment reference found in the URL.");
      return;
    }

    let cancelled = false;
    let attempts = 0;

    async function check() {
      try {
        const o = await api.verify(reference!);
        if (cancelled) return;
        setOrder(o);
        if (o.status === "paid") {
          setState("paid");
        } else if (attempts < 4) {
          // Webhooks can lag a few seconds — retry briefly before giving up.
          attempts += 1;
          setTimeout(check, 1500);
        } else {
          setState("pending");
        }
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message);
        setState("error");
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [reference]);

  return (
    <div className="min-h-screen flex flex-col bg-primary-bg">
      <Header />
      <main className="flex-1 container-x py-14 sm:py-20">
        <div className="max-w-xl mx-auto card p-8 sm:p-10 text-center">
          {state === "loading" && (
            <>
              <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary mx-auto">
                <svg
                  className="h-8 w-8 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                  <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </span>
              <h1 className="mt-4 font-display text-2xl font-extrabold text-ink">
                Confirming your payment…
              </h1>
              <p className="mt-2 text-muted">Hang tight — this usually takes a few seconds.</p>
            </>
          )}

          {state === "paid" && order && (
            <>
              <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary text-white mx-auto">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-8 w-8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5 10 17l9-10" />
                </svg>
              </span>
              <h1 className="mt-4 font-display text-3xl font-extrabold text-ink">
                Payment received!
              </h1>
              <p className="mt-2 text-muted">
                Thanks {order.firstName}! Your <strong className="text-ink">{formatMoney(order.amount)}</strong>{" "}
                payment is confirmed. Your tag will be emailed to{" "}
                <strong className="text-ink">{order.email}</strong> shortly.
              </p>
              <div className="mt-6">
                <DeliveryNotice />
              </div>
              <div className="mt-5 text-left text-xs text-muted">
                <p>
                  Reference: <code className="font-mono">{order.reference}</code>
                </p>
                {order.paidAt && <p>Paid at: {new Date(order.paidAt).toLocaleString()}</p>}
              </div>
              <Link to="/" className="btn-primary mt-6 inline-flex">
                Back to home
              </Link>
            </>
          )}

          {state === "pending" && (
            <>
              <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 text-accent-dark mx-auto">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-8 w-8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </span>
              <h1 className="mt-4 font-display text-2xl font-extrabold text-ink">
                Still confirming…
              </h1>
              <p className="mt-2 text-muted">
                Paystack hasn't finalized this transaction yet. If you completed payment,
                you'll receive the email shortly. You can safely close this tab.
              </p>
              {order && (
                <p className="mt-3 text-xs text-muted">
                  Reference: <code className="font-mono">{order.reference}</code>
                </p>
              )}
            </>
          )}

          {state === "error" && (
            <>
              <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 text-accent-dark mx-auto">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-8 w-8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z" />
                </svg>
              </span>
              <h1 className="mt-4 font-display text-2xl font-extrabold text-ink">
                We couldn't verify that payment
              </h1>
              <p className="mt-2 text-muted">{error}</p>
              <Link to="/checkout" className="btn-cta mt-6 inline-flex">
                Try again
              </Link>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
