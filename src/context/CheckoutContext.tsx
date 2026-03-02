import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type DeliveryMethod = "email" | "driver" | "overnight_fedex";
export type DeliverySlot = "1hr" | "2hr" | "scheduled";
export type ProductChoice = "tag_only" | "insurance_monthly" | "insurance_yearly";

export interface CheckoutState {
  deliveryMethod: DeliveryMethod;
  deliveryEmail: string;
  deliverySlot: DeliverySlot;
  deliveryScheduledAt: string; // ISO string for scheduled
  deliveryAddress: string;
  deliveryPhone: string;
  productChoice: ProductChoice;
}

const STORAGE_KEY = "tristatetags_checkout";

const defaultState: CheckoutState = {
  deliveryMethod: "email",
  deliveryEmail: "",
  deliverySlot: "1hr",
  deliveryScheduledAt: "",
  deliveryAddress: "",
  deliveryPhone: "",
  productChoice: "tag_only",
};

function loadState(): CheckoutState {
  try {
    const s = sessionStorage.getItem(STORAGE_KEY);
    if (s) return { ...defaultState, ...JSON.parse(s) };
  } catch {}
  return defaultState;
}

function saveState(state: CheckoutState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

const CheckoutContext = createContext<{
  state: CheckoutState;
  update: (partial: Partial<CheckoutState>) => void;
  clear: () => void;
} | null>(null);

export function CheckoutProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CheckoutState>(loadState);

  const update = useCallback((partial: Partial<CheckoutState>) => {
    setState((prev) => {
      const next = { ...prev, ...partial };
      saveState(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setState(defaultState);
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <CheckoutContext.Provider value={{ state, update, clear }}>
      {children}
    </CheckoutContext.Provider>
  );
}

export function useCheckout() {
  const ctx = useContext(CheckoutContext);
  if (!ctx) throw new Error("useCheckout must be used within CheckoutProvider");
  return ctx;
}
