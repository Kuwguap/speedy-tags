/** Krab dispatch API client (same auth as /backend). */

const DEFAULT_API_BASE = "https://krab-dispatch-api.onrender.com";
const PASSWORD_KEY = "krab_admin_password";
const API_BASE_KEY = "krab_api_base";

function isLocalHost(hostname: string): boolean {
  const h = String(hostname || "").toLowerCase();
  if (!h || h === "localhost" || h === "127.0.0.1") return true;
  if (h.endsWith(".local")) return true;
  if (/^192\.168\.\d+\.\d+$/.test(h)) return true;
  return false;
}

function isProductionWebHost(hostname: string): boolean {
  const h = String(hostname || "").toLowerCase();
  return (
    h === "tristatetags.com" ||
    h === "www.tristatetags.com" ||
    h === "tristatetag.com" ||
    h === "www.tristatetag.com" ||
    h.endsWith(".vercel.app")
  );
}

export function resolveDispatchApiBase(): string {
  let stored = "";
  try {
    stored = (localStorage.getItem(API_BASE_KEY) || "").trim();
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    const { hostname, protocol, origin } = window.location;
    const originBase = origin.replace(/\/+$/, "");
    const proxied = `${originBase}/api/dispatch`;
    if (protocol === "https:" && isProductionWebHost(hostname)) {
      if (
        !stored ||
        stored.includes("krab-dispatch-api.onrender.com") ||
        stored.includes("onrender.com")
      ) {
        return proxied;
      }
    }
    if (stored.startsWith("http")) return stored.replace(/\/+$/, "");
    if (isLocalHost(hostname)) return originBase;
  } else if (stored.startsWith("http")) {
    return stored.replace(/\/+$/, "");
  }
  return import.meta.env.VITE_DISPATCH_API_URL?.replace(/\/+$/, "") || DEFAULT_API_BASE;
}

export function getDispatchPassword(): string {
  try {
    return String(localStorage.getItem(PASSWORD_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function setDispatchPassword(pw: string): void {
  localStorage.setItem(PASSWORD_KEY, pw);
}

export function clearDispatchPassword(): void {
  localStorage.removeItem(PASSWORD_KEY);
}

export async function dispatchFetch<T = unknown>(
  path: string,
  opts: RequestInit = {}
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const pw = getDispatchPassword();
  if (!pw) return { ok: false, status: 0, error: "NO_PASSWORD" };

  const base = resolveDispatchApiBase();
  const headers: Record<string, string> = {
    "X-Admin-Password": pw,
    ...(opts.headers as Record<string, string>),
  };

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...opts, headers });
  } catch (e) {
    return { ok: false, status: 0, error: `NETWORK: ${(e as Error).message}` };
  }

  if (res.status === 401) return { ok: false, status: 401, error: "UNAUTHORIZED" };
  if (!res.ok) return { ok: false, status: res.status, error: `HTTP_${res.status}` };

  try {
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, status: res.status, error: "BAD_JSON" };
  }
}

export async function validateDispatchPassword(pw: string): Promise<boolean> {
  const base = resolveDispatchApiBase();
  try {
    const res = await fetch(`${base}/transactions/full?limit=1`, {
      headers: { "X-Admin-Password": pw },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchAllTransactions(period = "1m"): Promise<unknown[]> {
  const all: unknown[] = [];
  const pageSize = 500;
  let offset = 0;
  while (all.length < 15000) {
    const res = await dispatchFetch<unknown[]>(
      `/transactions/full?limit=${pageSize}&offset=${offset}&period=${period}`
    );
    if (!res.ok) throw new Error(res.error);
    const page = Array.isArray(res.data) ? res.data : [];
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}
