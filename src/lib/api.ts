import { getReferralCode } from "./referral";

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, "")}/api`
  : "/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("admin_token");
  const url = path.startsWith("/") ? `${API_BASE}${path}` : `${API_BASE}/${path}`;
  const isFormData = options.body instanceof FormData;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(!isFormData && { "Content-Type": "application/json" }),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      if (text.trim().startsWith("<!")) {
        throw new Error(res.ok ? "Invalid server response" : "Server unavailable — please retry");
      }
    }
  }
  if (!res.ok) {
    const msg = (typeof data.error === "string" && data.error) || res.statusText;
    if (res.status === 401) throw new Error("Unauthorized");
    throw new Error(msg);
  }
  return data as T;
}

export const api = {
  getServices: () => request<{ id: string; title: string; description: string; price: number; image: string }[]>(
    "/services"
  ),
  getCheckoutConfig: () =>
    request<{
      tagPrice: number;
      plateOnlyPrice: number;
      insuranceOnlyPrice: number;
      plateAndInsurancePrice: number;
      insuranceMonthlyPrice: number;
      insuranceYearlyPrice: number;
      overnightFedexFee: number;
      driverExtendedFee: number;
      driverLocalStates: string[] | string;
      testMode: boolean;
      backgroundMusicEnabled: boolean;
    }>("/checkout/config"),
  getSiteConfig: () =>
    request<{ backgroundMusicEnabled: boolean }>("/site/config"),
  createCheckoutSession: (data: Record<string, unknown>) =>
    request<{ url: string }>("/checkout/create-session", {
      method: "POST",
      body: JSON.stringify({
        ...data,
        referralCode: getReferralCode(),
        successOrigin: typeof window !== "undefined" ? window.location.origin : undefined,
      }),
    }),
  saveCheckoutLead: (data: {
    leadToken?: string;
    deliveryMethod?: string;
    deliveryEmail?: string;
    deliveryAddress?: string;
    deliveryPhone?: string;
    productChoice?: string;
    serviceId?: string;
    serviceTitle?: string;
  }) =>
    request<{ leadToken: string; orderId: string; order: OrderRecord }>(
      "/checkout/lead",
      { method: "POST", body: JSON.stringify({ ...data, referralCode: getReferralCode() }) },
    ),
  checkAffiliate: (slug: string) =>
    request<{ slug: string; exists: boolean; label: string | null }>(
      "/affiliate/" + encodeURIComponent(slug),
    ),
  verifyCheckoutSession: (sessionId: string, isTest?: boolean) =>
    request<OrderRecord>("/checkout/verify?session_id=" + encodeURIComponent(sessionId) + (isTest ? "&test=1" : "")),
  submitTagInfo: (orderId: string, data: Record<string, unknown>) =>
    request<OrderRecord>(`/orders/${encodeURIComponent(orderId)}/tag-info`, { method: "PATCH", body: JSON.stringify(data) }),
  parseTagInfoText: (text: string) =>
    request<{ fields: Partial<TagInfoFields> }>("/checkout/parse-text", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  parseTagInfoDocument: (file: File, orderId?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    if (orderId) fd.append("orderId", orderId);
    return request<{ fields: Partial<TagInfoFields> }>("/checkout/parse-document", {
      method: "POST",
      body: fd,
    });
  },
  decodeVin: (vin: string) =>
    request<{ year: string; make: string; model: string }>("/vin/decode?vin=" + encodeURIComponent(vin)),
  uploadOrderDocuments: (orderId: string, formData: FormData) =>
    request<OrderRecord>(`/orders/${encodeURIComponent(orderId)}/documents`, { method: "POST", body: formData }),
  getOrderTagPdf: (orderId: string) =>
    request<{ pdfBase64: string; plate: string | null; reference: string | null; filename: string; cached: boolean }>(
      `/admin/orders/${encodeURIComponent(orderId)}/tag-pdf`,
    ),
  sendOrderSuccessEmail: (orderId: string) =>
    request<{ sent: boolean }>(`/orders/${encodeURIComponent(orderId)}/send-success-email`, { method: "POST" }),
  login: (password: string) =>
    request<{ token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ password }) }),
  getOrders: () => request<OrderRecord[]>("/admin/orders"),
  getServicesAdmin: () => request<ServiceRecord[]>("/admin/services"),
  addService: (s: { title: string; description: string; price: number; image?: string }) =>
    request<ServiceRecord>("/admin/services", { method: "POST", body: JSON.stringify(s) }),
  deleteService: (id: string) =>
    request<{ ok: boolean }>(`/admin/services/${id}`, { method: "DELETE" }),
  getStats: () =>
    request<AdminStats>("/admin/stats"),
  getPaymentLinks: () =>
    request<{ venmo: string; cashApp: string; paypal: string; zelle: string; applePay: string; display: { venmo: string; cashApp: string; paypal: string; zelle: string; applePay: string } }>("/payment-links"),
  getSecurePhone: (orderId: string) =>
    request<{ iv: string; data: string }>(`/secure/phone/${encodeURIComponent(orderId)}`),
  getSettings: () =>
    request<{
      tagPrice: number;
      plateOnlyPrice: number;
      insuranceOnlyPrice: number;
      plateAndInsurancePrice: number;
      insuranceMonthlyPrice: number;
      insuranceYearlyPrice: number;
      overnightFedexFee: number;
      driverExtendedFee: number;
      driverLocalStates: string[] | string;
      testMode: boolean;
      backgroundMusicEnabled: boolean;
      telegramDispatchers: TelegramDispatcher[];
      fallbackClaimTimeoutMs: number;
      paymentLinks: { venmo: string; cashApp: string; paypal: string; zelle: string; applePay: string };
      paymentDisplay: { venmo: string; cashApp: string; paypal: string; zelle: string; applePay: string };
    }>("/admin/settings"),
  updateSettings: (s: {
    plateOnlyPrice?: number;
    insuranceOnlyPrice?: number;
    plateAndInsurancePrice?: number;
    insuranceMonthlyPrice?: number;
    insuranceYearlyPrice?: number;
    overnightFedexFee?: number;
    driverExtendedFee?: number;
    driverLocalStates?: string[] | string;
    testMode?: boolean;
    backgroundMusicEnabled?: boolean;
    telegramDispatchers?: TelegramDispatcher[];
    fallbackClaimTimeoutMs?: number;
    paymentLinks?: { venmo: string; cashApp: string; paypal: string; zelle: string; applePay: string };
    paymentDisplay?: { venmo: string; cashApp: string; paypal: string; zelle: string; applePay: string };
  }) =>
    request<{ tagPrice: number; insuranceMonthlyPrice: number; insuranceYearlyPrice: number; overnightFedexFee: number; testMode: boolean; telegramDispatchers: TelegramDispatcher[]; fallbackClaimTimeoutMs: number; paymentLinks: { venmo: string; cashApp: string; paypal: string; zelle: string; applePay: string }; paymentDisplay: { venmo: string; cashApp: string; paypal: string; zelle: string; applePay: string } }>("/admin/settings", { method: "PATCH", body: JSON.stringify(s) }),
  getAffiliates: () => request<Affiliate[]>("/admin/affiliates"),
  saveAffiliate: (a: { slug: string; label?: string; telegramId?: string; active?: boolean }) =>
    request<{ ok: boolean; affiliates: Affiliate[] }>("/admin/affiliates", {
      method: "POST",
      body: JSON.stringify(a),
    }),
  deleteAffiliate: (slug: string) =>
    request<{ ok: boolean; affiliates: Affiliate[] }>(`/admin/affiliates/${encodeURIComponent(slug)}`, {
      method: "DELETE",
    }),
  getTelegramWebhook: () =>
    request<{ info: TelegramWebhookInfo; expectedUrl: string }>("/admin/telegram/webhook"),
  setTelegramWebhook: (url?: string) =>
    request<{ ok: boolean; url: string; description?: string }>("/admin/telegram/webhook", {
      method: "POST",
      body: JSON.stringify(url ? { url } : {}),
    }),
  runAbandonedSweep: () =>
    request<{ ok: boolean; sent: number; error?: string }>("/admin/abandoned/run", {
      method: "POST",
    }),
  sendOrderFollowup: (id: string) =>
    request<{ ok: boolean; sent?: number; stage?: number; reason?: string; error?: string }>(
      `/admin/orders/${encodeURIComponent(id)}/send-followup`,
      { method: "POST" },
    ),
};

export interface TagInfoFields {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  address2: string;
  vin: string;
  year: string;
  make: string;
  model: string;
  color: string;
  insuranceCompany: string;
  policyNumber: string;
  notes: string;
}

export interface TelegramDispatcher {
  dispatcherId: string;
  groupId: string;
  groupName: string;
}

export interface Affiliate {
  slug: string;
  label: string;
  telegramId: string;
  active: boolean;
  createdAt: string | null;
}

export interface TelegramWebhookInfo {
  url: string;
  has_custom_certificate?: boolean;
  pending_update_count?: number;
  ip_address?: string;
  last_error_date?: number;
  last_error_message?: string;
  last_synchronization_error_date?: number;
  max_connections?: number;
  allowed_updates?: string[];
}

export interface ServiceRecord {
  id: string;
  title: string;
  description: string;
  price: number;
  image: string;
}

export interface OrderRecord {
  id: string;
  serviceId: string;
  serviceTitle: string;
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  deliveryAddress?: string;
  deliverySameAsRegistration?: boolean;
  deliveryMethod?: string;
  deliveryEmail?: string;
  deliveryPhone?: string;
  deliverySlot?: string;
  deliveryScheduledAt?: string;
  productChoice?: string;
  referralCode?: string | null;
  vin: string;
  carMakeModel: string;
  color: string;
  year?: string;
  make?: string;
  model?: string;
  vehicleInfo?: string;
  insuranceCompany?: string;
  policyNumber?: string;
  notes?: string;
  docDriversLicense?: string | null;
  docInsuranceCard?: string | null;
  docVinPhoto?: string | null;
  docParsedSource?: string | string[] | null;
  paymentStatus?: string;
  stripeSessionId?: string | null;
  price: number;
  createdAt: string;
  telegramSent?: boolean;
  telegramRecipients?: string[];
  telegramErrors?: { chatId: string; error: string }[];
  telegramAcceptedBy?: string | null;
  telegramAcceptedGroupId?: string | null;
  telegramAcceptedGroupName?: string | null;
  telegramAcceptedAt?: string | null;
  checkoutStatus?: string | null;
  leadStartedAt?: string | null;
  paymentPendingAt?: string | null;
  paidAt?: string | null;
  tagInfoSubmittedAt?: string | null;
  documentsUploadedAt?: string | null;
  lastActivityAt?: string | null;
  leadToken?: string | null;
  disputeRisk?: boolean;
  krableadsReferenceId?: string | null;
  krableadsLeadId?: string | null;
  krableadsIngestedAt?: string | null;
  krableadsIngestError?: string | null;
  supervisorNotifiedAt?: string | null;
  abandonedReminder1SentAt?: string | null;
  abandonedReminder2SentAt?: string | null;
  marketingUnsubscribedAt?: string | null;
}

export interface AdminStats {
  ordersCount: number;
  totalPayments: number;
  dataStored: number;
  dataIn: { type: string; orderId?: string; at: string }[];
  dataOut: { type: string; at: string }[];
  payments: { type: string; amount?: number; at: string }[];
  telegramConfigured: boolean;
  telegramRecipients: string[];
  ordersWithTelegramStatus: {
    id: string;
    serviceTitle: string;
    price: number;
    createdAt: string;
    telegramSent: boolean;
    telegramRecipients: string[];
    telegramErrors: { chatId: string; error: string }[];
  }[];
}
