import { useSearchParams, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

export default function CheckoutDone() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderId = searchParams.get("orderId");
  const isDriver = searchParams.get("driver") === "1";
  const isFedex = searchParams.get("fedex") === "1";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-lg py-24 text-center animate-fade-in">
        <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-success/10 mb-8">
          <CheckCircle2 className="h-12 w-12 text-success" />
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">Order Complete!</h1>
        <p className="text-muted-foreground mb-4 text-lg">
          Your temporary tag will be delivered {isFedex ? "via Overnight FedEx next business day" : "in the time frame you selected"}.
        </p>
        {isDriver && (
          <p className="text-muted-foreground mb-6 text-lg">
            A driver will call you shortly to confirm delivery details.
          </p>
        )}
        <Button onClick={() => navigate("/")} size="lg" className="rounded-xl">
          Back to Home
        </Button>
      </div>
    </div>
  );
}
