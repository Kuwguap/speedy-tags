import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { api } from "@/lib/api";
import type { ServiceRecord } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";

const schema = z.object({
  firstName: z.string().trim().min(1, "Required").max(50),
  lastName: z.string().trim().min(1, "Required").max(50),
  phone: z.string().trim().min(7, "Invalid phone").max(20),
  address: z.string().trim().min(1, "Required").max(200),
  deliveryAddress: z.string().trim().min(1, "Required").max(200),
  vin: z.string().trim().min(11, "VIN must be at least 11 characters").max(17),
  carMakeModel: z.string().trim().min(1, "Required").max(100),
  color: z.string().trim().min(1, "Required").max(30),
});

type FormData = z.infer<typeof schema>;

export default function Checkout() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [service, setService] = useState<ServiceRecord | null>(null);
  const [form, setForm] = useState<FormData>({
    firstName: "", lastName: "", phone: "", address: "",
    deliveryAddress: "", vin: "", carMakeModel: "", color: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getServices().then((services) => {
      if (cancelled) return;
      const s = services.find((svc) => svc.id === serviceId);
      if (!s) navigate("/");
      else setService(s);
    }).catch(() => {
      if (!cancelled) navigate("/");
    });
    return () => { cancelled = true; };
  }, [serviceId, navigate]);

  const update = (field: keyof FormData, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = schema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof FormData, string>> = {};
      result.error.issues.forEach((i) => { fieldErrors[i.path[0] as keyof FormData] = i.message; });
      setErrors(fieldErrors);
      return;
    }
    if (!service) return;
    const data = result.data;
    setSubmitting(true);
    try {
      const { url } = await api.createCheckoutSession({
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        address: data.address,
        deliveryAddress: data.deliveryAddress,
        vin: data.vin,
        carMakeModel: data.carMakeModel,
        color: data.color,
        serviceId: service.id,
        serviceTitle: service.title,
        price: service.price,
      });
      if (url) window.location.href = url;
      else throw new Error("No checkout URL received");
    } catch (err) {
      toast({
        title: "Checkout failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
      setSubmitting(false);
    }
  };

  if (!service) return null;

  const fields: { key: keyof FormData; label: string; placeholder: string; half?: boolean }[] = [
    { key: "firstName", label: "First Name", placeholder: "John", half: true },
    { key: "lastName", label: "Last Name", placeholder: "Doe", half: true },
    { key: "phone", label: "Phone", placeholder: "(555) 123-4567" },
    { key: "address", label: "Address", placeholder: "123 Main St, City, State" },
    { key: "deliveryAddress", label: "Delivery Address", placeholder: "456 Oak Ave, City, State" },
    { key: "vin", label: "VIN", placeholder: "1HGCM82633A123456" },
    { key: "carMakeModel", label: "Car Make / Model", placeholder: "Honda Accord 2023" },
    { key: "color", label: "Color", placeholder: "Silver" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-2xl py-12">
        <button onClick={() => navigate("/")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors rounded-lg px-2 py-1 -ml-2 hover:bg-accent/50">
          <ArrowLeft className="h-4 w-4" /> Back to services
        </button>

        <Card className="shadow-card border-border/50 rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-accent/40">
            <CardTitle className="font-display flex items-center justify-between">
              <span>{service.title}</span>
              <span className="text-primary">${service.price.toFixed(2)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {fields.map((f) => (
                  <div key={f.key} className={f.half ? "" : "md:col-span-2"}>
                    <Label htmlFor={f.key} className="text-sm font-medium mb-1.5 block">{f.label}</Label>
                    <Input
                      id={f.key}
                      placeholder={f.placeholder}
                      value={form[f.key]}
                      onChange={(e) => update(f.key, e.target.value)}
                      className={errors[f.key] ? "border-destructive" : ""}
                    />
                    {errors[f.key] && <p className="text-destructive text-xs mt-1">{errors[f.key]}</p>}
                  </div>
                ))}
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                {submitting ? "Redirecting to payment..." : `Pay with Card — $${service.price.toFixed(2)}`}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
