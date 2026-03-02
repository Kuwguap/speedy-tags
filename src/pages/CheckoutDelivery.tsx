import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCheckout, type DeliveryMethod, type DeliverySlot } from "@/context/CheckoutContext";
import { Mail, Truck, ArrowLeft, Package } from "lucide-react";

export default function CheckoutDelivery() {
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
        <button
          onClick={() => navigate("/checkout")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <Card className="shadow-card border-border/50 rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-accent/40">
            <CardTitle className="font-display">Delivery Method</CardTitle>
            <p className="text-sm text-muted-foreground">How would you like to receive your temp tag?</p>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <RadioGroup
              value={state.deliveryMethod}
              onValueChange={(v) => update({ deliveryMethod: v as DeliveryMethod })}
              className="space-y-4"
            >
              <div className="flex items-start space-x-3 p-4 rounded-xl border border-border hover:bg-accent/30 transition-colors">
                <RadioGroupItem value="email" id="email" />
                <Label htmlFor="email" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 font-medium">
                    <Mail className="h-5 w-5" /> Email Delivery
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Instant delivery to your inbox</p>
                </Label>
              </div>
              <div className="flex items-start space-x-3 p-4 rounded-xl border border-border hover:bg-accent/30 transition-colors">
                <RadioGroupItem value="driver" id="driver" />
                <Label htmlFor="driver" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 font-medium">
                    <Truck className="h-5 w-5" /> Driver Delivery
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">1hr, 2hr, or schedule a time (NY time)</p>
                </Label>
              </div>
              <div className="flex items-start space-x-3 p-4 rounded-xl border border-border hover:bg-accent/30 transition-colors">
                <RadioGroupItem value="overnight_fedex" id="overnight_fedex" />
                <Label htmlFor="overnight_fedex" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 font-medium">
                    <Package className="h-5 w-5" /> Overnight FedEx
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Additional $50 — Next business day delivery</p>
                </Label>
              </div>
            </RadioGroup>

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
              <div className="space-y-4">
                <RadioGroup
                  value={state.deliverySlot}
                  onValueChange={(v) => update({ deliverySlot: v as DeliverySlot })}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="1hr" id="1hr" />
                    <Label htmlFor="1hr">1 Hour</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="2hr" id="2hr" />
                    <Label htmlFor="2hr">2 Hours</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="scheduled" id="scheduled" />
                    <Label htmlFor="scheduled">Schedule</Label>
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
                  <Label htmlFor="delivery-phone">Phone (for driver to call)</Label>
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
              <div className="space-y-4">
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
