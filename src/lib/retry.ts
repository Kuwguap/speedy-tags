/**
 * Resilient async retry helper for the checkout flow.
 *
 * Networks on mobile drop, Stripe redirects, customers tap-and-hold, etc.
 * Without retries a single transient failure on the post-payment "save tag
 * info" call leaves the customer paid-but-not-finished, which is the #1
 * source of disputes. This wraps any async function with exponential
 * backoff and jitter and surfaces a recoverable error instead of failing
 * silently.
 */

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Called with (error, attempt) after each failed attempt that will be retried. */
  onRetry?: (err: unknown, attempt: number) => void;
  /** Return false to skip retries and bail out (e.g. user cancelled). */
  shouldRetry?: (err: unknown) => boolean;
  /** Abort signal so callers can cancel long retry chains. */
  signal?: AbortSignal;
}

const DEFAULTS: Required<Pick<RetryOptions, "attempts" | "baseDelayMs" | "maxDelayMs">> = {
  attempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
};

function isAbortError(err: unknown): boolean {
  return (
    err instanceof DOMException && err.name === "AbortError"
  ) || (
    err instanceof Error && err.name === "AbortError"
  );
}

export async function retryAsync<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const cfg = { ...DEFAULTS, ...opts };
  let lastErr: unknown = new Error("retryAsync called with attempts <= 0");
  for (let i = 0; i < cfg.attempts; i++) {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (isAbortError(err)) throw err;
      if (opts.shouldRetry && !opts.shouldRetry(err)) throw err;
      const last = i === cfg.attempts - 1;
      if (last) break;
      opts.onRetry?.(err, i + 1);
      const exp = Math.min(cfg.maxDelayMs, cfg.baseDelayMs * 2 ** i);
      const jitter = Math.floor(Math.random() * Math.min(500, exp / 2));
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, exp + jitter);
        opts.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      });
    }
  }
  throw lastErr;
}

/**
 * Generate a 22-char URL-safe random token. Used for the lead/checkout token
 * when no server-issued one is available yet (rare race condition).
 */
export function makeLeadToken(): string {
  const arr = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}
