import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Lock } from "lucide-react";

export default function CheckoutGuarantee() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-xl py-12">
        <Card className="shadow-card border-border/50 rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-accent/40 text-center pb-8">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mx-auto mb-4">
              <Shield className="h-8 w-8" />
            </div>
            <CardTitle className="font-display text-2xl">Payment First — Tag Guaranteed</CardTitle>
            <p className="text-muted-foreground mt-2">
              Your payment guarantees your temporary tag. You&apos;ll provide tag details immediately after payment.
            </p>
          </CardHeader>
          <CardContent className="p-8">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/50 border border-border/50 mb-8">
              <Lock className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">Your payment is 100% private.</strong> We never sell or share your data.
              </p>
            </div>
            <Button onClick={() => navigate("/checkout/delivery")} className="w-full" size="lg">
              Continue
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
