import { useState } from "react";
import { Header } from "@/components/Header";
import { api } from "@/lib/api";
import { useSeo } from "@/hooks/useSeo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, FileText, Sparkles, Lock } from "lucide-react";

type Fields = {
  firstName: string;
  lastName: string;
  phone: string;
  vin: string;
  year: string;
  make: string;
  model: string;
  color: string;
  body: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  insuranceCompany: string;
  policyNumber: string;
};

const EMPTY: Fields = {
  firstName: "", lastName: "", phone: "", vin: "", year: "", make: "", model: "",
  color: "", body: "", address: "", city: "", state: "", zip: "",
  insuranceCompany: "", policyNumber: "",
};

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];

const TAG_PRICE = "$1";

export default function Tag() {
  useSeo({ title: "Generate Tag | TriStateTags", noindex: true });
  const { toast } = useToast();
  const [form, setForm] = useState<Fields>(EMPTY);
  const [paste, setPaste] = useState("");
  const [parsing, setParsing] = useState(false);
  const [vinChecking, setVinChecking] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // AI-parse a jumbled/freeform block into the structured fields (same parser the
  // post-checkout tag-info step uses), so shoppers can paste anything they have.
  async function parsePaste() {
    const text = paste.trim();
    if (!text) {
      toast({ title: "Paste your details first", variant: "destructive" });
      return;
    }
    setParsing(true);
    try {
      const { fields } = await api.parseTagInfoText(text);
      setForm((f) => ({
        ...f,
        firstName: fields.firstName || f.firstName,
        lastName: fields.lastName || f.lastName,
        phone: fields.phone || f.phone,
        vin: fields.vin || f.vin,
        year: fields.year || f.year,
        make: fields.make || f.make,
        model: fields.model || f.model,
        color: fields.color || f.color,
        address: [fields.address, fields.address2].filter(Boolean).join(", ") || f.address,
        insuranceCompany: fields.insuranceCompany || f.insuranceCompany,
        policyNumber: fields.policyNumber || f.policyNumber,
      }));
      toast({ title: "Details parsed", description: "Review the fields below, then continue to payment." });
    } catch (e) {
      toast({ title: "Could not parse", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setParsing(false);
    }
  }

  async function decodeVin() {
    const vin = form.vin.trim();
    if (vin.length < 11) {
      toast({ title: "Enter a VIN first", variant: "destructive" });
      return;
    }
    setVinChecking(true);
    try {
      const r = await api.decodeVin(vin);
      setForm((f) => ({ ...f, year: r.year || f.year, make: r.make || f.make, model: r.model || f.model }));
      toast({ title: "VIN decoded" });
    } catch {
      toast({ title: "Could not decode VIN", variant: "destructive" });
    } finally {
      setVinChecking(false);
    }
  }

  async function payAndGenerate() {
    if (!form.phone.trim()) {
      toast({ title: "Phone number is required", description: "Enter a phone number before continuing.", variant: "destructive" });
      return;
    }
    if (!form.firstName.trim() && !form.vin.trim() && !paste.trim()) {
      toast({ title: "Enter a name or VIN (or paste details)", variant: "destructive" });
      return;
    }
    setRedirecting(true);
    try {
      const explicit: Record<string, string> = {
        first: form.firstName, last: form.lastName, phone: form.phone,
        vin: form.vin, year: form.year, make: form.make, model: form.model,
        color: form.color, body: form.body,
        address: form.address, city: form.city, state: form.state, zip: form.zip,
        insurance_company: form.insuranceCompany, policy: form.policyNumber,
      };
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(explicit)) if (v && v.trim()) payload[k] = v.trim();
      // Send the raw paste too so the tag service's parser can fill any gaps
      // (city/state/zip split, VIN decode, body style); explicit fields still win.
      if (paste.trim()) payload.message = paste;
      const { url } = await api.createTagCheckoutSession(payload);
      if (url) window.location.href = url;
      else throw new Error("No checkout URL returned");
    } catch (e) {
      toast({ title: "Could not start checkout", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
      setRedirecting(false);
    }
  }

  const field = (k: keyof Fields, label: string, ph = "") => (
    <div className="space-y-1">
      <Label htmlFor={k}>{label}</Label>
      <Input id={k} value={form[k]} onChange={set(k)} placeholder={ph} />
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> NJ 30-Day Temp Tag Generator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-1">
              <Label htmlFor="paste">Paste your details (any format)</Label>
              <textarea
                id="paste"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={5}
                placeholder={"Josue Pavon 347-479-4095\n5N1AL0MM8DC337962 2013 White Infiniti JX35\n2815 Dewey Ave, Bronx, NY 10465\nProgressive Policy 9896095819"}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Paste it jumbled — our AI sorts it into the fields below. You can edit anything after.
                </p>
                <Button type="button" variant="secondary" size="sm" onClick={parsePaste} disabled={parsing}>
                  {parsing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Parsing…</> : <><Sparkles className="mr-2 h-4 w-4" /> Auto-fill with AI</>}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {field("firstName", "First name", "Josue")}
              {field("lastName", "Last name", "Pavon")}
              <div className="space-y-1">
                <Label htmlFor="phone">Phone number <span className="text-destructive">*</span></Label>
                <Input id="phone" type="tel" value={form.phone} onChange={set("phone")} placeholder="(347) 479-4095" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vin">VIN</Label>
                <div className="flex gap-2">
                  <Input id="vin" value={form.vin} onChange={set("vin")} placeholder="5N1AL0MM8DC337962" />
                  <Button type="button" variant="secondary" onClick={decodeVin} disabled={vinChecking}>
                    {vinChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              {field("year", "Year", "2013")}
              {field("make", "Make", "Infiniti")}
              {field("model", "Model", "JX35")}
              {field("color", "Color", "White")}
              {field("body", "Body style", "SUV")}
              {field("address", "Address", "2815 Dewey Ave")}
              {field("city", "City", "Bronx")}
              <div className="space-y-1">
                <Label htmlFor="state">Registration state</Label>
                <select
                  id="state"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.state}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                >
                  <option value="">Select…</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              {field("zip", "Zip", "10465")}
              {field("insuranceCompany", "Insurance company", "Progressive")}
              {field("policyNumber", "Policy / binder #", "9896095819")}
            </div>

            <p className="text-xs text-muted-foreground">
              NJ registration state prints a Resident tag; any other state prints Non-Resident.
              Plate, control number, and the 30-day expiration are assigned automatically.
            </p>

            <Button onClick={payAndGenerate} disabled={redirecting} className="w-full">
              {redirecting
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecting to secure checkout…</>
                : <><Lock className="mr-2 h-4 w-4" /> Pay {TAG_PRICE} &amp; Generate Tag</>}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Secure payment via Stripe. Your tag PDF is generated and shown right after payment.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
