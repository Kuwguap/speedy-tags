import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useCheckout, type ProductChoice } from "@/context/CheckoutContext";
import {
  DRIVER_EXTENDED_FEE,
  OVERNIGHT_FEDEX_FEE,
  PLATE_AND_INSURANCE_PRICE,
  PLATE_ONLY_PRICE,
  INSURANCE_ONLY_PRICE,
} from "@/lib/constants";
import {
  computeCheckoutTotal,
  isExtendedDriverState,
  parseDriverLocalStates,
  type CheckoutPricingConfig,
} from "@/lib/checkout-pricing";
import { api } from "@/lib/api";
import { ArrowLeft } from "lucide-react";

const defaultPricingConfig = (): CheckoutPricingConfig => ({
  plateOnlyPrice: PLATE_ONLY_PRICE,
  insuranceOnlyPrice: INSURANCE_ONLY_PRICE,
  plateAndInsurancePrice: PLATE_AND_INSURANCE_PRICE,
  overnightFedexFee: OVERNIGHT_FEDEX_FEE,
  driverExtendedFee: DRIVER_EXTENDED_FEE,
  driverLocalStates: ["NJ"],
});

export default function CheckoutProduct() {
  const navigate = useNavigate();
  const { state, update } = useCheckout();
  const [config, setConfig] = useState<CheckoutPricingConfig>(defaultPricingConfig);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    api
      .getCheckoutConfig()
      .then((cfg) => {
        setConfig({
          plateOnlyPrice: cfg.plateOnlyPrice ?? PLATE_ONLY_PRICE,
          insuranceOnlyPrice: cfg.insuranceOnlyPrice ?? INSURANCE_ONLY_PRICE,
          plateAndInsurancePrice: cfg.plateAndInsurancePrice ?? PLATE_AND_INSURANCE_PRICE,
          overnightFedexFee:
            cfg.overnightFedexFee == null || cfg.overnightFedexFee === 50
              ? OVERNIGHT_FEDEX_FEE
              : cfg.overnightFedexFee,
          driverExtendedFee: cfg.driverExtendedFee ?? DRIVER_EXTENDED_FEE,
          driverLocalStates: parseDriverLocalStates(cfg.driverLocalStates),
        });
      })
      .catch(() => setConfig(defaultPricingConfig()))
      .finally(() => setLoading(false));
  }, []);

  const getTotal = () =>
    computeCheckoutTotal(
      state.productChoice,
      state.deliveryMethod,
      state.deliveryAddress,
      config,
    );

  const driverExtended = useMemo(
    () =>
      state.deliveryMethod === "driver" &&
      isExtendedDriverState(state.deliveryAddress, config.driverLocalStates),
    [state.deliveryMethod, state.deliveryAddress, config.driverLocalStates],
  );

  const handlePay = async () => {
    setPaying(true);
    try {
      const payload = {
        deliveryMethod: state.deliveryMethod,
        deliveryEmail: state.deliveryEmail || undefined,
        deliveryAddress:
          state.deliveryMethod === "driver" ||
          state.deliveryMethod === "overnight_fedex" ||
          state.deliveryMethod === "mail"
            ? state.deliveryAddress
            : undefined,
        deliveryPhone:
          state.deliveryMethod === "driver" ||
          state.deliveryMethod === "overnight_fedex" ||
          state.deliveryMethod === "mail"
            ? state.deliveryPhone
            : undefined,
        productChoice: state.productChoice,
        plateOnlyPrice: config.plateOnlyPrice,
        insuranceOnlyPrice: config.insuranceOnlyPrice,
        plateAndInsurancePrice: config.plateAndInsurancePrice,
        overnightFedexFee: config.overnightFedexFee,
        driverExtendedFee: config.driverExtendedFee,
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

  const showFeeBreakdown =
    state.deliveryMethod === "overnight_fedex" || driverExtended;

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

        <Card className="shadow-card border-border/50 rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-accent/40">
            <CardTitle className="font-display">Choose Your Product</CardTitle>
            <p className="text-sm text-muted-foreground">
              Plate only, insurance only, or plate + insurance bundle
            </p>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <RadioGroup
              value={state.productChoice}
              onValueChange={(v) => update({ productChoice: v as ProductChoice })}
              className="space-y-4"
            >
              <Label
                htmlFor="tag_only"
                className="flex items-center justify-between p-4 rounded-xl border border-border hover:bg-accent/30 transition-colors cursor-pointer block"
              >
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="tag_only" id="tag_only" />
                  <span className="font-medium">Plate Only</span>
                </div>
                <span className="font-bold text-primary">
                  ${config.plateOnlyPrice.toFixed(0)}
                </span>
              </Label>
              <Label
                htmlFor="insurance_only"
                className="flex items-center justify-between p-4 rounded-xl border border-border hover:bg-accent/30 transition-colors cursor-pointer block"
              >
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="insurance_only" id="insurance_only" />
                  <span className="font-medium">Insurance Only</span>
                </div>
                <span className="font-bold text-primary">
                  ${config.insuranceOnlyPrice.toFixed(0)}
                </span>
              </Label>
              <Label
                htmlFor="tag_and_insurance"
                className="flex items-center justify-between p-4 rounded-xl border border-border hover:bg-accent/30 transition-colors cursor-pointer block"
              >
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="tag_and_insurance" id="tag_and_insurance" />
                  <span className="font-medium">Plate + Insurance</span>
                </div>
                <span className="font-bold text-primary">
                  ${config.plateAndInsurancePrice.toFixed(0)}
                </span>
              </Label>
            </RadioGroup>

            {showFeeBreakdown && (
              <div className="pt-4 space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Product</span>
                  <span>
                    $
                    {(
                      state.productChoice === "insurance_only"
                        ? config.insuranceOnlyPrice
                        : state.productChoice === "tag_and_insurance"
                          ? config.plateAndInsurancePrice
                          : config.plateOnlyPrice
                    ).toFixed(2)}
                  </span>
                </div>
                {state.deliveryMethod === "overnight_fedex" && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Overnight shipping</span>
                    <span>+${config.overnightFedexFee.toFixed(2)}</span>
                  </div>
                )}
                {driverExtended && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Long-distance driver (out-of-state)</span>
                    <span>+${config.driverExtendedFee.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="pt-4 border-t border-border flex items-center justify-between">
              <span className="font-semibold">Total</span>
              <span className="text-xl font-bold text-primary">${getTotal().toFixed(2)}</span>
            </div>

            <Button onClick={handlePay} className="w-full" size="lg" disabled={paying}>
              {paying ? "Redirecting..." : "Get My Plate"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
