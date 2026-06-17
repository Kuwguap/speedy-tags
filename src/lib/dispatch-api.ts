/** Krab dispatch API client (same auth as /backend). */

const DEFAULT_API_BASE = "https://krab-dispatch-api.onrender.com";
const RENDER_DISPATCH_PROXY = (
  import.meta.env.VITE_SPEEDY_TAGS_API || "https://speedy-tags-api.onrender.com"
).replace(/\/+$/, "");
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

function dispatchFallbackBases(primary: string): string[] {
  const bases = [primary];
  if (primary.includes("/api/dispatch") && !primary.includes("onrender.com")) {
    bases.push(`${RENDER_DISPATCH_PROXY.replace(/\/+$/, "")}/api/dispatch`);
  }
  return bases;
}

async function dispatchFetchOnce<T>(
  base: string,
  path: string,
  opts: RequestInit,
  pw: string
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
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

  const parsed = await parseJsonResponse<T>(res);
  if (!parsed.ok) return { ok: false, status: res.status, error: parsed.error };
  return { ok: true, data: parsed.data };
}

/** Rolling windows accepted by krab-dispatch-api `/transactions/full`. */
export const DISPATCH_TXN_PERIODS = ["1w", "2w", "3w", "1m", "3m", "6m", "12m", "all"] as const;
export type DispatchTxnPeriod = (typeof DISPATCH_TXN_PERIODS)[number];

export const DEFAULT_TXN_PERIOD: DispatchTxnPeriod = "3m";

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

async function parseJsonResponse<T>(res: Response): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const text = await res.text();
  if (!text.trim()) {
    return { ok: false, error: "EMPTY_RESPONSE" };
  }
  if (text.trimStart().startsWith("<")) {
    return { ok: false, error: "HTML_RESPONSE" };
  }
  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return { ok: false, error: "BAD_JSON" };
  }
}

export async function dispatchFetch<T = unknown>(
  path: string,
  opts: RequestInit = {}
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const pw = getDispatchPassword();
  if (!pw) return { ok: false, status: 0, error: "NO_PASSWORD" };

  const bases = dispatchFallbackBases(resolveDispatchApiBase());
  let last: { ok: false; status: number; error: string } = {
    ok: false,
    status: 0,
    error: "NETWORK: failed",
  };
  for (const base of bases) {
    const result = await dispatchFetchOnce<T>(base, path, opts, pw);
    if (result.ok) return result;
    last = result;
    const retryable =
      result.error === "BAD_JSON" ||
      result.error === "EMPTY_RESPONSE" ||
      result.error === "HTML_RESPONSE" ||
      result.error.startsWith("NETWORK:");
    if (!retryable) return result;
  }
  return last;
}

export async function validateDispatchPassword(pw: string): Promise<boolean> {
  const bases = dispatchFallbackBases(resolveDispatchApiBase());
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/transactions/full?limit=1&period=1w`, {
        headers: { Accept: "application/json", "X-Admin-Password": pw },
      });
      if (!res.ok) continue;
      const parsed = await parseJsonResponse<unknown[]>(res);
      if (parsed.ok) return true;
    } catch {
      // try next base
    }
  }
  return false;
}

export async function fetchAllTransactions(period: DispatchTxnPeriod = DEFAULT_TXN_PERIOD): Promise<unknown[]> {
  const all: unknown[] = [];
  const pageSize = 100;
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
