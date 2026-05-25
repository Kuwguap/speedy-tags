import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCheckout, type DeliveryMethod } from "@/context/CheckoutContext";
import {
  DEFAULT_DRIVER_LOCAL_STATES,
  extractStateCode,
  isExtendedDriverState,
  parseDriverLocalStates,
} from "@/lib/checkout-pricing";
import { api } from "@/lib/api";
import { DRIVER_EXTENDED_FEE, OVERNIGHT_FEDEX_FEE } from "@/lib/constants";
import { Shield, Lock, Mail, Truck, Package, Send } from "lucide-react";
import { useSeo } from "@/hooks/useSeo";

export default function CheckoutGuarantee() {
  useSeo({ title: "Checkout | TriStateTags", noindex: true });
  const navigate = useNavigate();
  const { state, update } = useCheckout();
  const [email, setEmail] = useState(state.deliveryEmail);
  const [address, setAddress] = useState(state.deliveryAddress);
  const [address2, setAddress2] = useState("");
  const [phone, setPhone] = useState(state.deliveryPhone);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [driverLocalStates, setDriverLocalStates] = useState<string[]>([
    ...DEFAULT_DRIVER_LOCAL_STATES,
  ]);
  const [driverExtendedFee, setDriverExtendedFee] = useState(DRIVER_EXTENDED_FEE);
  const [overnightFee, setOvernightFee] = useState(OVERNIGHT_FEDEX_FEE);

  useEffect(() => {
    api
      .getCheckoutConfig()
      .then((cfg) => {
        setDriverLocalStates(parseDriverLocalStates(cfg.driverLocalStates));
        if (cfg.driverExtendedFee != null) setDriverExtendedFee(cfg.driverExtendedFee);
        if (cfg.overnightFedexFee != null) {
          setOvernightFee(cfg.overnightFedexFee === 50 ? OVERNIGHT_FEDEX_FEE : cfg.overnightFedexFee);
        }
      })
      .catch(() => {});
  }, []);

  const fullAddressPreview = useMemo(() => {
    const line1 = address?.trim() || "";
    const line2 = address2?.trim() || "";
    if (!line1) return "";
    return line2 ? `${line1}, ${line2}` : line1;
  }, [address, address2]);

  const driverStateCode = useMemo(
    () => extractStateCode(fullAddressPreview),
    [fullAddressPreview],
  );

  const driverExtended = useMemo(
    () =>
      state.deliveryMethod === "driver" &&
      fullAddressPreview.trim() !== "" &&
      isExtendedDriverState(fullAddressPreview, driverLocalStates),
    [state.deliveryMethod, fullAddressPreview, driverLocalStates],
  );

  const needsShippingAddress =
    state.deliveryMethod === "driver" ||
    state.deliveryMethod === "overnight_fedex" ||
    state.deliveryMethod === "mail";

  const handleContinue = () => {
    setErrors({});
    if (state.deliveryMethod === "email") {
      if (!email || !email.includes("@")) {
        setErrors({ email: "Enter a valid email address" });
        return;
      }
      update({ deliveryEmail: email });
    } else if (needsShippingAddress) {
      if (!address?.trim()) {
        setErrors({ address: "Delivery address is required" });
        return;
      }
      if (!phone?.trim()) {
        setErrors({
          phone:
            state.deliveryMethod === "mail"
              ? "Phone is required for shipping"
              : "Phone is required for driver to contact you",
        });
        return;
      }
      const fullAddress = address2?.trim() ? `${address}, ${address2}` : address;
      update({
        deliveryAddress: fullAddress,
        deliveryPhone: phone,
        deliveryScheduledAt: "",
        ...(email?.includes("@") && { deliveryEmail: email }),
      });
    }
    navigate("/checkout/product");
  };

  const continueLabel =
    state.deliveryMethod === "email"
      ? "Email My Tag"
      : state.deliveryMethod === "driver"
        ? "Deliver My Tag"
        : state.deliveryMethod === "mail"
          ? "Ship My Tag (Mail)"
          : "Ship My Tag";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-xl py-12">
        <Card className="shadow-card border-border/50 rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-accent/40 text-center pb-6">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mx-auto mb-3">
              <Shield className="h-7 w-7" />
            </div>
            <CardTitle className="font-display text-xl">Payment First — Tag Guaranteed</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Your payment guarantees your temporary tag. You&apos;ll provide tag details immediately after payment.
            </p>
          </CardHeader>
          <CardContent className="p-6 space-y-5">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50 border border-border/50">
              <Lock className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">Your payment is 100% private.</strong> We never sell or share your data.
              </p>
            </div>

            <div>
              <h3 className="font-display font-semibold text-foreground mb-3">
                How would you like to receive your tag?
              </h3>
              <RadioGroup
                value={state.deliveryMethod}
                onValueChange={(v) => update({ deliveryMethod: v as DeliveryMethod })}
                className="space-y-3"
              >
                <div className="flex items-start space-x-3 p-3 rounded-xl border border-border hover:bg-accent/30 transition-colors">
                  <RadioGroupItem value="email" id="email" />
                  <Label htmlFor="email" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2 font-medium">
                      <Mail className="h-4 w-4" /> Email Delivery
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Instant delivery to your inbox — FREE</p>
                  </Label>
                </div>
                <div className="flex items-start space-x-3 p-3 rounded-xl border border-border hover:bg-accent/30 transition-colors">
                  <RadioGroupItem value="mail" id="mail" />
                  <Label htmlFor="mail" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2 font-medium">
                      <Send className="h-4 w-4" /> Mail (3-day priority)
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">USPS priority shipping — FREE</p>
                  </Label>
                </div>
                <div className="flex items-start space-x-3 p-3 rounded-xl border border-border hover:bg-accent/30 transition-colors">
                  <RadioGroupItem value="driver" id="driver" />
                  <Label htmlFor="driver" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2 font-medium">
                      <Truck className="h-4 w-4" /> Driver Delivery
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Free within 50-mile GWB radius · Outside the radius +${driverExtendedFee}
                    </p>
                  </Label>
                </div>
                <div className="flex items-start space-x-3 p-3 rounded-xl border border-border hover:bg-accent/30 transition-colors">
                  <RadioGroupItem value="overnight_fedex" id="overnight_fedex" />
                  <Label htmlFor="overnight_fedex" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2 font-medium">
                      <Package className="h-4 w-4" /> Overnight Shipping
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">+${overnightFee} — 1-day overnight</p>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {state.deliveryMethod === "email" && (
              <div>
                <Label htmlFor="delivery-email">Email address</Label>
                <Input
                  id="delivery-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={errors.email ? "border-destructive" : ""}
                />
                {errors.email && <p className="text-destructive text-xs mt-1">{errors.email}</p>}
              </div>
            )}

            {needsShippingAddress && (
              <div>
                <Label htmlFor="confirmation-email">Email for order confirmation (optional)</Label>
                <Input
                  id="confirmation-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-0.5">
                  We&apos;ll send order confirmation to this email
                </p>
              </div>
            )}

            {needsShippingAddress && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="delivery-address">
                    {state.deliveryMethod === "overnight_fedex"
                      ? "Shipping Address"
                      : "Delivery Address"}
                  </Label>
                  <p className="text-xs text-muted-foreground mb-1">
                    Start typing to see suggestions, or enter manually
                  </p>
                  <AddressAutocomplete
                    id="delivery-address"
                    value={address}
                    onChange={setAddress}
                    placeholder="123 Main St, City, State ZIP"
                    error={!!errors.address}
                  />
                  {errors.address && (
                    <p className="text-destructive text-xs mt-1">{errors.address}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="delivery-address-2">Address line 2 (apt / suite / floor)</Label>
                  <Input
                    id="delivery-address-2"
                    placeholder="Apt 4B, Building 2"
                    value={address2}
                    onChange={(e) => setAddress2(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="delivery-phone">Phone</Label>
                  <Input
                    id="delivery-phone"
                    placeholder="(555) 123-4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={errors.phone ? "border-destructive" : ""}
                  />
                  {errors.phone && (
                    <p className="text-destructive text-xs mt-1">{errors.phone}</p>
                  )}
                </div>
              </div>
            )}

            {state.deliveryMethod === "driver" && fullAddressPreview.trim() !== "" && (
              <div
                className={`rounded-xl border p-3 text-sm ${
                  driverExtended
                    ? "border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100"
                    : "border-primary/30 bg-primary/5 text-foreground"
                }`}
              >
                {driverExtended ? (
                  <>
                    <p className="font-medium">
                      Out-of-state delivery detected
                      {driverStateCode ? ` (${driverStateCode})` : ""}
                    </p>
                    <p className="text-xs mt-1 opacity-90">
                      Addresses outside {driverLocalStates.join(", ")} add a +$
                      {driverExtendedFee} long-distance / toll surcharge at checkout. Switch to Mail or
                      Overnight if you prefer.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">
                      Local driver delivery — FREE
                      {driverStateCode ? ` (${driverStateCode})` : ""}
                    </p>
                    <p className="text-xs mt-1 text-muted-foreground">
                      Within 50-mile GWB radius: no delivery surcharge.
                    </p>
                  </>
                )}
              </div>
            )}

            <Button onClick={handleContinue} className="w-full" size="lg">
              {continueLabel}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
