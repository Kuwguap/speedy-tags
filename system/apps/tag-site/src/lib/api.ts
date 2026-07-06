export interface PublicConfig {
  currencySymbol: string;
  tagPrice: number;
  insuranceOptInPrice: number;
  renewalPeriodDays: number;
}

export interface TagFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  state: string;
  address?: string;
  address2?: string;
  city?: string;
  zip?: string;
  vin?: string;
  year?: string;
  make?: string;
  model?: string;
  color?: string;
  body?: string;
  insuranceOptIn: boolean;
  insuranceCompany?: string;
  insurancePolicy?: string;
  notes?: string;
  deliveryMethod?: "email" | "driver" | "fedex";
  deliveryEmail?: string;
  deliveryAddress?: string;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `Request failed (${res.status})`);
  return data as T;
}

export function getConfig() {
  return req<PublicConfig>("/api/config");
}

export function createCheckoutSession(form: TagFormData) {
  return req<{ url: string; orderId: string }>("/api/checkout/create-session", {
    method: "POST",
    body: JSON.stringify(form),
  });
}

export interface VerifyResult {
  status: "pending" | "paid" | "failed";
  state?: string;
  plate?: string | null;
  email?: string;
  insuranceOptIn?: boolean;
}

export function verifySession(sessionId: string) {
  return req<VerifyResult>(`/api/checkout/verify?session_id=${encodeURIComponent(sessionId)}`);
}
