import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, AlertCircle, CheckCircle2, ExternalLink, Loader2, Upload } from "lucide-react";
import { InterviewLayout, InterviewPillButton } from "@/components/interview/InterviewLayout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useSeo } from "@/hooks/useSeo";
import {
  createOrResumeDraft,
  patchDraft,
  resolveTelegramUsername,
  uploadLicense,
  submitDraft,
  INTERVIEW_FIELDS,
  type InterviewPayload,
} from "@/lib/interviewApi";
import { useToast } from "@/hooks/use-toast";

const emptyPayload = (): InterviewPayload =>
  Object.fromEntries(INTERVIEW_FIELDS.map((f) => [f.key, ""]));

export default function InterviewApply() {
  const { toast } = useToast();
  const [draftId, setDraftId] = useState<string | null>(null);
  const [payload, setPayload] = useState<InterviewPayload>(emptyPayload);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [licenseUrl, setLicenseUrl] = useState<string | null>(null);
  const [tgVerifyStatus, setTgVerifyStatus] = useState<"idle" | "checking" | "ok" | "fail">("idle");
  const [tgVerifyMessage, setTgVerifyMessage] = useState("");
  const [tgBotUsername, setTgBotUsername] = useState("krabinterviewerbot");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tgVerifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useSeo({
    title: "Driver Application — TriStateTags",
    description: "Apply to drive with TriStateTags.",
  });

  useEffect(() => {
    createOrResumeDraft()
      .then((data) => {
        setDraftId(data.draftId);
        if (data.alreadySubmitted) {
          setSubmitted(true);
          return;
        }
        const loaded = { ...emptyPayload(), ...data.payload };
        setPayload(loaded);
        if (loaded.telegram_id) {
          setTgVerifyStatus("ok");
          setTgVerifyMessage("Telegram ID on file.");
        }
        if (data.driversLicenseFileUrl) setLicenseUrl(data.driversLicenseFileUrl);
        setSaveStatus("Ready");
      })
      .catch((e) => {
        toast({
          title: "Could not connect",
          description: e instanceof Error ? e.message : "Check API proxy to krab-interviewer.",
          variant: "destructive",
        });
      })
      .finally(() => setLoading(false));
  }, [toast]);

  const queueSave = useCallback(
    (next: InterviewPayload) => {
      if (!draftId || submitted) return;
      setSaveStatus("Saving…");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          const res = await patchDraft(draftId, next);
          setPayload(res.payload);
          setSaveStatus(`Saved ${new Date().toLocaleTimeString()}`);
        } catch {
          setSaveStatus("Save failed");
        }
      }, 800);
    },
    [draftId, submitted],
  );

  const verifyTelegram = useCallback(
    async (username: string, draftIdForSave: string | null): Promise<boolean> => {
      const un = username.trim();
      if (!un || un.length < 3) {
        setTgVerifyStatus("idle");
        setTgVerifyMessage("");
        return false;
      }
      setTgVerifyStatus("checking");
      setTgVerifyMessage("");
      try {
        const res = await resolveTelegramUsername(un);
        if (res.botUsername) setTgBotUsername(res.botUsername);
        if (res.ok && res.telegramId) {
          let nextPayload: InterviewPayload = {};
          setPayload((prev) => {
            nextPayload = {
              ...prev,
              telegram_username: res.telegramUsername || un,
              telegram_id: res.telegramId!,
            };
            return nextPayload;
          });
          setTgVerifyStatus("ok");
          setTgVerifyMessage(res.message || "Telegram ID verified.");
          if (draftIdForSave) {
            const patched = await patchDraft(draftIdForSave, nextPayload);
            setPayload(patched.payload);
          }
          return true;
        }
        setTgVerifyStatus("fail");
        setTgVerifyMessage(
          res.message ||
            `Open @${res.botUsername || tgBotUsername} in Telegram, tap Start, then verify again.`,
        );
        return false;
      } catch (e) {
        setTgVerifyStatus("fail");
        setTgVerifyMessage(e instanceof Error ? e.message : "Verification failed");
        return false;
      }
    },
    [tgBotUsername],
  );

  const updateField = (key: string, value: string) => {
    const next = { ...payload, [key]: value };
    if (key === "telegram_username") {
      next.telegram_id = "";
      setTgVerifyStatus("idle");
      setTgVerifyMessage("");
    }
    setPayload(next);
    queueSave(next);
    if (key === "telegram_username") {
      if (tgVerifyTimer.current) clearTimeout(tgVerifyTimer.current);
      tgVerifyTimer.current = setTimeout(() => verifyTelegram(value, draftId), 900);
    }
  };

  const onLicenseChange = async (file: File | undefined) => {
    if (!file || !draftId) return;
    setSaveStatus("Uploading license…");
    try {
      const res = await uploadLicense(draftId, file);
      setLicenseUrl(res.driversLicenseFileUrl);
      setSaveStatus("License uploaded");
    } catch (e) {
      toast({
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftId || submitted) return;
    if (!payload.telegram_id?.trim()) {
      const verified = await verifyTelegram(payload.telegram_username || "", draftId);
      if (!verified) {
        toast({
          title: "Telegram not verified",
          description: `Open @${tgBotUsername} in Telegram, tap Start, then tap Verify.`,
          variant: "destructive",
        });
        return;
      }
    }
    setSubmitting(true);
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const patched = await patchDraft(draftId, payload);
      setPayload(patched.payload);
      await submitDraft(draftId);
      setSubmitted(true);
    } catch (e) {
      toast({
        title: "Submit failed",
        description: e instanceof Error ? e.message : "Please check required fields",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <InterviewLayout>
        <div className="flex flex-col items-center justify-center py-32 gap-4 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
          <p>Loading your application…</p>
        </div>
      </InterviewLayout>
    );
  }

  if (submitted) {
    return (
      <InterviewLayout>
        <div className="mx-auto max-w-lg text-center py-20">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="mt-8 font-display text-3xl font-bold">Thanks — we have your application</h1>
          <p className="mt-4 text-muted-foreground text-lg">
            A supervisor will review it and contact you on Telegram.
          </p>
          <InterviewPillButton to="/" className="mt-10">
            Back to store
          </InterviewPillButton>
        </div>
      </InterviewLayout>
    );
  }

  return (
    <InterviewLayout>
      <div className="mx-auto max-w-2xl">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-violet-600">Step 3</p>
        <h1 className="mt-2 text-center font-display text-4xl font-bold tracking-tight">Application</h1>
        <p className="mt-3 text-center text-muted-foreground">
          Auto-saves as you type ·{" "}
          <Link to="/interview/telegram" className="text-violet-600 hover:underline font-medium">
            Telegram help
          </Link>
        </p>
        {saveStatus && (
          <p className="text-center text-xs text-muted-foreground mt-2">{saveStatus}</p>
        )}

        <form onSubmit={onSubmit} className="mt-10 space-y-6">
          <div className="rounded-3xl border border-black/5 bg-white p-6 md:p-8 shadow-sm">
            <Label className="text-base font-semibold">Driver license photo</Label>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Recommended — clear photo of the front</p>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-violet-200 bg-violet-50/50 px-6 py-10 hover:bg-violet-50 transition-colors">
              <Upload className="h-8 w-8 text-violet-500" />
              <span className="text-sm font-medium">Click to upload image</span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => onLicenseChange(e.target.files?.[0])}
              />
            </label>
            {licenseUrl && (
              <a
                href={licenseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-sm text-violet-600 font-medium hover:underline"
              >
                View uploaded license →
              </a>
            )}
          </div>

          <div className="rounded-3xl border border-black/5 bg-white p-6 md:p-8 shadow-sm space-y-6">
            {INTERVIEW_FIELDS.map((field) => (
              <div
                key={field.key}
                className={field.highlight ? "rounded-2xl border border-violet-200 bg-violet-50/40 p-5 -mx-1" : ""}
              >
                <Label htmlFor={field.key} className="text-sm font-semibold">
                  {field.label}
                  {field.required && <span className="text-destructive ml-0.5">*</span>}
                </Label>
                {field.hint && (
                  <p className="text-xs text-muted-foreground mt-0.5 mb-2">{field.hint}</p>
                )}
                {field.key === "telegram_username" ? (
                  <>
                    <p className="text-xs text-violet-700 mb-2">
                      <Link to="/interview/telegram" className="font-medium hover:underline">
                        How to get Telegram & set @username →
                      </Link>
                    </p>
                    <div className="flex gap-2 mt-1">
                      <Input
                        id={field.key}
                        type="text"
                        placeholder="@yourusername"
                        value={payload[field.key] || ""}
                        onChange={(e) => updateField(field.key, e.target.value)}
                        onBlur={() => verifyTelegram(payload.telegram_username || "", draftId)}
                        className="rounded-xl border-black/10 h-11 flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => verifyTelegram(payload.telegram_username || "", draftId)}
                        disabled={tgVerifyStatus === "checking"}
                        className="shrink-0 rounded-xl border border-violet-200 bg-violet-50 px-4 text-sm font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
                      >
                        {tgVerifyStatus === "checking" ? "…" : "Verify"}
                      </button>
                    </div>
                    {tgVerifyStatus === "ok" && payload.telegram_id && (
                      <div className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
                        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>
                          Telegram ID <strong>{payload.telegram_id}</strong> — {tgVerifyMessage}
                        </span>
                      </div>
                    )}
                    {tgVerifyStatus === "fail" && (
                      <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{tgVerifyMessage}</span>
                        </div>
                        <a
                          href={`https://t.me/${tgBotUsername}?start=web_apply`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 font-semibold text-violet-700 hover:underline"
                        >
                          Open @{tgBotUsername} in Telegram
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    )}
                  </>
                ) : field.type === "textarea" ? (
                  <Textarea
                    id={field.key}
                    rows={3}
                    value={payload[field.key] || ""}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    className="rounded-xl border-black/10 mt-1"
                  />
                ) : (
                  <Input
                    id={field.key}
                    type={field.type}
                    value={payload[field.key] || ""}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    className="rounded-xl border-black/10 mt-1 h-11"
                  />
                )}
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-foreground py-4 text-base font-semibold text-background hover:bg-foreground/90 disabled:opacity-50 transition-all"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting…
              </>
            ) : (
              <>
                Submit application
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <p className="text-center mt-8">
          <Link to="/interview/requirements" className="text-sm text-muted-foreground hover:text-foreground">
            ← Requirements
          </Link>
        </p>
      </div>
    </InterviewLayout>
  );
}
