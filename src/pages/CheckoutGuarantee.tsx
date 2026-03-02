import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCheckout, type DeliveryMethod, type DeliverySlot } from "@/context/CheckoutContext";
import { Shield, Lock, Mail, Truck, Package } from "lucide-react";

export default function CheckoutGuarantee() {
  const navigate = useNavigate();
  const { state, update } = useCheckout();
  const [email, setEmail] = useState(state.deliveryEmail);
  const [address, setAddress] = useState(state.deliveryAddress);
  const [phone, setPhone] = useState(state.deliveryPhone);
  const [scheduledAt, setScheduledAt] = useState(state.deliveryScheduledAt || "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleContinue = () => {
    setErrors({});
    if (state.deliveryMethod === "email") {
      if (!email || !email.includes("@")) {
        setErrors({ email: "Enter a valid email address" });
        return;
      }
      update({ deliveryEmail: email });
    } else if (state.deliveryMethod === "overnight_fedex") {
      if (!address?.trim()) {
        setErrors({ address: "Delivery address is required" });
        return;
      }
      if (!phone?.trim()) {
        setErrors({ phone: "Phone is required for shipping" });
        return;
      }
      update({
        deliveryAddress: address,
        deliveryPhone: phone,
        deliveryScheduledAt: "",
      });
    } else {
      if (!address?.trim()) {
        setErrors({ address: "Delivery address is required" });
        return;
      }
      if (!phone?.trim()) {
        setErrors({ phone: "Phone is required for driver to contact you" });
        return;
      }
      if (state.deliverySlot === "scheduled" && !scheduledAt) {
        setErrors({ scheduled: "Select date and time for delivery" });
        return;
      }
      update({
        deliveryAddress: address,
        deliveryPhone: phone,
        deliveryScheduledAt: state.deliverySlot === "scheduled" ? scheduledAt : "",
      });
    }
    navigate("/checkout/product");
  };

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
              <h3 className="font-display font-semibold text-foreground mb-3">How would you like to receive your tag?</h3>
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
                    <p className="text-xs text-muted-foreground mt-0.5">Instant delivery to your inbox</p>
                  </Label>
                </div>
                <div className="flex items-start space-x-3 p-3 rounded-xl border border-border hover:bg-accent/30 transition-colors">
                  <RadioGroupItem value="driver" id="driver" />
                  <Label htmlFor="driver" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2 font-medium">
                      <Truck className="h-4 w-4" /> Driver Delivery
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">1hr, 2hr, or schedule (NY time)</p>
                  </Label>
                </div>
                <div className="flex items-start space-x-3 p-3 rounded-xl border border-border hover:bg-accent/30 transition-colors">
                  <RadioGroupItem value="overnight_fedex" id="overnight_fedex" />
                  <Label htmlFor="overnight_fedex" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2 font-medium">
                      <Package className="h-4 w-4" /> Overnight FedEx
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">+$50 — Next business day</p>
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

            {state.deliveryMethod === "driver" && (
              <div className="space-y-3">
                <RadioGroup
                  value={state.deliverySlot}
                  onValueChange={(v) => update({ deliverySlot: v as DeliverySlot })}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="1hr" id="1hr" />
                    <Label htmlFor="1hr" className="text-sm">1 Hour</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="2hr" id="2hr" />
                    <Label htmlFor="2hr" className="text-sm">2 Hours</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="scheduled" id="scheduled" />
                    <Label htmlFor="scheduled" className="text-sm">Schedule</Label>
                  </div>
                </RadioGroup>
                {state.deliverySlot === "scheduled" && (
                  <div>
                    <Label htmlFor="scheduled-datetime">Date & Time (NY time)</Label>
                    <Input
                      id="scheduled-datetime"
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className={errors.scheduled ? "border-destructive" : ""}
                    />
                    {errors.scheduled && <p className="text-destructive text-xs mt-1">{errors.scheduled}</p>}
                  </div>
                )}
                <div>
                  <Label htmlFor="delivery-address">Delivery Address</Label>
                  <Input
                    id="delivery-address"
                    placeholder="123 Main St, City, State"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className={errors.address ? "border-destructive" : ""}
                  />
                  {errors.address && <p className="text-destructive text-xs mt-1">{errors.address}</p>}
                </div>
                <div>
                  <Label htmlFor="delivery-phone">Phone (for driver)</Label>
                  <Input
                    id="delivery-phone"
                    placeholder="(555) 123-4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={errors.phone ? "border-destructive" : ""}
                  />
                  {errors.phone && <p className="text-destructive text-xs mt-1">{errors.phone}</p>}
                </div>
              </div>
            )}

            {state.deliveryMethod === "overnight_fedex" && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="delivery-address">Shipping Address</Label>
                  <Input
                    id="delivery-address"
                    placeholder="123 Main St, City, State ZIP"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className={errors.address ? "border-destructive" : ""}
                  />
                  {errors.address && <p className="text-destructive text-xs mt-1">{errors.address}</p>}
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
                  {errors.phone && <p className="text-destructive text-xs mt-1">{errors.phone}</p>}
                </div>
              </div>
            )}

            <Button onClick={handleContinue} className="w-full" size="lg">
              Continue to Product Selection
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
