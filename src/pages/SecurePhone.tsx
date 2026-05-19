import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

async function decryptPhone(ivB64: string, dataB64: string, passphrase: string) {
  const enc = new TextEncoder();
  const keyBytes = await crypto.subtle.digest("SHA-256", enc.encode(passphrase));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);

  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const data = Uint8Array.from(atob(dataB64), (c) => c.charCodeAt(0));

  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(plainBuf);
}

export default function SecurePhone() {
  const { orderId } = useParams();
  const [payload, setPayload] = useState<{ iv: string; data: string } | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passInputRef = useRef<HTMLInputElement | null>(null);

  const canUseWebCrypto = useMemo(() => typeof crypto !== "undefined" && !!crypto.subtle, []);

  useEffect(() => {
    if (!orderId) return;
    api
      .getSecurePhone(orderId)
      .then((p) => setPayload({ iv: p.iv, data: p.data }))
      .catch((e) => setError(e instanceof Error ? e.message : "Link is invalid"));
  }, [orderId]);

  // Auto-focus the passphrase field the moment the form appears so dispatchers
  // can start typing immediately. On Android Chrome / desktop this also
  // raises the soft keyboard. iOS Safari intentionally blocks programmatic
  // focus from raising the keyboard without a user gesture — there's no clean
  // workaround for that, so we still call focus() to position the cursor and
  // let the user tap once to reveal the keyboard if needed.
  useEffect(() => {
    if (!payload) return;
    const el = passInputRef.current;
    if (!el) return;
    // Defer to the next frame so the input is laid out before we focus.
    const raf = requestAnimationFrame(() => {
      try {
        el.focus({ preventScroll: true });
        // Move caret to the end (no-op when empty but cheap and correct).
        const len = el.value.length;
        el.setSelectionRange(len, len);
      } catch {
        // Some old browsers throw on setSelectionRange for type=password — ignore.
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [payload]);

  const handleReveal = async () => {
    if (!payload) return;
    setError(null);
    setBusy(true);
    try {
      if (!canUseWebCrypto) throw new Error("Your browser does not support decryption on this page.");
      const p = passphrase.trim();
      if (!p) throw new Error("Enter passphrase.");
      const revealed = await decryptPhone(payload.iv, payload.data, p);
      setPhone(revealed);
    } catch (e) {
      setPhone(null);
      setError(e instanceof Error ? e.message : "Failed to decrypt");
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
    } catch {}
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-lg py-12">
        <Card className="shadow-card border-border/50 rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-accent/40">
            <CardTitle className="font-display">Encrypted Phone</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {!payload ? (
              <p className="text-sm text-muted-foreground">{error ? error : "Loading…"}</p>
            ) : (
              <>
                <div>
                  <Label htmlFor="pass">Passphrase</Label>
                  <Input
                    id="pass"
                    type="password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !busy) {
                        e.preventDefault();
                        void handleReveal();
                      }
                    }}
                    placeholder="Enter passphrase"
                    className="mt-1"
                    ref={passInputRef}
                    autoFocus
                    autoComplete="current-password"
                    inputMode="text"
                    enterKeyHint="go"
                  />
                </div>
                <Button type="button" onClick={handleReveal} disabled={busy}>
                  {busy ? "Decrypting…" : "View phone"}
                </Button>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                {phone ? (
                  <div className="p-4 rounded-xl border border-border bg-muted/30">
                    <p className="font-mono text-base text-foreground break-all">{phone}</p>
                    <Button type="button" variant="outline" className="mt-3" onClick={handleCopy}>
                      Copy
                    </Button>
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  This link can be opened again anytime. The phone is decrypted locally in your browser.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

