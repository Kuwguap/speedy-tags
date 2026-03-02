import { useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { FileImage, Upload, Loader2 } from "lucide-react";

export default function CheckoutDocuments() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const orderId = searchParams.get("orderId");
  const isDriver = searchParams.get("driver") === "1";
  const isFedex = searchParams.get("fedex") === "1";

  const [driversLicense, setDriversLicense] = useState<File | null>(null);
  const [insuranceCard, setInsuranceCard] = useState<File | null>(null);
  const [vinPhoto, setVinPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const driversLicenseRef = useRef<HTMLInputElement>(null);
  const insuranceCardRef = useRef<HTMLInputElement>(null);
  const vinPhotoRef = useRef<HTMLInputElement>(null);

  const handleSkip = () => {
    navigate(`/checkout/done?orderId=${orderId}${isDriver ? "&driver=1" : ""}${isFedex ? "&fedex=1" : ""}`);
  };

  const handleSubmit = async () => {
    if (!orderId) return;
    if (!driversLicense && !insuranceCard && !vinPhoto) {
      handleSkip();
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      if (driversLicense) formData.append("driversLicense", driversLicense);
      if (insuranceCard) formData.append("insuranceCard", insuranceCard);
      if (vinPhoto) formData.append("vinPhoto", vinPhoto);
      await api.uploadOrderDocuments(orderId, formData);
      navigate(`/checkout/done?orderId=${orderId}${isDriver ? "&driver=1" : ""}${isFedex ? "&fedex=1" : ""}`);
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!orderId) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container max-w-lg py-24 text-center">
          <p className="text-destructive mb-4">Invalid order.</p>
          <Button onClick={() => navigate("/")}>Back to Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-xl py-12">
        <Card className="shadow-card border-border/50 rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-accent/40">
            <CardTitle className="font-display">Upload Documents</CardTitle>
            <p className="text-sm text-muted-foreground">All optional — drivers license, insurance card, VIN photo (door/window)</p>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-4">
              <div>
                <Label>Drivers License</Label>
                <input
                  ref={driversLicenseRef}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => setDriversLicense(e.target.files?.[0] ?? null)}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => driversLicenseRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {driversLicense ? driversLicense.name : "Choose file"}
                </Button>
              </div>
              <div>
                <Label>Insurance Card</Label>
                <input
                  ref={insuranceCardRef}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => setInsuranceCard(e.target.files?.[0] ?? null)}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => insuranceCardRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {insuranceCard ? insuranceCard.name : "Choose file"}
                </Button>
              </div>
              <div>
                <Label>VIN Photo (door or window)</Label>
                <input
                  ref={vinPhotoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setVinPhoto(e.target.files?.[0] ?? null)}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => vinPhotoRef.current?.click()}
                >
                  <FileImage className="h-4 w-4 mr-2" />
                  {vinPhoto ? vinPhoto.name : "Choose file"}
                </Button>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={handleSkip}>
                Skip
              </Button>
              <Button className="flex-1" onClick={handleSubmit} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {submitting ? " Uploading..." : "Upload & Continue"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
