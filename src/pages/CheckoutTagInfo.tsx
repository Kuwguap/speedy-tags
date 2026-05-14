import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { api, type TagInfoFields } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2, Sparkles, Upload, FileText } from "lucide-react";
import { z } from "zod";

const schema = z.object({
  firstName: z.string().trim().min(1, "Required").max(50),
  lastName: z.string().trim().min(1, "Required").max(50),
  phone: z.string().trim().min(7, "Required").max(20),
  address: z.string().trim().min(1, "Required").max(200),
  address2: z.string().trim().max(200).optional(),
  vin: z.string().trim().min(11, "VIN must be 11-17 characters").max(17),
  year: z.string().trim().min(1, "Required").max(10),
  make: z.string().trim().min(1, "Required").max(50),
  model: z.string().trim().min(1, "Required").max(50),
  color: z.string().trim().min(1, "Required").max(30),
  insuranceCompany: z.string().optional(),
  policyNumber: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function CheckoutTagInfo() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const sessionId = searchParams.get("session_id");
  const isTest = searchParams.get("test") === "1";
  const [order, setOrder] = useState<{ id: string; productChoice?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [vinChecking, setVinChecking] = useState(false);
  const [form, setForm] = useState<FormData>({
    firstName: "",
    lastName: "",
    phone: "",
    address: "",
    address2: "",
    vin: "",
    year: "",
    make: "",
    model: "",
    color: "",
    insuranceCompany: "",
    policyNumber: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [parsing, setParsing] = useState<"text" | "file" | null>(null);
  const [parseText, setParseText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const needsOwnInsurance = order?.productChoice === "tag_only";

  // Only override fields the AI is confident about (non-empty strings).
  const applyParsedFields = (fields: Partial<TagInfoFields>) => {
    const overrideKeys: (keyof FormData)[] = [];
    setForm((f) => {
      const next = { ...f };
      (Object.keys(fields) as (keyof TagInfoFields)[]).forEach((key) => {
        const value = fields[key];
        if (typeof value !== "string") return;
        const trimmed = value.trim();
        if (!trimmed) return;
        // FormData keys are a subset of TagInfoFields keys, so this cast is safe.
        (next as Record<string, string>)[key] = key === "vin" ? trimmed.toUpperCase() : trimmed;
        overrideKeys.push(key as keyof FormData);
      });
      return next;
    });
    if (overrideKeys.length > 0) {
      setErrors((e) => {
        const next = { ...e };
        overrideKeys.forEach((k) => {
          next[k] = undefined;
        });
        return next;
      });
    }
    return overrideKeys.length;
  };

  const handleParseText = async () => {
    const text = parseText.trim();
    if (!text) {
      toast({ title: "Paste some text first", variant: "destructive" });
      return;
    }
    setParsing("text");
    try {
      const { fields } = await api.parseTagInfoText(text);
      applyParsedFields(fields);
      toast({ title: "Done", description: "Review and edit before submitting." });
    } catch (err) {
      toast({
        title: "Parse failed",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setParsing(null);
    }
  };

  const handleParseFile = async (file: File) => {
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isImage && !isPdf) {
      toast({
        title: "Unsupported file",
        description: "Upload an image or a PDF.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 10 MB.", variant: "destructive" });
      return;
    }
    setParsing("file");
    try {
      const { fields } = await api.parseTagInfoDocument(file, order?.id);
      applyParsedFields(fields);
      toast({ title: "Done", description: "Review and edit before submitting." });
    } catch (err) {
      toast({
        title: "Parse failed",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setParsing(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (!sessionId) {
      setError("No session found.");
      setLoading(false);
      return;
    }
    api
      .verifyCheckoutSession(sessionId, isTest)
      .then((data) => setOrder(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Verification failed"))
      .finally(() => setLoading(false));
  }, [sessionId, isTest]);

  const update = (field: keyof FormData, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const handleVinCheck = async () => {
    const vin = form.vin.trim().toUpperCase();
    if (vin.length < 11 || vin.length > 17) {
      toast({ title: "VIN must be 11-17 characters", variant: "destructive" });
      return;
    }
    setVinChecking(true);
    try {
      const { year, make, model } = await api.decodeVin(vin);
      setForm((f) => ({ ...f, year: year || "", make: make || "", model: model || "" }));
      toast({ title: "VIN decoded successfully" });
    } catch (err) {
      toast({
        title: "VIN check failed",
        description: err instanceof Error ? err.message : "Could not decode VIN",
        variant: "destructive",
      });
    } finally {
      setVinChecking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = schema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof FormData, string>> = {};
      result.error.issues.forEach((i) => {
        fieldErrors[i.path[0] as keyof FormData] = i.message;
      });
      setErrors(fieldErrors);
      return;
    }
    if (!order?.id) return;
    setSubmitting(true);
    try {
      const data = result.data;
      const fullAddress = data.address2?.trim() ? `${data.address}, ${data.address2}` : data.address;
      const updated = await api.submitTagInfo(order.id, {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        address: fullAddress,
        vin: data.vin,
        year: data.year,
        make: data.make,
        model: data.model,
        color: data.color,
        vehicleInfo: `${data.year} ${data.make} ${data.model}, ${data.color}`,
        insuranceCompany: needsOwnInsurance ? data.insuranceCompany : undefined,
        policyNumber: needsOwnInsurance ? data.policyNumber : undefined,
        notes: data.notes,
      });
      const isDriver = updated?.deliveryMethod === "driver";
      const isOvernightFedex = updated?.deliveryMethod === "overnight_fedex";
      const isEmail = updated?.deliveryMethod === "email";
      navigate(`/checkout/documents?orderId=${order.id}${isDriver ? "&driver=1" : ""}${isOvernightFedex ? "&fedex=1" : ""}${isEmail ? "&email=1" : ""}`);
    } catch (err) {
      toast({
        title: "Failed to submit",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container max-w-lg py-24 text-center">
          <p className="text-muted-foreground">Verifying your payment...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container max-w-lg py-24 text-center">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={() => navigate("/")}>Back to Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-xl py-12 space-y-6">
        <Card className="shadow-card border-border/50 rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-primary/10">
            <CardTitle className="font-display flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Ai Done-For-You✅ (optional)
            </CardTitle>
            <p className="text-sm text-muted-foreground">
            Upload a Photo of your Driver License, Title, and Insurance Card, or copy/paste inside Textbox, ai will fill out the form for you.
            </p>
          </CardHeader>
          <CardContent className="p-6 space-y-5">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <Upload className="h-4 w-4" /> Upload a document
              </Label>
              <p className="text-xs text-muted-foreground"> </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={parsing !== null}
                >
                  {parsing === "file" ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {parsing === "file" ? "Extracting…" : "Choose file"}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleParseFile(f);
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="parseText" className="flex items-center gap-1.5 text-sm font-medium">
                <FileText className="h-4 w-4" /> Copy/Paste Text in any format
              </Label>
              <p className="text-xs text-muted-foreground">
              </p>
              <Textarea
                id="parseText"
                value={parseText}
                onChange={(e) => setParseText(e.target.value)}
                placeholder={
                  "Example:\nJohn Smith\n(555) 123-4567\n123 Main St Apt 4B, Newark NJ 07103\nVIN 1HGCM82633A123456\n2023 Honda Civic White\nGeico — policy 9876543210"
                }
                rows={5}
                className="font-mono text-xs"
                disabled={parsing !== null}
              />
              <Button
                type="button"
                onClick={handleParseText}
                disabled={parsing !== null || !parseText.trim()}
                className="w-full"
              >
                {parsing === "text" ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {parsing === "text" ? "Parsing…" : "DO IT FOR ME✅"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card border-border/50 rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-accent/40">
            <CardTitle className="font-display">Tag Information</CardTitle>
            <p className="text-sm text-muted-foreground">Complete your order with vehicle and contact details</p>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} className={errors.firstName ? "border-destructive" : ""} />
                  {errors.firstName && <p className="text-destructive text-xs mt-1">{errors.firstName}</p>}
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} className={errors.lastName ? "border-destructive" : ""} />
                  {errors.lastName && <p className="text-destructive text-xs mt-1">{errors.lastName}</p>}
                </div>
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="(555) 123-4567" className={errors.phone ? "border-destructive" : ""} />
                {errors.phone && <p className="text-destructive text-xs mt-1">{errors.phone}</p>}
              </div>
              <div>
                <Label htmlFor="address">Address</Label>
                <p className="text-xs text-muted-foreground mb-1">Start typing to see suggestions, or enter manually</p>
                <AddressAutocomplete
                  id="address"
                  value={form.address}
                  onChange={(v) => update("address", v)}
                  placeholder="123 Main St, City, State ZIP"
                  error={!!errors.address}
                />
                {errors.address && <p className="text-destructive text-xs mt-1">{errors.address}</p>}
              </div>
              <div>
                <Label htmlFor="address2">Address line 2 (apt / suite / floor)</Label>
                <Input
                  id="address2"
                  value={form.address2}
                  onChange={(e) => update("address2", e.target.value)}
                  placeholder="Apt 4B, Building 2"
                />
              </div>

              {/* VIN first - with check button */}
              <div>
                <Label htmlFor="vin">VIN Number</Label>
                <div className="flex gap-2">
                  <Input
                    id="vin"
                    value={form.vin}
                    onChange={(e) => update("vin", e.target.value.toUpperCase())}
                    placeholder="1HGCM82633A123456"
                    className={`flex-1 ${errors.vin ? "border-destructive" : ""}`}
                  />
                  <Button type="button" variant="outline" onClick={handleVinCheck} disabled={vinChecking}>
                    {vinChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    <span className="ml-1.5">{vinChecking ? "Checking..." : "Check"}</span>
                  </Button>
                </div>
                {errors.vin && <p className="text-destructive text-xs mt-1">{errors.vin}</p>}
              </div>

              {/* Year, Make, Model, Color - separate fields */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="year">Year</Label>
                  <Input id="year" value={form.year} onChange={(e) => update("year", e.target.value)} placeholder="2022" className={errors.year ? "border-destructive" : ""} />
                  {errors.year && <p className="text-destructive text-xs mt-1">{errors.year}</p>}
                </div>
                <div>
                  <Label htmlFor="make">Make</Label>
                  <Input id="make" value={form.make} onChange={(e) => update("make", e.target.value)} placeholder="Honda" className={errors.make ? "border-destructive" : ""} />
                  {errors.make && <p className="text-destructive text-xs mt-1">{errors.make}</p>}
                </div>
                <div>
                  <Label htmlFor="model">Model</Label>
                  <Input id="model" value={form.model} onChange={(e) => update("model", e.target.value)} placeholder="Civic" className={errors.model ? "border-destructive" : ""} />
                  {errors.model && <p className="text-destructive text-xs mt-1">{errors.model}</p>}
                </div>
                <div>
                  <Label htmlFor="color">Color</Label>
                  <Input id="color" value={form.color} onChange={(e) => update("color", e.target.value)} placeholder="White" className={errors.color ? "border-destructive" : ""} />
                  {errors.color && <p className="text-destructive text-xs mt-1">{errors.color}</p>}
                </div>
              </div>

              {needsOwnInsurance && (
                <>
                  <div>
                    <Label htmlFor="insuranceCompany">Insurance Company Name</Label>
                    <Input id="insuranceCompany" value={form.insuranceCompany} onChange={(e) => update("insuranceCompany", e.target.value)} placeholder="State Farm" />
                  </div>
                  <div>
                    <Label htmlFor="policyNumber">Policy Number</Label>
                    <Input id="policyNumber" value={form.policyNumber} onChange={(e) => update("policyNumber", e.target.value)} placeholder="123456789" />
                  </div>
                </>
              )}
              <div>
                <Label htmlFor="notes">Extra Notes</Label>
                <Textarea id="notes" value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Optional" rows={3} />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                {submitting ? "Submitting..." : "Continue to Documents"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
