import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle } from "lucide-react";

export default function CheckoutSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get("session_id");
  const [order, setOrder] = useState<{ serviceTitle?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) {
      setError("No payment session found.");
      setLoading(false);
      return;
    }
    api
      .verifyCheckoutSession(sessionId)
      .then((data) => {
        setOrder(data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Payment verification failed.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container max-w-lg py-24 text-center">
          <div className="animate-pulse space-y-4">
            <div className="h-16 w-16 rounded-full bg-muted mx-auto" />
            <p className="text-muted-foreground">Verifying your payment...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container max-w-lg py-24 text-center animate-fade-in">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-destructive/10 mb-8">
            <XCircle className="h-12 w-12 text-destructive" />
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-4">Verification Failed</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <p className="text-sm text-muted-foreground mb-8">
            If you were charged, please contact us with your payment details and we&apos;ll sort it out.
          </p>
          <Button onClick={() => navigate("/")} size="lg" className="rounded-xl">Back to Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-lg py-24 text-center animate-fade-in">
        <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-success/10 mb-8">
          <CheckCircle2 className="h-12 w-12 text-success" />
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">Payment Successful!</h1>
        <p className="text-muted-foreground mb-4 text-lg">
          Your order for <strong className="text-foreground">{order?.serviceTitle}</strong> has been confirmed.
        </p>
        <p className="text-muted-foreground mb-10 text-lg">
          A driver will call you in the next <strong className="text-foreground">1–5 minutes</strong> to confirm delivery details.
        </p>
        <Button onClick={() => navigate("/")} size="lg" className="rounded-xl">Back to Home</Button>
      </div>
    </div>
  );
}
