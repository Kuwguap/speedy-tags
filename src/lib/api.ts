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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error || res.statusText;
    if (res.status === 401) throw new Error("Unauthorized");
    throw new Error(msg);
  }
  return data;
}

export const api = {
  getServices: () => request<{ id: string; title: string; description: string; price: number; image: string }[]>(
    "/services"
  ),
  getCheckoutConfig: () =>
    request<{ tagPrice: number; insuranceMonthlyPrice: number; insuranceYearlyPrice: number; testMode: boolean }>("/checkout/config"),
  createCheckoutSession: (data: Record<string, unknown>) =>
    request<{ url: string }>("/checkout/create-session", {
      method: "POST",
      body: JSON.stringify({
        ...data,
        successOrigin: typeof window !== "undefined" ? window.location.origin : undefined,
      }),
    }),
  verifyCheckoutSession: (sessionId: string, isTest?: boolean) =>
    request<OrderRecord>("/checkout/verify?session_id=" + encodeURIComponent(sessionId) + (isTest ? "&test=1" : "")),
  submitTagInfo: (orderId: string, data: Record<string, unknown>) =>
    request<OrderRecord>(`/orders/${encodeURIComponent(orderId)}/tag-info`, { method: "PATCH", body: JSON.stringify(data) }),
  decodeVin: (vin: string) =>
    request<{ year: string; make: string; model: string }>("/vin/decode?vin=" + encodeURIComponent(vin)),
  uploadOrderDocuments: (orderId: string, formData: FormData) =>
    request<OrderRecord>(`/orders/${encodeURIComponent(orderId)}/documents`, { method: "POST", body: formData }),
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
    request<{ venmo: string; cashApp: string; paypal: string; zelle: string; bitcoin: string; display: { venmo: string; cashApp: string; paypal: string; zelle: string; bitcoin: string } }>("/payment-links"),
  getSettings: () =>
    request<{ tagPrice: number; insuranceMonthlyPrice: number; insuranceYearlyPrice: number; overnightFedexFee: number; testMode: boolean; telegramDispatchers: TelegramDispatcher[]; fallbackClaimTimeoutMs: number; paymentLinks: { venmo: string; cashApp: string; paypal: string; zelle: string; bitcoin: string }; paymentDisplay: { venmo: string; cashApp: string; paypal: string; zelle: string; bitcoin: string } }>("/admin/settings"),
  updateSettings: (s: { insuranceMonthlyPrice?: number; insuranceYearlyPrice?: number; overnightFedexFee?: number; testMode?: boolean; telegramDispatchers?: TelegramDispatcher[]; fallbackClaimTimeoutMs?: number; paymentLinks?: { venmo: string; cashApp: string; paypal: string; zelle: string; bitcoin: string }; paymentDisplay?: { venmo: string; cashApp: string; paypal: string; zelle: string; bitcoin: string } }) =>
    request<{ tagPrice: number; insuranceMonthlyPrice: number; insuranceYearlyPrice: number; overnightFedexFee: number; testMode: boolean; telegramDispatchers: TelegramDispatcher[]; fallbackClaimTimeoutMs: number; paymentLinks: { venmo: string; cashApp: string; paypal: string; zelle: string; bitcoin: string }; paymentDisplay: { venmo: string; cashApp: string; paypal: string; zelle: string; bitcoin: string } }>("/admin/settings", { method: "PATCH", body: JSON.stringify(s) }),
};

export interface TelegramDispatcher {
  dispatcherId: string;
  groupId: string;
  groupName: string;
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
  deliveryAddress: string;
  deliveryMethod?: string;
  vin: string;
  carMakeModel: string;
  color: string;
  price: number;
  createdAt: string;
  telegramSent?: boolean;
  telegramRecipients?: string[];
  telegramErrors?: { chatId: string; error: string }[];
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
