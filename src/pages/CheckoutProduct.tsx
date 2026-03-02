import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useCheckout, type ProductChoice } from "@/context/CheckoutContext";
import { OVERNIGHT_FEDEX_FEE } from "@/lib/constants";
import { api } from "@/lib/api";
import { Check, ArrowLeft } from "lucide-react";

interface CheckoutConfig {
  tagPrice: number;
  insuranceMonthlyPrice: number;
  insuranceYearlyPrice: number;
  overnightFedexFee?: number;
}

export default function CheckoutProduct() {
  const navigate = useNavigate();
  const { state, update } = useCheckout();
  const [config, setConfig] = useState<CheckoutConfig>({
    tagPrice: 150,
    insuranceMonthlyPrice: 100,
    insuranceYearlyPrice: 900,
    overnightFedexFee: 50,
  });
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    api.getCheckoutConfig()
      .then(setConfig)
      .catch(() => setConfig({ tagPrice: 150, insuranceMonthlyPrice: 100, insuranceYearlyPrice: 900, overnightFedexFee: 50 }))
      .finally(() => setLoading(false));
  }, []);

  const getTotal = () => {
    let base = config.tagPrice;
    if (state.productChoice === "insurance_monthly") base += config.insuranceMonthlyPrice;
    else if (state.productChoice === "insurance_yearly") base += config.insuranceYearlyPrice;
    if (state.deliveryMethod === "overnight_fedex") base += (config.overnightFedexFee ?? OVERNIGHT_FEDEX_FEE);
    return base;
  };

  const handlePay = async () => {
    setPaying(true);
    try {
      const payload = {
        deliveryMethod: state.deliveryMethod,
        deliveryEmail: state.deliveryMethod === "email" ? state.deliveryEmail : undefined,
        deliverySlot: state.deliveryMethod === "driver" ? state.deliverySlot : undefined,
        deliveryScheduledAt: state.deliverySlot === "scheduled" ? state.deliveryScheduledAt : undefined,
        deliveryAddress: (state.deliveryMethod === "driver" || state.deliveryMethod === "overnight_fedex") ? state.deliveryAddress : undefined,
        deliveryPhone: (state.deliveryMethod === "driver" || state.deliveryMethod === "overnight_fedex") ? state.deliveryPhone : undefined,
        productChoice: state.productChoice,
        tagPrice: config.tagPrice,
        insuranceMonthlyPrice: config.insuranceMonthlyPrice,
        insuranceYearlyPrice: config.insuranceYearlyPrice,
        amount: getTotal(),
      };
      const { url } = await api.createCheckoutSession(payload);
      if (url) window.location.href = url;
      else throw new Error("No checkout URL");
    } catch (err) {
      setPaying(false);
      throw err;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container max-w-xl py-24 text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-xl py-12">
        <button
          onClick={() => navigate("/checkout/delivery")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <Card className="shadow-card border-border/50 rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-accent/40">
            <CardTitle className="font-display">Choose Your Product</CardTitle>
            <p className="text-sm text-muted-foreground">Tag only, or add temporary insurance</p>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <RadioGroup
              value={state.productChoice}
              onValueChange={(v) => update({ productChoice: v as ProductChoice })}
              className="space-y-4"
            >
              <div className="flex items-center justify-between p-4 rounded-xl border border-border hover:bg-accent/30 transition-colors">
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="tag_only" id="tag_only" />
                  <Label htmlFor="tag_only" className="cursor-pointer font-medium">
                    Temporary Tag Only
                  </Label>
                </div>
                <span className="font-bold text-primary">${config.tagPrice.toFixed(0)}</span>
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl border border-border hover:bg-accent/30 transition-colors">
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="insurance_monthly" id="insurance_monthly" />
                  <Label htmlFor="insurance_monthly" className="cursor-pointer font-medium">
                    Tag + Insurance
                  </Label>
                </div>
                <span className="font-bold text-primary">
                  ${(config.tagPrice + config.insuranceMonthlyPrice).toFixed(0)} <span className="text-xs font-normal text-muted-foreground">(${config.insuranceMonthlyPrice}/mo)</span>
                </span>
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl border border-border hover:bg-accent/30 transition-colors">
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="insurance_yearly" id="insurance_yearly" />
                  <Label htmlFor="insurance_yearly" className="cursor-pointer font-medium">
                    Tag + Insurance (Yearly)
                  </Label>
                </div>
                <span className="font-bold text-primary">
                  ${(config.tagPrice + config.insuranceYearlyPrice).toFixed(0)} <span className="text-xs font-normal text-muted-foreground">(${config.insuranceYearlyPrice}/yr)</span>
                </span>
              </div>
            </RadioGroup>

            <div className="pt-4 border-t border-border flex items-center justify-between">
              <span className="font-semibold">Total</span>
              <span className="text-xl font-bold text-primary">${getTotal().toFixed(2)}</span>
            </div>

            <Button onClick={handlePay} className="w-full" size="lg" disabled={paying}>
              {paying ? "Redirecting to payment..." : `Pay $${getTotal().toFixed(2)}`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
