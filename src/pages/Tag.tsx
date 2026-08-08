import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { api } from "@/lib/api";
import { useSeo } from "@/hooks/useSeo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, FileText, Download } from "lucide-react";

type Fields = {
  firstName: string;
  lastName: string;
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
  firstName: "", lastName: "", vin: "", year: "", make: "", model: "",
  color: "", body: "", address: "", city: "", state: "", zip: "",
  insuranceCompany: "", policyNumber: "",
};

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];

export default function Tag() {
  useSeo({ title: "Generate Tag | TriStateTags", noindex: true });
  const { toast } = useToast();
  const [form, setForm] = useState<Fields>(EMPTY);
  const [paste, setPaste] = useState("");
  const [vinChecking, setVinChecking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [plate, setPlate] = useState<string | null>(null);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Revoke the last object URL when leaving the page.
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

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

  async function generate() {
    if (!form.firstName.trim() && !form.vin.trim() && !paste.trim()) {
      toast({ title: "Enter a name or VIN (or paste details)", variant: "destructive" });
      return;
    }
    setGenerating(true);
    setPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    try {
      // Send only NON-empty form fields so a pasted block isn't blocked by
      // blank inputs; the server parses `message` and lets explicit fields win.
      const explicit: Record<string, string> = {
        first: form.firstName, last: form.lastName,
        vin: form.vin, year: form.year, make: form.make, model: form.model,
        color: form.color, body: form.body,
        address: form.address, city: form.city, state: form.state, zip: form.zip,
        insurance_company: form.insuranceCompany, policy: form.policyNumber,
      };
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(explicit)) if (v && v.trim()) payload[k] = v.trim();
      if (paste.trim()) payload.message = paste;
      const res = await fetch("/api/tag/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          detail = j?.detail || j?.error || detail;
        } catch { /* ignore */ }
        throw new Error(detail);
      }
      setPlate(res.headers.get("X-Tag-Plate"));
      const blob = await res.blob();
      setPdfUrl(URL.createObjectURL(blob));
      toast({ title: "Tag generated" });
    } catch (e) {
      toast({ title: "Generation failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setGenerating(false);
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
              <Label htmlFor="paste">Paste details (optional)</Label>
              <textarea
                id="paste"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={5}
                placeholder={"Name: Josue Pavon\nVIN: 5N1AL0MM8DC337962\nColor: White\nCity: Bronx  State: NY  Zip: 10465\nInsurance: Progressive\nPolicy: 9896095819"}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Paste labeled lines (same format as the Telegram bot), or fill the form below.
                Anything you type in the form overrides the paste.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {field("firstName", "First name", "Josue")}
              {field("lastName", "Last name", "Pavon")}
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

            <Button onClick={generate} disabled={generating} className="w-full">
              {generating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…</> : "Generate Tag"}
            </Button>

            {pdfUrl && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Plate {plate}</span>
                  <a href={pdfUrl} download={`tag_${plate || "nj"}.pdf`}>
                    <Button type="button" variant="secondary" size="sm">
                      <Download className="mr-2 h-4 w-4" /> Download
                    </Button>
                  </a>
                </div>
                <iframe title="Tag preview" src={pdfUrl} className="h-[520px] w-full rounded-md border" />
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
