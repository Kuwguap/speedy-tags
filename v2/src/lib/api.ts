/** Tiny fetch helper for the Kingsman Tags API. */

import { getSession } from "./auth";

export interface PublicConfig {
  /** Display currency symbol shown to customers — always "$" per brand. */
  currencySymbol: string;
  /** Default tag price in major units (e.g. 150 for $150). */
  tagPrice: number;
  /** Extra charge when the customer opts in to our 1-month coverage. */
  insuranceOptInPrice: number;
  /** Public key for the payment processor SDK. */
  paystackPublicKey: string;
  /** Currency the processor will actually charge in. */
  paystackCurrency: string;
  /** Renewal cycle length in days (default 28). */
  renewalPeriodDays: number;
  /** 2-letter US state codes accepted by the form. */
  supportedStates: string[];
  /** True when /qwertyuiop simulation is available. */
  testModeEnabled: boolean;
}

export interface StateInfo {
  code: string;
  autoTag: boolean;
  insuranceAvailable: boolean;
  headline: string;
  body: string;
}

export interface OrderDocuments {
  state: string | null;
  hasTag: boolean;
  hasInsurance: boolean;
  plate?: string | null;
  policyNumber?: string | null;
  instructions?: string | null;
}

export interface UserAccount {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  renewalEnabled: boolean;
  createdAt: string;
  lastReminderAt: string | null;
  nextRenewalDueAt: string | null;
}

export interface OrderRecord {
  id: string;
  reference: string;
  userId: string;
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
  source?: "checkout" | "renewal";
  state?: string;
  address?: string;
  city?: string;
  zip?: string;
  vin?: string;
  year?: string;
  make?: string;
  model?: string;
  color?: string;
  body?: string;
  insuranceCompany?: string;
  insurancePolicy?: string;
  insuranceOptIn?: boolean;
  stateInfo?: StateInfo;
  documents?: OrderDocuments | null;
}

export interface TagDetailsInput {
  state: string;
  address: string;
  city: string;
  zip: string;
  vin: string;
  year: string;
  make: string;
  model: string;
  color: string;
  bodyType?: string;
  plate?: string;
  insuranceCompany?: string;
  insurancePolicy?: string;
  insuranceExp?: string;
  insuranceOptIn: boolean;
}

export interface InitCheckoutBody extends TagDetailsInput {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  notes?: string;
}

export interface SimulatePurchaseResponse {
  order: OrderRecord;
  documents: OrderDocuments;
  sessionToken: string;
  user: UserAccount;
  simulated: true;
}

export interface InitCheckoutResponse {
  reference: string;
  authorizationUrl: string;
  accessCode: string;
  /** Session token for the auto-created account. Store in localStorage. */
  sessionToken: string;
  user: UserAccount;
}

export interface AdminUserView extends UserAccount {
  ordersCount: number;
  lastPaidAt: string | null;
  totalSpent: number;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  opts: { adminPassword?: string; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.headers) Object.assign(headers, init.headers as Record<string, string>);
  if (opts.adminPassword) headers["X-Admin-Password"] = opts.adminPassword;
  if (opts.auth) {
    const tok = getSession();
    if (tok) headers["Authorization"] = `Bearer ${tok}`;
  }
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
  // Public ---------------------------------------------------------------
  getConfig: () => request<PublicConfig>("/api/config"),

  initCheckout: (body: InitCheckoutBody) =>
    request<InitCheckoutResponse>("/api/checkout/init", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  verify: (reference: string) =>
    request<OrderRecord>(`/api/checkout/verify?reference=${encodeURIComponent(reference)}`),

  // Auth -----------------------------------------------------------------
  requestMagicLink: (email: string) =>
    request<{ ok: true }>("/api/auth/magic-link", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  consumeToken: (token: string) =>
    request<{ sessionToken: string; user: UserAccount }>(
      `/api/auth/consume?token=${encodeURIComponent(token)}`,
    ),

  // Authed ---------------------------------------------------------------
  getAccount: () =>
    request<{ user: UserAccount; orders: OrderRecord[] }>("/api/account", {}, { auth: true }),

  setRenewal: (enabled: boolean) =>
    request<{ user: UserAccount }>(
      "/api/account/renewal",
      { method: "POST", body: JSON.stringify({ enabled }) },
      { auth: true },
    ),

  startRenewal: () =>
    request<{ reference: string; authorizationUrl: string; accessCode: string; amount: number }>(
      "/api/account/renew",
      { method: "POST" },
      { auth: true },
    ),

  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }, { auth: true }),

  // Admin ----------------------------------------------------------------
  adminLogin: (password: string) =>
    request<{ ok: true }>("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  adminOrders: (password: string) =>
    request<{ orders: OrderRecord[] }>("/api/admin/orders", { method: "GET" }, { adminPassword: password }),

  adminFulfill: (id: string, password: string) =>
    request<OrderRecord>(`/api/admin/orders/${id}/fulfill`, { method: "POST" }, { adminPassword: password }),

  adminUsers: (password: string) =>
    request<{ users: AdminUserView[] }>("/api/admin/users", {}, { adminPassword: password }),

  adminSendReminder: (id: string, password: string) =>
    request<{ ok: true; sent: boolean; reason?: string }>(
      `/api/admin/users/${id}/send-reminder`,
      { method: "POST" },
      { adminPassword: password },
    ),

  // Test mode -----------------------------------------------------------
  simulatePurchase: (body: InitCheckoutBody) =>
    request<SimulatePurchaseResponse>("/api/test/simulate-purchase", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Documents -----------------------------------------------------------
  /**
   * Fetch an order document as a Blob and return an object URL that can be
   * passed to `window.open(...)` or used as `<a href>`. Caller is responsible
   * for `URL.revokeObjectURL(url)` when done. Requires an active session.
   */
  fetchDocumentObjectUrl: async (
    orderId: string,
    kind: "tag" | "insurance",
    opts: { download?: boolean } = {},
  ): Promise<string> => {
    const tok = getSession();
    if (!tok) throw new Error("Sign in to download your documents.");
    const path = `/api/documents/${encodeURIComponent(orderId)}/${kind}${opts.download ? "?download=1" : ""}`;
    const res = await fetch(path, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (!res.ok) {
      let msg = res.statusText || `HTTP_${res.status}`;
      try {
        const data = await res.json();
        if (data?.error) msg = data.error;
      } catch {
        /* no body */
      }
      throw new Error(msg);
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
};

