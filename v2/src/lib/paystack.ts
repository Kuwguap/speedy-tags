/**
 * Loads the Paystack inline JS once and resolves with the global PaystackPop.
 * Using the hosted authorization URL is also supported by the API, but inline
 * keeps the customer on our domain end-to-end.
 */

declare global {
  interface Window {
    PaystackPop?: {
      setup: (opts: PaystackSetupOptions) => { openIframe: () => void };
    };
  }
}

interface PaystackSetupOptions {
  key: string;
  email: string;
  amount: number; // in lowest currency unit (cents/kobo)
  currency: string;
  ref: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
  callback: (response: { reference: string }) => void;
  onClose: () => void;
}

let scriptPromise: Promise<void> | null = null;

function loadPaystackScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.PaystackPop) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Failed to load Paystack"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

interface OpenPaystackArgs {
  publicKey: string;
  email: string;
  amount: number; // major units e.g. 150
  currency: string;
  reference: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

/**
 * Opens the Paystack inline popup. Resolves with the reference on success,
 * rejects on close. Amount must be in major units; we convert to lowest unit.
 */
export async function openPaystackPopup(args: OpenPaystackArgs): Promise<string> {
  await loadPaystackScript();
  if (!window.PaystackPop) throw new Error("Paystack failed to initialize");
  return new Promise((resolve, reject) => {
    const handle = window.PaystackPop!.setup({
      key: args.publicKey,
      email: args.email,
      amount: Math.round(args.amount * 100),
      currency: args.currency,
      ref: args.reference,
      firstname: args.firstName,
      lastname: args.lastName,
      phone: args.phone,
      callback: (resp) => resolve(resp.reference),
      onClose: () => reject(new Error("PAYMENT_CANCELLED")),
    });
    handle.openIframe();
  });
}
