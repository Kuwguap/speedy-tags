const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, "")}/api`
  : "/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("admin_token");
  const url = path.startsWith("/") ? `${API_BASE}${path}` : `${API_BASE}/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
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
  createOrder: (order: Record<string, unknown>) =>
    request<{ id: string }>("/orders", { method: "POST", body: JSON.stringify(order) }),
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
};

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
