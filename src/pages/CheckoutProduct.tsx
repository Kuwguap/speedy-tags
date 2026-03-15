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
import { getServices } from "@/lib/store";
import type { ServiceRecord } from "@/lib/api";
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
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    Promise.all([
      api.getCheckoutConfig(),
      api.getServices().catch(() => getServices() as ServiceRecord[]),
    ])
      .then(([cfg, svc]) => {
        setConfig(cfg);
        setServices(svc);
      })
      .catch(() => setConfig({ tagPrice: 150, insuranceMonthlyPrice: 100, insuranceYearlyPrice: 900, overnightFedexFee: 50 }))
      .finally(() => setLoading(false));
  }, []);

  const showMonthly = (config.insuranceMonthlyPrice ?? 0) > 0;
  const showYearly = (config.insuranceYearlyPrice ?? 0) > 0;
  const tagPrice = state.selectedService ? state.selectedService.price : config.tagPrice;

  const selectService = (s: ServiceRecord) => {
    const price = typeof s.price === "number" ? s.price : parseFloat(String(s.price)) || 0;
    update({ selectedService: { id: s.id, title: s.title, price } });
  };

  useEffect(() => {
    if (loading) return;
    const choice = state.productChoice;
    if (choice === "insurance_monthly" && !showMonthly) update({ productChoice: "tag_only" });
    else if (choice === "insurance_yearly" && !showYearly) update({ productChoice: "tag_only" });
  }, [loading, showMonthly, showYearly, state.productChoice, update]);

  const getTotal = () => {
    let base = tagPrice;
    if (state.productChoice === "insurance_monthly") base += config.insuranceMonthlyPrice;
    else if (state.productChoice === "insurance_yearly") base += config.insuranceYearlyPrice;
    if (state.deliveryMethod === "overnight_fedex") base += (config.overnightFedexFee ?? OVERNIGHT_FEDEX_FEE);
    return base;
  };

  const isCod = state.deliveryMethod === "cash_on_delivery";

  const handlePay = async () => {
    setPaying(true);
    try {
      const payload = {
        deliveryMethod: state.deliveryMethod,
        deliveryEmail: state.deliveryEmail || undefined,
        deliverySlot: state.deliveryMethod === "driver" ? state.deliverySlot : undefined,
        deliveryScheduledAt: state.deliverySlot === "scheduled" ? state.deliveryScheduledAt : undefined,
        deliveryAddress: (state.deliveryMethod === "driver" || state.deliveryMethod === "overnight_fedex") ? state.deliveryAddress : undefined,
        deliveryPhone: (state.deliveryMethod === "driver" || state.deliveryMethod === "overnight_fedex") ? state.deliveryPhone : undefined,
        productChoice: state.productChoice,
        tagPrice,
        serviceId: state.selectedService?.id,
        serviceTitle: state.selectedService?.title,
        insuranceMonthlyPrice: config.insuranceMonthlyPrice,
        insuranceYearlyPrice: config.insuranceYearlyPrice,
        amount: getTotal(),
      };
      if (isCod) {
        const { orderId } = await api.createCodOrder(payload);
        navigate(`/checkout/tag-info?orderId=${encodeURIComponent(orderId)}`);
        return;
      }
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
          onClick={() => navigate("/checkout")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        {/* Service selector - ensures correct price when coming from hero links or different domain */}
        {services.length > 0 && (
          <Card className="shadow-card border-border/50 rounded-2xl overflow-hidden mb-6">
            <CardHeader className="border-b border-border/50 bg-accent/40 py-4">
              <CardTitle className="font-display text-base">Your Service</CardTitle>
              <p className="text-sm text-muted-foreground">
                {state.selectedService
                  ? `${state.selectedService.title} — $${state.selectedService.price.toFixed(2)}`
                  : "Choose a service below to see the correct price"}
              </p>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-2">
                {services.map((s) => {
                  const price = typeof s.price === "number" ? s.price : parseFloat(String(s.price)) || 0;
                  const isSelected = state.selectedService?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectService(s)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border hover:bg-accent/50"
                      }`}
                    >
                      {s.title} — ${price.toFixed(2)}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-card border-border/50 rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-accent/40">
            <CardTitle className="font-display">Choose Your Product</CardTitle>
            <p className="text-sm text-muted-foreground">{showMonthly || showYearly ? "Tag only, or add temporary insurance" : "Temporary tag"}</p>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <RadioGroup
              value={state.productChoice}
              onValueChange={(v) => update({ productChoice: v as ProductChoice })}
              className="space-y-4"
            >
              <Label htmlFor="tag_only" className="flex items-center justify-between p-4 rounded-xl border border-border hover:bg-accent/30 transition-colors cursor-pointer block">
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="tag_only" id="tag_only" />
                  <span className="font-medium">Temporary Tag Only</span>
                </div>
                <span className="font-bold text-primary">${tagPrice.toFixed(0)}</span>
              </Label>
              {showMonthly && (
                <Label htmlFor="insurance_monthly" className="flex items-center justify-between p-4 rounded-xl border border-border hover:bg-accent/30 transition-colors cursor-pointer block">
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="insurance_monthly" id="insurance_monthly" />
                    <span className="font-medium">Tag + Insurance</span>
                  </div>
                  <span className="font-bold text-primary">
                    ${(tagPrice + config.insuranceMonthlyPrice).toFixed(0)}
                  </span>
                </Label>
              )}
              {showYearly && (
                <Label htmlFor="insurance_yearly" className="flex items-center justify-between p-4 rounded-xl border border-border hover:bg-accent/30 transition-colors cursor-pointer block">
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="insurance_yearly" id="insurance_yearly" />
                    <span className="font-medium">Tag + Insurance (Yearly)</span>
                  </div>
                  <span className="font-bold text-primary">
                    ${(tagPrice + config.insuranceYearlyPrice).toFixed(0)} <span className="text-xs font-normal text-muted-foreground">(${config.insuranceYearlyPrice}/yr)</span>
                  </span>
                </Label>
              )}
            </RadioGroup>

            {state.deliveryMethod === "overnight_fedex" && (
              <div className="pt-4 space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Tag</span>
                  <span>${tagPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>FedEx Delivery</span>
                  <span>+${(config.overnightFedexFee ?? 50).toFixed(2)}</span>
                </div>
                {(state.productChoice === "insurance_monthly" && showMonthly) && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Insurance (monthly)</span>
                    <span>+${config.insuranceMonthlyPrice.toFixed(2)}</span>
                  </div>
                )}
                {(state.productChoice === "insurance_yearly" && showYearly) && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Insurance (yearly)</span>
                    <span>+${config.insuranceYearlyPrice.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="pt-4 border-t border-border flex items-center justify-between">
              <span className="font-semibold">Total</span>
              <span className="text-xl font-bold text-primary">${getTotal().toFixed(2)}</span>
            </div>

            <Button onClick={handlePay} className="w-full" size="lg" disabled={paying}>
              {paying ? (isCod ? "Continuing..." : "Redirecting...") : isCod ? "Continue to Details" : "Get My Plate"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
