/** Krab interviewer web form API (proxied at /api/interview on this site). */

export type InterviewPayload = Record<string, string>;

export type DraftResponse = {
  draftId: string;
  payload: InterviewPayload;
  alreadySubmitted: boolean;
  driversLicenseFileUrl?: string | null;
  submittedInterviewId?: string | null;
};

export type ResolveTelegramResponse = {
  ok: boolean;
  telegramId?: string | null;
  telegramUsername?: string | null;
  source?: string;
  message?: string;
  botUsername?: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (data as { detail?: string | { message?: string; fields?: string[] } }).detail;
    const msg =
      typeof detail === "string"
        ? detail
        : (detail as { message?: string })?.message || res.statusText;
    throw new Error(msg || "Request failed");
  }
  return data as T;
}

export async function createOrResumeDraft(): Promise<DraftResponse> {
  const res = await fetch("/api/interview/draft", {
    method: "POST",
    credentials: "include",
  });
  return parseJson(res);
}

export async function patchDraft(draftId: string, payload: InterviewPayload): Promise<{ ok: boolean; payload: InterviewPayload }> {
  const res = await fetch(`/api/interview/draft/${draftId}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload }),
  });
  return parseJson(res);
}

export async function resolveTelegramUsername(username: string): Promise<ResolveTelegramResponse> {
  const res = await fetch("/api/interview/resolve-telegram", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  return parseJson(res);
}

export async function uploadLicense(draftId: string, file: File): Promise<{ ok: boolean; driversLicenseFileUrl: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/interview/draft/${draftId}/license`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  return parseJson(res);
}

export async function submitDraft(draftId: string): Promise<{ ok: boolean; alreadySubmitted: boolean; interviewId?: string }> {
  const res = await fetch(`/api/interview/submit/${draftId}`, {
    method: "POST",
    credentials: "include",
  });
  return parseJson(res);
}

/** Visible form fields (telegram_id is auto-filled, not manual entry). */
export const INTERVIEW_FIELDS = [
  { key: "full_name", label: "Full name", required: true, type: "text" as const },
  { key: "work_commitment", label: "Work commitment", hint: "Hours per week, days available", required: true, type: "text" as const },
  { key: "phone_number", label: "Phone number", required: true, type: "tel" as const },
  { key: "email", label: "Email", required: true, type: "email" as const },
  { key: "mailing_address", label: "Mailing address", required: true, type: "textarea" as const },
  { key: "drivers_license_id", label: "Driver license number", required: true, type: "text" as const },
  { key: "telegram_username", label: "Telegram username", required: true, highlight: true, type: "text" as const },
  { key: "emergency_contact", label: "Emergency contact", hint: "Name and phone", required: true, type: "text" as const },
  { key: "referral", label: "Referral", hint: "Who referred you, or —", required: false, type: "text" as const },
  { key: "payment_method", label: "Payment method", hint: "CashApp, Venmo, Zelle, etc.", required: true, type: "text" as const },
  { key: "profession_skill", label: "Profession & skills", required: true, type: "text" as const },
];
