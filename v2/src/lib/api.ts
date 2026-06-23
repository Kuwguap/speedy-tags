/** Tiny fetch helper for the v2 API. All endpoints live under /api. */

export interface PublicConfig {
  /** Display currency symbol shown to customers — always "$" per spec. */
  currencySymbol: string;
  /** Default tag price in major units (e.g. 150 for $150). */
  tagPrice: number;
  /** Paystack public key for the inline JS popup. */
  paystackPublicKey: string;
  /** Currency Paystack will charge in (PAYSTACK_CURRENCY). */
  paystackCurrency: string;
}

export interface InitCheckoutBody {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  amount: number;
  notes?: string;
}

export interface InitCheckoutResponse {
  reference: string;
  authorizationUrl: string;
  accessCode: string;
}

export interface OrderRecord {
  id: string;
  reference: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  notes?: string;
  amount: number;
  currency: string;
  paystackCurrency: string;
  status: "pending" | "paid" | "failed";
  fulfilled: boolean;
  paidAt?: string;
  createdAt: string;
  channel?: string;
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.headers) Object.assign(headers, init.headers as Record<string, string>);
  if (token) headers["X-Admin-Password"] = token;
  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-json response */
  }
  if (!res.ok) {
    let err = res.statusText || `HTTP_${res.status}`;
    if (data && typeof data === "object" && "error" in data) {
      const candidate = (data as { error?: unknown }).error;
      if (typeof candidate === "string" && candidate) err = candidate;
    }
    throw new Error(err);
  }
  return data as T;
}

export const api = {
  getConfig: () => request<PublicConfig>("/api/config"),
  initCheckout: (body: InitCheckoutBody) =>
    request<InitCheckoutResponse>("/api/checkout/init", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  verify: (reference: string) =>
    request<OrderRecord>(`/api/checkout/verify?reference=${encodeURIComponent(reference)}`),
  adminLogin: (password: string) =>
    request<{ ok: true }>("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  adminOrders: (password: string) =>
    request<{ orders: OrderRecord[] }>("/api/admin/orders", { method: "GET" }, password),
  adminMarkFulfilled: (id: string, password: string) =>
    request<OrderRecord>(`/api/admin/orders/${id}/fulfill`, { method: "POST" }, password),
};
