import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { api } from "@/lib/api";
import { useSeo } from "@/hooks/useSeo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FileText, Download, CheckCircle2, AlertTriangle } from "lucide-react";

function base64ToBlob(b64: string, type = "application/pdf"): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

type Phase = "verifying" | "generating" | "ready" | "error";

export default function TagSuccess() {
  useSeo({ title: "Your Tag | TriStateTags", noindex: true });
  const [params] = useSearchParams();
  const sessionId = params.get("session_id") || "";

  const [phase, setPhase] = useState<Phase>("verifying");
  const [message, setMessage] = useState("Confirming your payment…");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [plate, setPlate] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const pdfUrlRef = useRef<string | null>(null);

  useEffect(() => {
    pdfUrlRef.current = pdfUrl;
  }, [pdfUrl]);

  useEffect(() => {
    if (!sessionId) {
      setPhase("error");
      setMessage("Missing checkout session. Please start again from the tag page.");
      return;
    }
    let cancelled = false;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    (async () => {
      // Poll for up to ~2 minutes: payment confirmation + one-time PDF generation.
      for (let attempt = 0; attempt < 40 && !cancelled; attempt++) {
        try {
          const r = await api.getTagPdf(sessionId);
          if (cancelled) return;
          if (r.status === "ready" && r.pdfBase64) {
            const url = URL.createObjectURL(base64ToBlob(r.pdfBase64));
            setPdfUrl(url);
            setPlate(r.plate || null);
            setReference(r.reference || null);
            setPhase("ready");
            return;
          }
          if (r.status === "expired") {
            setPhase("error");
            setMessage("This checkout session expired. If you were charged, contact support with your reference.");
            return;
          }
          setPhase("generating");
          setMessage(r.status === "generating" ? "Payment confirmed — building your tag…" : "Confirming your payment…");
        } catch (e) {
          if (cancelled) return;
          // A hard error from the server (e.g. generation failed after payment).
          setPhase("error");
          setMessage(e instanceof Error ? e.message : "Something went wrong. Contact support with your reference.");
          return;
        }
        await sleep(3000);
      }
      if (!cancelled) {
        setPhase("error");
        setMessage("Still working on it. If you were charged, refresh in a minute or contact support.");
      }
    })();

    return () => {
      cancelled = true;
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    };
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {phase === "ready" ? <CheckCircle2 className="h-5 w-5 text-green-600" />
                : phase === "error" ? <AlertTriangle className="h-5 w-5 text-destructive" />
                : <FileText className="h-5 w-5" />}
              {phase === "ready" ? "Your temp tag is ready" : "Generating your temp tag"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {phase !== "ready" && phase !== "error" && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> {message}
              </div>
            )}

            {phase === "error" && (
              <div className="space-y-3">
                <p className="text-sm text-destructive">{message}</p>
                <Link to="/tag"><Button variant="secondary" size="sm">Back to tag page</Button></Link>
              </div>
            )}

            {phase === "ready" && pdfUrl && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Plate {plate}{reference ? ` · Ref ${reference}` : ""}
                  </span>
                  <a href={pdfUrl} download={`tag_${plate || "nj"}.pdf`}>
                    <Button type="button" variant="secondary" size="sm">
                      <Download className="mr-2 h-4 w-4" /> Download
                    </Button>
                  </a>
                </div>
                <iframe title="Tag preview" src={pdfUrl} className="h-[560px] w-full rounded-md border" />
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
