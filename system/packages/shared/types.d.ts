/**
 * Shared domain types for the tags / insurance / dispatch system.
 * These mirror the unified Supabase schema (see supabase/migrations).
 */

export type OrderStatus = "pending" | "paid" | "failed";
export type DeliveryStatus = "assigned" | "accepted" | "delivered" | "cancelled";
export type TxnSource = "tag" | "insurance";
export type TxnStatus = "paid" | "refunded" | "failed" | "pending";

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  renewalEnabled: boolean;
  createdAt: string;
  nextRenewalDueAt?: string | null;
}

export interface Order {
  id: string;
  reference: string;
  userId: string;
  status: OrderStatus;
  state?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  address2?: string;
  city?: string;
  zip?: string;
  vin?: string;
  year?: string;
  make?: string;
  model?: string;
  color?: string;
  body?: string;
  insuranceOptIn: boolean;
  insuranceCompany?: string;
  insurancePolicy?: string;
  notes?: string;
  plate?: string;
  price?: number;
  paidAt?: string | null;
  renewalDueAt?: string | null;
  tagPdfPath?: string | null;
  insurancePdfPath?: string | null;
  deliveryMethod?: "email" | "driver" | "fedex";
  deliveryEmail?: string;
  deliveryAddress?: string;
  // Telegram dispatch bookkeeping
  telegramSent?: boolean;
  telegramAcceptedBy?: string | null;
  telegramAcceptedAt?: string | null;
  telegramClaimMessageIds?: Record<string, number>;
}

export interface Driver {
  id: string;
  name: string;
  email: string;
  telegramId: string;
  active: boolean;
}

export interface Supervisor {
  id: string;
  name: string;
  telegramId: string;
  active: boolean;
}

export interface Delivery {
  id: string;
  orderId: string;
  driverId: string | null;
  status: DeliveryStatus;
  acceptedAt?: string | null;
  deliveredAt?: string | null;
  receiptPath?: string | null;
}

export interface Transaction {
  id: string;
  source: TxnSource;
  stripeId?: string;
  amountCents: number;
  status: TxnStatus;
  userId?: string;
  orderId?: string;
  policyId?: string;
  createdAt: string;
}

/** Fields OpenAI extracts from a pasted/uploaded lead. */
export interface ParsedTagInfo {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  vin?: string;
  year?: string;
  make?: string;
  model?: string;
  color?: string;
  body?: string;
  insuranceCompany?: string;
  policyNumber?: string;
  notes?: string;
}
